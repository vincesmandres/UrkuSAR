"""Read quality-filtered GOES-19 LST pixel centers without interpolating data."""
from datetime import datetime
import hashlib

import netCDF4
import numpy as np
from rasterio.warp import transform, transform_bounds


def read_goes_pixels(path, bbox, expected_date=None, expected_hour=None):
    with netCDF4.Dataset(path) as ds:
        if getattr(ds, "platform_ID", None) != "G19":
            raise ValueError("Expected GOES-19; do not mix satellites silently")
        start = datetime.fromisoformat(ds.time_coverage_start.replace("Z", "+00:00"))
        if start.utcoffset().total_seconds() != 0:
            raise ValueError("Expected UTC acquisition time")
        if expected_date and start.date().isoformat() != expected_date:
            raise ValueError("Acquisition date does not match manifest")
        if expected_hour is not None and (start.hour != expected_hour or start.minute != 0):
            raise ValueError("Expected a scan starting at the configured UTC hour")
        candidates = [v for v in ds.variables.values() if getattr(v, "standard_name", "") == "surface_temperature" and len(v.dimensions) == 2]
        if len(candidates) != 1:
            raise ValueError("Ambiguous land-surface temperature variable")
        variable = candidates[0]
        if variable.units != "K" or variable.dimensions != ("y", "x"):
            raise ValueError("Expected Kelvin on a y/x grid")
        quality = ds.variables["DQF"]
        if quality.dimensions != variable.dimensions or list(quality.flag_values) != [0, 1, 2, 3] or quality.flag_meanings.split()[0] != "high_quality_retrieval_qf":
            raise ValueError("Unknown DQF encoding; review product quality definition")
        projection = ds.variables[variable.grid_mapping]
        if projection.grid_mapping_name != "geostationary":
            raise ValueError("Unsupported projection")
        height = float(projection.perspective_point_height)
        proj = f"+proj=geos +h={height} +lon_0={projection.longitude_of_projection_origin} +a={projection.semi_major_axis} +b={projection.semi_minor_axis} +sweep={projection.sweep_angle_axis} +units=m"
        if ds.variables["x"].units != "rad" or ds.variables["y"].units != "rad":
            raise ValueError("Expected scan coordinates in radians")
        x = np.asarray(ds.variables["x"][:], dtype="<f8") * height
        y = np.asarray(ds.variables["y"][:], dtype="<f8") * height
        digest = hashlib.sha256(proj.encode())
        digest.update(x.astype("<f8").tobytes())
        digest.update(y.astype("<f8").tobytes())
        left, bottom, right, top = transform_bounds("EPSG:4326", proj, *bbox, densify_pts=21)
        cols = np.where((x >= left) & (x <= right))[0]
        rows = np.where((y >= bottom) & (y <= top))[0]
        if not rows.size or not cols.size:
            raise ValueError("No pixel centers intersect study extent")
        window = (slice(int(rows.min()), int(rows.max()) + 1), slice(int(cols.min()), int(cols.max()) + 1))
        lst = variable[window]
        dqf = quality[window]
        grid_x, grid_y = np.meshgrid(x[window[1]], y[window[0]])
        lon, lat = transform(proj, "EPSG:4326", grid_x.ravel(), grid_y.ravel())
        lon, lat = np.asarray(lon).reshape(lst.shape), np.asarray(lat).reshape(lst.shape)
        inside = (lon >= bbox[0]) & (lon <= bbox[2]) & (lat >= bbox[1]) & (lat <= bbox[3])
        pixels = []
        for row, col in zip(*np.where(inside)):
            flag = None if np.ma.getmaskarray(dqf)[row, col] else int(dqf[row, col])
            value = None if np.ma.getmaskarray(lst)[row, col] else float(lst[row, col])
            accepted = flag == 0 and value is not None and np.isfinite(value) and value > 0
            pixels.append({"id": f"{window[0].start + row}:{window[1].start + col}", "latitude": float(lat[row, col]), "longitude": float(lon[row, col]), "temperatureK": value if accepted else None, "dqf": flag, "status": "accepted" if accepted else "quality-rejected"})
        if not pixels:
            raise ValueError("No geolocated centers inside geographic bbox")
        return {"platform": "G19", "variable": variable.name, "unit": variable.units, "timeStart": ds.time_coverage_start, "timeEnd": ds.time_coverage_end, "spatialResolution": getattr(ds, "spatial_resolution", "See provider metadata"), "gridSignature": digest.hexdigest(), "dqfMeanings": quality.flag_meanings, "dqfValues": np.asarray(quality.flag_values).tolist(), "pixels": pixels}
