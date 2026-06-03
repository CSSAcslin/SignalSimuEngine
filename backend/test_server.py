import unittest

from backend.server import TimeFrequencyRequest, analyze_time_frequency, health


class AnalysisBackendTest(unittest.TestCase):
    def test_health_reports_signalforge_analysis_service(self):
        self.assertEqual(health()["status"], "ok")
        self.assertEqual(health()["service"], "signalforge-analysis")

    def test_stft_returns_time_frequency_matrix(self):
        result = analyze_time_frequency(
            TimeFrequencyRequest(
                method="STFT",
                sampleRate=100,
                values=[1, 0, -1, 0, 1, 0, -1, 0],
                params={"windowSize": 4, "hopSize": 2},
            )
        )

        self.assertEqual(result["unit"], "power")
        self.assertGreater(len(result["time"]), 0)
        self.assertGreater(len(result["frequency"]), 0)
        self.assertEqual(len(result["power"]), len(result["frequency"]))

    def test_cwt_returns_rows_with_signal_length(self):
        values = [1, 0, -1, 0, 1, 0, -1, 0]
        result = analyze_time_frequency(
            TimeFrequencyRequest(
                method="CWT",
                sampleRate=100,
                values=values,
                params={"voicesPerOctave": 12},
            )
        )

        self.assertEqual(result["unit"], "power")
        self.assertEqual(len(result["time"]), len(values))
        self.assertEqual(len(result["power"][0]), len(values))


if __name__ == "__main__":
    unittest.main()
