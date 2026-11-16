import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from thermal_series import analyze_thermal_series, days


def fixture():
    values = [300, 302, 300, 304, 298, 300, 300, 303, 304, 299]
    return [{"date": day, "status": "available", "platform": "G19", "unit": "K", "timeStart": f"{day}T17:00:20Z", "gridSignature": "same-grid", "pixels": [{"id": "1:2", "latitude": -0.65, "longitude": -78.4, "temperatureK": value, "dqf": 0}]} for day, value in zip(days("2025-05-01", "2025-05-10"), values)]


def analyze(records, **options):
    return analyze_thermal_series(records, "2025-05-01", "2025-05-07", "2025-05-08", "2025-05-10", **options)


class ThermalSeriesTests(unittest.TestCase):
    def test_reference_anomaly_and_observed_persistence(self):
        result = analyze(fixture())
        p = result["pixels"][0]
        self.assertEqual(p["baselineMedianK"], 300)
        self.assertEqual(p["baselineMadK"], 0)
        self.assertEqual([o["anomalyC"] for o in p["observations"]], [3, 4, -1])
        self.assertEqual(p["aboveThresholdDays"], 2)
        self.assertEqual(p["longestObservedRunDays"], 2)
        self.assertFalse(result["eligibleForRiskIndex"])

    def test_lack_of_reference_is_not_zero_anomaly(self):
        records = fixture()
        records[0]["pixels"][0].update(temperatureK=None, dqf=3)
        p = analyze(records)["pixels"][0]
        self.assertEqual(p["baselineValidDays"], 6)
        self.assertIsNone(p["baselineMedianK"])
        self.assertIsNone(p["aboveThresholdDays"])
        self.assertTrue(all(o["status"] == "insufficient-baseline" and o["anomalyC"] is None for o in p["observations"]))

    def test_quality_gap_breaks_run(self):
        records = fixture()
        records[8]["pixels"][0].update(temperatureK=None, dqf=1)
        records[9]["pixels"][0]["temperatureK"] = 304
        p = analyze(records)["pixels"][0]
        self.assertEqual(p["aboveThresholdDays"], 2)
        self.assertEqual(p["longestObservedRunDays"], 1)
        self.assertEqual(p["observations"][1]["status"], "quality-rejected")

    def test_missing_source_breaks_run(self):
        for status in ["missing", "unavailable"]:
            with self.subTest(status=status):
                records = fixture()
                records[8] = {"date": records[8]["date"], "status": status}
                records[9]["pixels"][0]["temperatureK"] = 304
                p = analyze(records)["pixels"][0]
                self.assertEqual(p["longestObservedRunDays"], 1)
                self.assertEqual(p["observations"][1]["status"], status)
                self.assertIsNone(p["observations"][1]["anomalyC"])

    def test_threshold_is_strict_not_inclusive(self):
        records = fixture()
        records[7]["pixels"][0]["temperatureK"] = 302
        p = analyze(records)["pixels"][0]
        self.assertEqual(p["aboveThresholdDays"], 1)

    def test_no_leakage_from_measurement_period(self):
        records = fixture()
        before = analyze(records)["pixels"][0]["baselineMedianK"]
        for record in records[7:]:
            record["pixels"][0]["temperatureK"] = 350
        self.assertEqual(analyze(records)["pixels"][0]["baselineMedianK"], before)
        with self.assertRaises(ValueError):
            analyze_thermal_series(records, "2025-05-01", "2025-05-08", "2025-05-08", "2025-05-10")

    def test_calendar_is_complete_unique_and_explicit(self):
        for records in [fixture()[:-1], fixture() + [fixture()[0]]]:
            with self.subTest(size=len(records)), self.assertRaises(ValueError):
                analyze(records)

    def test_rejects_different_grid_satellite_units_and_time(self):
        for key, value in [("gridSignature", "other"), ("platform", "G16"), ("unit", "degC"), ("timeStart", "2025-05-01T18:00:00Z"), ("timeStart", "2025-05-02T17:00:00Z")]:
            with self.subTest(field=key, value=value):
                records = fixture()
                records[0][key] = value
                with self.assertRaises(ValueError):
                    analyze(records)

    def test_quality_must_not_be_bypassed(self):
        records = fixture()
        records[0]["pixels"][0]["dqf"] = 1
        with self.assertRaises(ValueError):
            analyze(records)
        for value in [float("nan"), float("inf"), 0, -1, True, "300"]:
            with self.subTest(value=value):
                records = fixture()
                records[0]["pixels"][0]["temperatureK"] = value
                with self.assertRaises(ValueError):
                    analyze(records)

    def test_rejects_shifted_or_duplicate_pixel_centers(self):
        records = fixture()
        records[0]["pixels"][0]["longitude"] += 0.01
        with self.assertRaises(ValueError):
            analyze(records)
        records = fixture()
        records[0]["pixels"] *= 2
        with self.assertRaises(ValueError):
            analyze(records)

    def test_parameters_are_validated(self):
        for options in [{"min_baseline_days": 0}, {"min_baseline_days": 8}, {"min_baseline_days": True}, {"threshold_c": 0}, {"threshold_c": float("nan")}, {"hour_utc": 24}]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                analyze(fixture(), **options)

    def test_no_files_is_not_a_zero_risk(self):
        records = [{"date": r["date"], "status": "unavailable"} for r in fixture()]
        result = analyze(records)
        self.assertEqual(result["pixelCount"], 0)
        self.assertEqual(result["comparedObservations"], 0)
        self.assertFalse(result["eligibleForRiskIndex"])

    def test_reproducible_without_mutation(self):
        records = fixture()
        before = copy.deepcopy(records)
        self.assertEqual(analyze(records), analyze(records))
        self.assertEqual(records, before)


if __name__ == "__main__":
    unittest.main()
