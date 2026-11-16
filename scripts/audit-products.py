"""Inspect pinned public raster products; never manufacture a geotechnical score."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import urllib.request

import numpy as np
import rasterio
from rasterio.windows import from_bounds
from goes import read_goes_pixels

ROOT = Path(__file__).resolve().parent.parent
BBOX = [-78.46, -0.74, -78.28, -0.57]
PRODUCTS = {
    "licsar": {
        "url": "https://dap.ceda.ac.uk/neodc/comet/data/licsar_products/142/142D_09148_131313/20250526_20250607/20250526_20250607.geo.cc.tif?download=1",
        "filename": "20250526_20250607.geo.cc.tif",
        "bytes": 12113454,
        "md5": "03f422c96677d579bc57011695773c8e",
        "sha256": "8e509e36001da25421c57e220656f33b697daa1c1d5052810f8a1d2ae6340154",
        "license": "https://dap.ceda.ac.uk/neodc/comet/data/licsar_products/00README_catalogue_and_licence.txt",
        "citation": "Lazecky, M.; Maghsoudi, Y. (2022): LiCSAR interferometry products. NERC EDS Centre for Environmental Data Analysis. https://catalogue.ceda.ac.uk/uuid/52cda2e0e6c04272ae15ac836c1e8493 (consultado 2026-11-14).",
        "acknowledgement": "LiCSAR contains modified Copernicus Sentinel data 2025 analysed by the Centre for the Observation and Modelling of Earthquakes, Volcanoes and Tectonics (COMET). LiCSAR uses JASMIN, the UK's collaborative data analysis environment (https://jasmin.ac.uk).",
    },
    "goes": {
        "url": "https://noaa-goes19.s3.amazonaws.com/ABI-L2-LSTF/2026/318/17/OR_ABI-L2-LSTF-M6_G19_s20263181700208_e20263181709516_c20263181714061.nc",
        "filename": "goes19-2026318-1700-lst.nc",
        "bytes": 736357,
        "sha256": "ece56e5f3156338eab1475c264278e03563f8dfae76ab1370866ccbafd469991",
        "license": "https://registry.opendata.aws/noaa-goes/",
    },
}


def download(product):
    cache = ROOT / ".data-cache"
    cache.mkdir(exist_ok=True)
    path = cache / product["filename"]
    if not path.exists():
        request = urllib.request.Request(product["url"], headers={"User-Agent": "UrkuSAR-research-audit/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read(product["bytes"] + 1)
        if len(data) != product["bytes"]:
            raise ValueError("Unexpected product size; update manifest only after provider review")
        path.write_bytes(data)
    data = path.read_bytes()
    if len(data) != product["bytes"]:
        raise ValueError("Cached product is truncated or changed")
    if product.get("md5") and hashlib.md5(data).hexdigest() != product["md5"]:
        raise ValueError("Product does not match the provider checksum")
    digest = hashlib.sha256(data).hexdigest()
    if digest != product["sha256"]:
        raise ValueError("SHA256 changed: review product version before reusing it")
    return path, digest


def coherence_summary(path):
    with rasterio.open(path) as src:
        if src.crs != rasterio.crs.CRS.from_epsg(4326):
            raise ValueError("Expected WGS84 geographic coordinates")
        covered = src.bounds.left <= BBOX[0] and src.bounds.bottom <= BBOX[1] and src.bounds.right >= BBOX[2] and src.bounds.top >= BBOX[3]
        if not covered:
            raise ValueError("LiCSAR raster does not cover the complete Cotopaxi study extent")
        values = src.read(1, window=from_bounds(*BBOX, transform=src.transform).round_offsets().round_lengths(), masked=True)
        valid = values.compressed()
        if src.dtypes[0] != "uint8":
            raise ValueError("Unexpected coherence encoding")
        normalized = valid.astype(float) / 255
        return {"frame": "142D_09148_131313", "referenceDate": "2025-05-26", "secondaryDate": "2025-06-07", "type": "coherence-only", "crs": src.crs.to_string(), "bounds": list(src.bounds), "coversStudyArea": covered, "pixelSizeDegrees": list(src.res), "sampleCount": int(values.size), "validSamples": int(valid.size), "nodata": src.nodata, "scale": "uint8 / 255; dimensionless, NOT displacement", "coherenceMin": float(normalized.min()) if valid.size else None, "coherenceMedian": float(np.median(normalized)) if valid.size else None, "coherenceMax": float(normalized.max()) if valid.size else None}


def thermal_summary(path):
    data = read_goes_pixels(path, BBOX)
    samples = [p["temperatureK"] for p in data["pixels"] if p["temperatureK"] is not None]
    metadata = {key: data[key] for key in ["variable", "unit", "timeStart", "timeEnd", "spatialResolution", "dqfMeanings", "dqfValues"]}
    return {"type": "land-surface-temperature", **metadata, "sampleCount": len(data["pixels"]), "highQualitySamples": len(samples), "dqfRule": "Pixel center in study bbox; DQF == 0, unmasked finite LST; no cloud filling", "temperatureKMin": min(samples) if samples else None, "temperatureKMax": max(samples) if samples else None, "anomalyC": None, "baselineStatus": "not-established"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, help="Optional generated audit JSON (not a risk dataset)")
    args = parser.parse_args()
    products = {}
    for key, product in PRODUCTS.items():
        path, digest = download(product)
        summary = coherence_summary(path) if key == "licsar" else thermal_summary(path)
        products[key] = {**summary, "url": product["url"], "sha256": digest, "bytes": product["bytes"], "license": product["license"], "citation": product.get("citation", "NOAA GOES-19 ABI-L2-LSTF, NOAA Open Data Dissemination, archivo 2026-11-14 17:00 UTC."), "acknowledgement": product.get("acknowledgement", "Datos NOAA abiertos; su uso no implica respaldo de NOAA a UrkuSAR.")}
    result = {"schemaVersion": "1.0.0", "checkedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"), "bbox": BBOX, "products": products, "eligibleForRiskIndex": False, "blockers": ["El raster LiCSAR inspeccionado mide coherencia, no desplazamiento LOS; no se han validado referencia de fase ni corrección atmosférica.", "El par SAR es de 2025 y la observación térmica de 2026; no hay correspondencia temporal.", "No hay línea base térmica ni serie de persistencia; una muestra LST no es una anomalía.", "No hay calibración ni aprobación geotécnica profesional."], "scope": "Productos binarios públicos inspeccionados localmente; no es un diagnóstico de peligro."}
    if products["goes"]["highQualitySamples"] == 0:
        result["blockers"].append("Ningún píxel térmico del área cumple DQF=0 en este archivo; no se rellenan valores ausentes.")
    text = json.dumps(result, indent=2, allow_nan=False)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
