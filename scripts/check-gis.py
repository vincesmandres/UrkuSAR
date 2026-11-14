"""Check actual application exports using GDAL/OGR and GEOS, without a GUI."""
import io
import json
from pathlib import Path
import subprocess

import numpy as np
import pyogrio
from pyogrio.raw import read
import shapely
from shapely.geometry import shape


def main():
    root = Path(__file__).resolve().parent.parent
    process = subprocess.run(["node", str(root / "scripts/export-validation-fixtures.mjs")], cwd=root, capture_output=True, check=True)
    cases = json.loads(process.stdout)
    results = []
    for name, collection in cases.items():
        payload = json.dumps(collection).encode("utf-8")
        info = pyogrio.read_info(io.BytesIO(payload))
        features = collection["features"]
        assert info["driver"] == "GeoJSON", info
        assert info["features"] == len(features), info
        assert info["crs"] == "EPSG:4326", info
        if features:
            metadata, _, geometries, columns = read(io.BytesIO(payload))
            values = dict(zip(metadata["fields"], columns))
            assert list(values["zoneId"]) == [f["id"] for f in features]
            assert list(values["dataStatus"]) == ["synthetic"] * len(features)
            for index, feature in enumerate(features):
                geometry = shapely.from_wkb(geometries[index])
                assert geometry.is_valid and not geometry.is_empty, shapely.is_valid_reason(geometry)
                assert geometry.equals_exact(shape(feature["geometry"]), tolerance=0), "Coordinates changed in GDAL"
                assert np.isclose(values["risk"][index], feature["properties"]["risk"])
                assert np.isclose(values["thermalWeight"][index], feature["properties"]["thermalWeight"])
            assert np.allclose(info["total_bounds"], collection["bbox"])
        results.append({"case": name, "features": len(features), "crs": info["crs"], "driver": info["driver"], "valid": True})
    print(json.dumps({"gdal": pyogrio.__gdal_version_string__, "geos": shapely.geos_version_string, "checks": results, "scope": "OGR read and GEOS topology; not a QGIS GUI or geotechnical approval"}, indent=2))


if __name__ == "__main__":
    main()
