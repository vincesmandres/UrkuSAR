"""Experimental within-pixel thermal reference, not a hazard classifier."""
from datetime import date, datetime, timedelta
import math
from statistics import median


def days(start, end):
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    if first.isoformat() != start or last.isoformat() != end or first > last:
        raise ValueError("Invalid ordered ISO date interval")
    return [(first + timedelta(days=offset)).isoformat() for offset in range((last - first).days + 1)]


def analyze_thermal_series(records, baseline_start, baseline_end, period_start, period_end, min_baseline_days=7, threshold_c=2.0, hour_utc=17):
    baseline_dates, period_dates = days(baseline_start, baseline_end), days(period_start, period_end)
    if baseline_end >= period_start or isinstance(min_baseline_days, bool) or not isinstance(min_baseline_days, int) or not 1 <= min_baseline_days <= len(baseline_dates):
        raise ValueError("Reference must precede analysis and have a valid minimum sample count")
    if isinstance(threshold_c, bool) or not isinstance(threshold_c, (int, float)) or not math.isfinite(threshold_c) or threshold_c <= 0:
        raise ValueError("Positive finite illustrative threshold required")
    if isinstance(hour_utc, bool) or not isinstance(hour_utc, int) or not 0 <= hour_utc <= 23:
        raise ValueError("Invalid UTC hour")
    expected = set(baseline_dates + period_dates)
    by_date = {}
    grid = None
    centers = None
    for record in records:
        day = record["date"]
        if day not in expected or day in by_date:
            raise ValueError("Duplicate or unexpected acquisition date")
        by_date[day] = record
        if record["status"] in ("missing", "unavailable"):
            if record.get("pixels"):
                raise ValueError("Unavailable acquisitions cannot contain observations")
            continue
        if record["status"] != "available" or record.get("platform") != "G19" or record.get("unit") != "K":
            raise ValueError("Expected available GOES-19 Kelvin observations")
        acquired = datetime.fromisoformat(record["timeStart"].replace("Z", "+00:00"))
        if acquired.tzinfo is None or acquired.utcoffset().total_seconds() != 0 or acquired.date().isoformat() != day or acquired.hour != hour_utc or acquired.minute != 0:
            raise ValueError("Acquisitions must match date and UTC scan hour")
        if not record.get("gridSignature") or not record["pixels"]:
            raise ValueError("Spatial identity is required")
        positions = {p["id"]: (p["latitude"], p["longitude"]) for p in record["pixels"]}
        if len(positions) != len(record["pixels"]) or any(not math.isfinite(v) for pair in positions.values() for v in pair) or any(not (-90 <= lat <= 90 and -180 <= lon <= 180) for lat, lon in positions.values()):
            raise ValueError("Invalid or duplicate pixel centers")
        if centers is None:
            centers, grid = positions, record["gridSignature"]
        if record["gridSignature"] != grid or positions != centers:
            raise ValueError("Cannot combine different grids or pixel centers")
        for p in record["pixels"]:
            value = p["temperatureK"]
            if value is not None and (p.get("dqf") != 0 or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0):
                raise ValueError("Only valid DQF=0 temperatures may enter the reference")
    if set(by_date) != expected:
        raise ValueError("Missing calendar dates must be explicit records, not silently omitted")
    pixels = []
    for pixel_id, (latitude, longitude) in (centers or {}).items():
        def temperature(day):
            record = by_date[day]
            if record["status"] != "available":
                return None
            return next(p["temperatureK"] for p in record["pixels"] if p["id"] == pixel_id)
        baseline = [temperature(day) for day in baseline_dates if temperature(day) is not None]
        eligible = len(baseline) >= min_baseline_days
        reference = median(baseline) if eligible else None
        mad = median(abs(value - reference) for value in baseline) if eligible else None
        observations, run, longest, exceeded = [], 0, 0, 0
        for day in period_dates:
            value = temperature(day)
            anomaly = value - reference if reference is not None and value is not None else None
            if anomaly is not None and anomaly > threshold_c:
                run += 1
                exceeded += 1
            else:
                run = 0
            longest = max(longest, run)
            status = by_date[day]["status"] if by_date[day]["status"] != "available" else "quality-rejected" if value is None else "insufficient-baseline" if reference is None else "compared"
            observations.append({"date": day, "temperatureK": value, "anomalyC": anomaly, "status": status})
        compared = sum(o["anomalyC"] is not None for o in observations)
        pixels.append({"id": pixel_id, "latitude": latitude, "longitude": longitude, "baselineValidDays": len(baseline), "baselineMedianK": reference, "baselineMadK": mad, "baselineStatus": "sufficient-for-exploration" if eligible else "insufficient-data", "analysisValidDays": sum(o["temperatureK"] is not None for o in observations), "comparedDays": compared, "aboveThresholdDays": exceeded if compared else None, "longestObservedRunDays": longest if compared else None, "observations": observations})
    return {"method": {"baselineStart": baseline_start, "baselineEnd": baseline_end, "periodStart": period_start, "periodEnd": period_end, "hourUTC": hour_utc, "minimumBaselineDays": min_baseline_days, "thresholdC": threshold_c, "reference": "Within-pixel median of earlier DQF=0 observations at the same UTC hour; not a climatology", "persistence": "Consecutive observed days strictly above the illustrative threshold; missing/rejected days break the run"}, "gridSignature": grid, "pixelCount": len(pixels), "baselineEligiblePixels": sum(p["baselineMedianK"] is not None for p in pixels), "comparedObservations": sum(p["comparedDays"] for p in pixels), "pixels": pixels, "eligibleForRiskIndex": False}
