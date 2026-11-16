from pathlib import Path
import sys
import tempfile
import unittest

import netCDF4
import numpy as np
from rasterio.warp import transform

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from goes import read_goes_pixels

BBOX = [-78.46, -0.74, -78.28, -0.57]


def write_fixture(path):
    height = 35786023.0
    proj = f"+proj=geos +h={height} +lon_0=-75 +a=6378137 +b=6356752.31414 +sweep=x +units=m"
    x, _ = transform("EPSG:4326", proj, [-78.4, -78.32], [-0.65, -0.65])
    _, y = transform("EPSG:4326", proj, [-78.36, -78.36], [-0.6, -0.7])
    with netCDF4.Dataset(path, "w") as ds:
        ds.platform_ID = "G19"
        ds.time_coverage_start = "2025-05-01T17:00:20Z"
        ds.time_coverage_end = "2025-05-01T17:09:50Z"
        ds.spatial_resolution = "test grid"
        ds.createDimension("y", 2)
        ds.createDimension("x", 2)
        for axis, values in [("x", x), ("y", y)]:
            coordinate = ds.createVariable(axis, "f8", (axis,))
            coordinate.units = "rad"
            coordinate[:] = np.asarray(values) / height
        mapping = ds.createVariable("projection", "i4")
        for key, value in {"grid_mapping_name": "geostationary", "perspective_point_height": height, "longitude_of_projection_origin": -75.0, "semi_major_axis": 6378137.0, "semi_minor_axis": 6356752.31414, "sweep_angle_axis": "x"}.items():
            mapping.setncattr(key, value)
        lst = ds.createVariable("LST", "i2", ("y", "x"), fill_value=-32768)
        lst.setncatts({"standard_name": "surface_temperature", "units": "K", "grid_mapping": "projection", "scale_factor": 0.01, "add_offset": 200.0})
        lst[:] = np.ma.array([[300, 301], [302, 303]], mask=[[False, False], [False, True]])
        dqf = ds.createVariable("DQF", "i1", ("y", "x"), fill_value=-1)
        dqf.flag_values = [0, 1, 2, 3]
        dqf.flag_meanings = "high_quality_retrieval_qf medium_quality_retrieval_qf low_quality_retrieval_qf no_retrieval_qf"
        dqf[:] = [[0, 1], [3, 0]]


class GoesReaderTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "test.nc"
        write_fixture(self.path)

    def test_cf_scaling_geolocation_and_quality(self):
        result = read_goes_pixels(self.path, BBOX, "2025-05-01", 17)
        self.assertEqual(len(result["pixels"]), 4)
        self.assertEqual([p["temperatureK"] for p in result["pixels"]], [300, None, None, None])
        self.assertEqual([p["dqf"] for p in result["pixels"]], [0, 1, 3, 0])
        self.assertEqual(len(result["gridSignature"]), 64)
        self.assertTrue(all(BBOX[0] <= p["longitude"] <= BBOX[2] and BBOX[1] <= p["latitude"] <= BBOX[3] for p in result["pixels"]))

    def test_date_and_scan_hour_are_checked(self):
        with self.assertRaises(ValueError):
            read_goes_pixels(self.path, BBOX, "2025-05-02", 17)
        with self.assertRaises(ValueError):
            read_goes_pixels(self.path, BBOX, "2025-05-01", 18)

    def test_wrong_units_and_quality_metadata_fail_closed(self):
        with netCDF4.Dataset(self.path, "a") as ds:
            ds.variables["LST"].units = "degC"
        with self.assertRaises(ValueError):
            read_goes_pixels(self.path, BBOX)
        with netCDF4.Dataset(self.path, "a") as ds:
            ds.variables["LST"].units = "K"
            ds.variables["DQF"].flag_meanings = "unknown medium low none"
        with self.assertRaises(ValueError):
            read_goes_pixels(self.path, BBOX)

    def test_wrong_platform_and_missing_coverage_rejected(self):
        with self.assertRaises(ValueError):
            read_goes_pixels(self.path, [0, 0, 1, 1])
        with netCDF4.Dataset(self.path, "a") as ds:
            ds.platform_ID = "G16"
        with self.assertRaises(ValueError):
            read_goes_pixels(self.path, BBOX)


if __name__ == "__main__":
    unittest.main()
