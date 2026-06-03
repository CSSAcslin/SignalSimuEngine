import { describe, expect, it } from "vitest";
import { summarizeAnalysisResult } from "../src/signal";

describe("analysis result summaries", () => {
  it("summarizes scalar analysis results for the inspector", () => {
    const summary = summarizeAnalysisResult({
      type: "scalar",
      id: "rms",
      name: "RMS",
      label: "RMS",
      value: 0.707106,
      unit: "a.u.",
      params: {}
    });

    expect(summary.kind).toBe("scalar");
    expect(summary.headline).toBe("RMS");
    expect(summary.primaryValue).toBeCloseTo(0.707106);
    expect(summary.rows).toContainEqual({ label: "Unit", value: "a.u." });
  });

  it("summarizes spectrum analysis results with peak and bin metadata", () => {
    const summary = summarizeAnalysisResult({
      type: "spectrum",
      id: "fft",
      name: "FFT",
      frequency: [0, 5, 10],
      magnitude: [0.1, 0.9, 0.2],
      unit: "a.u.",
      params: {}
    });

    expect(summary.kind).toBe("spectrum");
    expect(summary.primaryValue).toBe(5);
    expect(summary.rows).toContainEqual({ label: "Peak Magnitude", value: "0.9" });
    expect(summary.rows).toContainEqual({ label: "Bins", value: "3" });
    expect(summary.rows).toContainEqual({ label: "Range", value: "0 - 10 Hz" });
  });

  it("summarizes pending time-frequency analysis as backend work", () => {
    const summary = summarizeAnalysisResult({
      type: "time-frequency-pending",
      id: "stft",
      name: "STFT",
      method: "STFT",
      status: "pending",
      message: "Python/SciPy backend required.",
      params: { windowSize: 128 }
    });

    expect(summary.kind).toBe("time-frequency");
    expect(summary.headline).toBe("STFT");
    expect(summary.rows).toContainEqual({ label: "Status", value: "pending" });
    expect(summary.rows).toContainEqual({ label: "Expected Output", value: "time-frequency matrix" });
  });
});
