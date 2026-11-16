"""Bounded NOAA series audit for the archived Cotopaxi SAR interval."""
import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from goes import read_goes_pixels
from thermal_series import analyze_thermal_series, days

ROOT = Path(__file__).resolve().parent.parent
HOST = "https://noaa-goes19.s3.amazonaws.com/"
NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
MAX_BYTES = 4 * 1024 * 1024


def request_bytes(url, limit):
    request = urllib.request.Request(url, headers={"User-Agent": "UrkuSAR-thermal-series/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        content = response.read(limit + 1)
    if len(content) > limit:
        raise ValueError("Remote response exceeded the configured size limit")
    return content


def discover(day, hour):
    when = date.fromisoformat(day)
    prefix = f"ABI-L2-LSTF/{when.year}/{when.timetuple().tm_yday:03d}/{hour:02d}/"
    listing = HOST + "?" + urllib.parse.urlencode({"list-type": 2, "prefix": prefix, "max-keys": 5})
    root = ET.fromstring(request_bytes(listing, 128 * 1024))
    if root.findtext("s3:IsTruncated", namespaces=NS) != "false":
        raise ValueError("Ambiguous/truncated listing; do not silently select a product")
    entries = root.findall("s3:Contents", NS)
    if not entries:
        return {"date": day, "status": "missing", "listing": listing}
    if len(entries) != 1:
        raise ValueError("Expected exactly one scan per hour; review product versions")
    item = entries[0]
    key = item.findtext("s3:Key", namespaces=NS)
    if not key or not key.startswith(prefix) or not key.endswith(".nc"):
        raise ValueError("Unexpected NOAA product key")
    return {"date": day, "status": "available", "url": HOST + key, "bytes": int(item.findtext("s3:Size", namespaces=NS)), "etag": item.findtext("s3:ETag", namespaces=NS).strip('"')}


def cached_product(source):
    url = urllib.parse.urlparse(source["url"])
    if url.scheme != "https" or url.netloc != "noaa-goes19.s3.amazonaws.com" or not url.path.startswith("/ABI-L2-LSTF/") or not url.path.endswith(".nc") or url.query or url.fragment:
        raise ValueError("Replay accepts only public NOAA GOES-19 LST product URLs")
    size = source["bytes"]
    if not isinstance(size, int) or not 0 < size <= MAX_BYTES:
        raise ValueError("Product size exceeds the per-file download limit")
    cache = ROOT / ".data-cache" / "thermal-series"
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / (hashlib.sha256(source["url"].encode()).hexdigest() + ".nc")
    content = path.read_bytes() if path.exists() else request_bytes(source["url"], size)
    if len(content) != size:
        raise ValueError("Truncated or changed NOAA product")
    digest = hashlib.sha256(content).hexdigest()
    if source.get("sha256") and source["sha256"] != digest:
        raise ValueError("Replay checksum mismatch")
    if re.fullmatch(r"[a-fA-F0-9]{32}", source.get("etag", "")) and hashlib.md5(content).hexdigest() != source["etag"].lower():
        raise ValueError("NOAA ETag checksum mismatch")
    if not path.exists():
        path.write_bytes(content)
    return path, digest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--replay", type=Path, help="Re-read the exact product URLs/hashes in an earlier result")
    args = parser.parse_args()
    sar = json.loads((ROOT / "src/data/product-audit.json").read_text(encoding="utf-8"))
    bbox = sar["bbox"]
    start, end = sar["products"]["licsar"]["referenceDate"], sar["products"]["licsar"]["secondaryDate"]
    base_end = (date.fromisoformat(start) - timedelta(days=1)).isoformat()
    base_start = (date.fromisoformat(start) - timedelta(days=28)).isoformat()
    minimum, threshold, hour = 7, 2.0, 17
    replay = json.loads(args.replay.read_text(encoding="utf-8")) if args.replay else None
    if replay and (replay["bbox"] != bbox or replay["method"]["periodStart"] != start or replay["method"]["periodEnd"] != end or replay["method"]["baselineStart"] != base_start or replay["method"]["baselineEnd"] != base_end or replay["method"]["hourUTC"] != hour or replay["method"]["minimumBaselineDays"] != minimum or replay["method"]["thresholdC"] != threshold):
        raise ValueError("Replay method differs from the archived SAR interval or current protocol")
    dates = days(base_start, base_end) + days(start, end)
    if len(dates) > 62:
        raise ValueError("Audit is limited to 62 daily files")
    if replay and [s["date"] for s in replay["sources"]] != dates:
        raise ValueError("Replay manifest must contain each expected date in order")
    records, sources = [], []
    for index, day in enumerate(dates):
        source = {"date": day}
        try:
            source = dict(replay["sources"][index]) if replay else discover(day, hour)
            if source["status"] == "available":
                if replay and not re.fullmatch(r"[a-f0-9]{64}", source.get("sha256", "")):
                    raise ValueError("Replay source lacks a valid SHA-256")
                path, digest = cached_product(source)
                data = read_goes_pixels(path, bbox, expected_date=day, expected_hour=hour)
                records.append({"date": day, "status": "available", **data})
                source.update({"sha256": digest, "acquiredAt": data["timeStart"], "highQualityPixels": sum(p["temperatureK"] is not None for p in data["pixels"])})
            else:
                if source["status"] not in ("missing", "unavailable"):
                    raise ValueError("Unknown source status")
                records.append({"date": day, "status": source["status"]})
        except (urllib.error.URLError, TimeoutError) as error:
            if replay:
                raise RuntimeError("Replay cannot reproduce a product; no replacement is inferred") from error
            source = {**source, "date": day, "status": "unavailable", "error": "Remote acquisition failed; not evidence of no thermal signal"}
            records.append(source.copy())
        sources.append(source)
        print(f"{index + 1}/{len(dates)} {day}: {source['status']}, QA pixels={source.get('highQualityPixels', 'n/a')}", flush=True)
    result = analyze_thermal_series(records, base_start, base_end, start, end, minimum, threshold, hour)
    result.update({"schemaVersion": "1.0.0", "checkedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"), "bbox": bbox, "platform": "NOAA GOES-19", "product": "ABI-L2-LSTF", "spatialResolution": next((r["spatialResolution"] for r in records if r["status"] == "available"), None), "sources": sources, "retrievalComplete": all(s["status"] == "available" for s in sources), "sarContext": {"frame": sar["products"]["licsar"]["frame"], "referenceDate": start, "secondaryDate": end, "type": "coherence-only", "url": sar["products"]["licsar"]["url"]}, "limitations": ["Comparación exploratoria a escala de píxel GOES (~10 km), no por polígono geotécnico.", "La mediana de 28 días a la misma hora no es una climatología ni una atribución volcánica.", "Mínimo de 7 días válidos y umbral de 2 °C son parámetros de investigación, no calibrados.", "Faltan desplazamiento LOS con referencia/QA, calibración y validación profesional; no se modifica el índice sintético.", "Los días sin medición válida interrumpen las rachas; no demuestran ausencia de calentamiento."], "citation": "NOAA GOES-19 ABI-L2-LSTF, NOAA Open Data Dissemination. https://registry.opendata.aws/noaa-goes/ . El uso no implica respaldo de NOAA a UrkuSAR."})
    if replay:
        actual = {key: value for key, value in result.items() if key != "checkedAt"}
        expected = {key: value for key, value in replay.items() if key != "checkedAt"}
        if actual != expected:
            raise ValueError("Replay results differ from archived evidence; review before replacing it")
    if args.output:
        args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({**{key: result[key] for key in ["pixelCount", "baselineEligiblePixels", "comparedObservations", "retrievalComplete", "eligibleForRiskIndex"]}, "replayVerified": bool(replay)}))


if __name__ == "__main__":
    main()
