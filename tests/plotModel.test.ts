import { describe, expect, it } from "vitest";
import {
  createAnalysisPlotModel,
  createSignalPlotModel,
  createSourceSignal,
  evaluateGraph,
  fftSpectrum,
  moduleDefinitions,
  type AnalysisResult,
  type SignalGraph
} from "../src/signal";

describe("scientific plot semantics", () => {
  it("classifies every analysis result shape without falling back to a time axis", () => {
    const results: AnalysisResult[] = [
      { type: "scalar", id: "scalar", name: "RMS", label: "RMS", value: 1, unit: "V", params: {} },
      { type: "summary", id: "summary", name: "Quantiles", metrics: [{ label: "Mean", value: 1, unit: "V" }], params: {} },
      { type: "distribution", id: "distribution", name: "Distribution", binEdges: [0, 1], counts: [2], density: [1], unit: "V", params: {} },
      { type: "spectrum", id: "spectrum", name: "FFT", frequency: [0, 1], magnitude: [0, 1], unit: "V", params: {} },
      { type: "time-frequency", id: "stft", name: "STFT", method: "STFT", status: "done", time: [0], frequency: [1], power: [[2]], unit: "power", params: {} },
      { type: "time-frequency-pending", id: "pending", name: "CWT", method: "CWT", status: "pending", message: "Queued", params: {} },
      { type: "time-frequency-error", id: "error", name: "CWT", method: "CWT", status: "error", message: "Failed", params: {} }
    ];

    expect(results.map((result) => createAnalysisPlotModel(result).kind)).toEqual([
      "metrics",
      "metrics",
      "histogram",
      "spectrum",
      "heatmap",
      "status",
      "status"
    ]);
  });

  it("keeps source and pointwise operation signals linked to the master time axis", () => {
    const signal = createSourceSignal({
      id: "source",
      kind: "sine",
      name: "Source",
      sampleRate: 8,
      length: 8,
      params: { frequency: 1, amplitude: 1 }
    });
    const plot = createSignalPlotModel(signal);

    expect(plot.kind).toBe("line");
    expect(plot.kind === "line" ? plot.xAxis : undefined).toMatchObject({
      kind: "time",
      unit: "s",
      linkToMaster: true
    });
  });

  it("marks cross-correlation output as an independent lag-domain series", () => {
    const graph: SignalGraph = {
      nodes: [
        { id: "x", type: "source", kind: "import", name: "X", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 2, length: 2, params: { values: [1, 0] } },
        { id: "y", type: "source", kind: "import", name: "Y", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 2, length: 2, params: { values: [1, 0] } },
        { id: "corr", type: "operation", kind: "correlate", name: "Correlation", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} }
      ],
      edges: [
        { id: "x-corr", from: "x", to: "corr" },
        { id: "y-corr", from: "y", to: "corr" }
      ]
    };

    const signal = evaluateGraph(graph).signals.get("corr");

    expect(signal?.time).toEqual([-0.5, 0, 0.5]);
    expect(signal?.domain).toMatchObject({ kind: "delay", label: "Lag", unit: "s", linkToMaster: false });
  });

  it("uses actual FFT bin frequencies and finds the expected sine peak", () => {
    const signal = createSourceSignal({
      id: "sine",
      kind: "sine",
      name: "Sine",
      sampleRate: 8,
      length: 8,
      params: { frequency: 1, amplitude: 1, phase: 0 }
    });
    const spectrum = fftSpectrum(signal);
    const peakIndex = spectrum.magnitude.reduce((best, value, index) => (value > spectrum.magnitude[best] ? index : best), 0);

    expect(spectrum.frequency).toEqual([0, 1, 2, 3, 4]);
    expect(spectrum.frequency[peakIndex]).toBe(1);
    expect(spectrum.magnitude[peakIndex]).toBeCloseTo(1);
  });

  it("declares a supported output shape for every analysis module", () => {
    const analysisModules = moduleDefinitions.filter((definition) => definition.type === "analysis");

    expect(analysisModules.map((definition) => [definition.kind, definition.outputType])).toEqual([
      ["fft", "spectrum"],
      ["rms", "scalar"],
      ["quantiles", "summary"],
      ["distribution", "distribution"],
      ["snr", "scalar"],
      ["dominantFrequency", "scalar"],
      ["bandwidth", "scalar"],
      ["secondOrderCorrelation", "scalar"],
      ["stft", "time-frequency"],
      ["cwt", "time-frequency"]
    ]);
  });
});
