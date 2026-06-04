import { describe, expect, it } from "vitest";
import {
  createSourceSignal,
  createNpyFloat64Bytes,
  evaluateGraph,
  exportCsv,
  exportAnalysisCsv,
  exportAnalysisJson,
  exportPython,
  normalizeSignal,
  type AnalysisResult,
  type SignalGraph
} from "../src/signal";

describe("signal sources", () => {
  it("generates a sine signal with the requested length, sample rate, and amplitude", () => {
    const signal = createSourceSignal({
      id: "sine-1",
      kind: "sine",
      name: "Sine",
      sampleRate: 4,
      length: 4,
      params: { frequency: 1, amplitude: 2, phase: 0 }
    });

    expect(signal.sampleRate).toBe(4);
    expect(signal.time).toEqual([0, 0.25, 0.5, 0.75]);
    expect(signal.values.map((value) => Number(value.toFixed(6)))).toEqual([0, 2, 0, -2]);
  });

  it("generates reproducible white noise from a seed", () => {
    const config = {
      id: "noise-1",
      kind: "noise" as const,
      name: "Noise",
      sampleRate: 10,
      length: 6,
      seed: 42,
      params: { amplitude: 1 }
    };

    expect(createSourceSignal(config).values).toEqual(createSourceSignal(config).values);
  });

  it("generates triangle waves and gaussian pulses as basic sources", () => {
    const triangle = createSourceSignal({
      id: "tri",
      kind: "triangle",
      name: "Triangle",
      sampleRate: 4,
      length: 4,
      params: { frequency: 1, amplitude: 1, phase: 0 }
    });
    const pulse = createSourceSignal({
      id: "gp",
      kind: "gaussianPulse",
      name: "Gaussian Pulse",
      sampleRate: 10,
      length: 5,
      params: { center: 0.2, sigma: 0.1, amplitude: 2 }
    });

    expect(triangle.values.map((value) => Number(value.toFixed(6)))).toEqual([0, 1, 0, -1]);
    expect(pulse.values[2]).toBeCloseTo(2);
    expect(pulse.values[0]).toBeLessThan(pulse.values[2]);
  });
});

describe("operation modules", () => {
  it("multiplies two source signals through graph evaluation", () => {
    const graph: SignalGraph = {
      nodes: [
        {
          id: "a",
          type: "source",
          kind: "constant",
          name: "A",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          sampleRate: 10,
          length: 4,
          params: { value: 2 }
        },
        {
          id: "b",
          type: "source",
          kind: "constant",
          name: "B",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          sampleRate: 10,
          length: 4,
          params: { value: 3 }
        },
        {
          id: "multiply",
          type: "operation",
          kind: "multiply",
          name: "Multiply",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          params: {}
        }
      ],
      edges: [
        { id: "e1", from: "a", to: "multiply" },
        { id: "e2", from: "b", to: "multiply" }
      ],
      selectedNodeId: "multiply"
    };

    const result = evaluateGraph(graph).signals.get("multiply");

    expect(result?.values).toEqual([6, 6, 6, 6]);
    expect(result?.provenance).toMatchObject({
      nodeId: "multiply",
      nodeName: "Multiply",
      nodeKind: "multiply",
      inputNodeIds: ["a", "b"]
    });
  });

  it("records provenance for generated source signals", () => {
    const signal = createSourceSignal({
      id: "src",
      kind: "constant",
      name: "Reference",
      sampleRate: 10,
      length: 3,
      params: { value: 2 }
    });

    expect(signal.provenance).toMatchObject({
      nodeId: "src",
      nodeName: "Reference",
      nodeKind: "constant",
      inputNodeIds: [],
      sampleRate: 10,
      sampleCount: 3
    });
  });

  it("places source signals on the global sample grid using start time and duration", () => {
    const graph: SignalGraph = {
      sampleRate: 10,
      samples: 10,
      nodes: [
        {
          id: "a",
          type: "source",
          kind: "constant",
          name: "A",
          position: { x: 0, y: 0 },
          timelineOffset: 0.2,
          sampleRate: 10,
          length: 3,
          params: { value: 2 }
        }
      ],
      edges: []
    };

    const signal = evaluateGraph(graph).signals.get("a");

    expect(signal?.sampleRate).toBe(10);
    expect(signal?.values).toEqual([0, 0, 2, 2, 2, 0, 0, 0, 0, 0]);
    expect(signal?.time).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  });

  it("marks disabled nodes and downstream operations as unavailable", () => {
    const graph: SignalGraph = {
      disabledNodeIds: ["a"],
      nodes: [
        {
          id: "a",
          type: "source",
          kind: "constant",
          name: "A",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          sampleRate: 10,
          length: 3,
          params: { value: 2 }
        },
        {
          id: "b",
          type: "operation",
          kind: "scale",
          name: "B",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          params: { gain: 3 }
        }
      ],
      edges: [{ id: "a-b", from: "a", to: "b" }]
    };

    const result = evaluateGraph(graph);

    expect(result.signals.has("a")).toBe(false);
    expect(result.errors.get("a")).toBe("Node is disabled.");
    expect(result.errors.get("b")).toBe("Input A is disabled or unavailable.");
  });

  it("computes convolution and cross-correlation with predictable output lengths", () => {
    const graph: SignalGraph = {
      nodes: [
        {
          id: "x",
          type: "source",
          kind: "import",
          name: "X",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          sampleRate: 1,
          length: 3,
          params: { values: [1, 2, 3] }
        },
        {
          id: "h",
          type: "source",
          kind: "import",
          name: "H",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          sampleRate: 1,
          length: 2,
          params: { values: [1, 1] }
        },
        {
          id: "conv",
          type: "operation",
          kind: "convolve",
          name: "Convolve",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          params: {}
        },
        {
          id: "corr",
          type: "operation",
          kind: "correlate",
          name: "Correlate",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          params: {}
        }
      ],
      edges: [
        { id: "e1", from: "x", to: "conv" },
        { id: "e2", from: "h", to: "conv" },
        { id: "e3", from: "x", to: "corr" },
        { id: "e4", from: "h", to: "corr" }
      ]
    };

    const result = evaluateGraph(graph);

    expect(result.signals.get("conv")?.values).toEqual([1, 3, 5, 3]);
    expect(result.signals.get("corr")?.values).toEqual([1, 3, 5, 3]);
  });

  it("normalizes a signal without mutating the original values", () => {
    const signal = {
      id: "raw",
      name: "Raw",
      sampleRate: 1,
      unit: "a.u.",
      time: [0, 1, 2],
      values: [-2, 0, 4],
      params: {}
    };

    const normalized = normalizeSignal(signal);

    expect(normalized.values).toEqual([-0.5, 0, 1]);
    expect(signal.values).toEqual([-2, 0, 4]);
  });

  it("emits scalar analysis results without producing downstream signal output", () => {
    const graph: SignalGraph = {
      nodes: [
        {
          id: "x",
          type: "source",
          kind: "import",
          name: "X",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          sampleRate: 1,
          length: 4,
          params: { values: [1, -2, 3, -4] }
        },
        {
          id: "rms",
          type: "operation",
          kind: "rms",
          name: "RMS",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          params: {}
        },
        {
          id: "scale",
          type: "operation",
          kind: "scale",
          name: "Scale",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          params: { gain: 2 }
        }
      ],
      edges: [
        { id: "x-rms", from: "x", to: "rms" },
        { id: "rms-scale", from: "rms", to: "scale" }
      ]
    };

    const result = evaluateGraph(graph);
    const rms = result.analysis.get("rms");

    expect(rms).toMatchObject({ type: "scalar", label: "RMS", unit: "a.u." });
    expect(rms?.provenance).toMatchObject({
      nodeId: "rms",
      nodeKind: "rms",
      inputNodeIds: ["x"]
    });
    expect(rms?.type === "scalar" ? rms.value : undefined).toBeCloseTo(Math.sqrt(7.5));
    expect(result.signals.has("rms")).toBe(false);
    expect(result.errors.get("scale")).toBe("Input RMS is an analysis result and cannot feed signal operations.");
  });

  it("returns pending backend analysis results for STFT and CWT", () => {
    const graph: SignalGraph = {
      nodes: [
        {
          id: "x",
          type: "source",
          kind: "import",
          name: "X",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          sampleRate: 10,
          length: 4,
          params: { values: [1, 0, -1, 0] }
        },
        {
          id: "stft",
          type: "operation",
          kind: "stft",
          name: "STFT",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          params: { windowSize: 128, hopSize: 32 }
        },
        {
          id: "cwt",
          type: "operation",
          kind: "cwt",
          name: "CWT",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          params: { wavelet: "morlet" }
        }
      ],
      edges: [
        { id: "x-stft", from: "x", to: "stft" },
        { id: "x-cwt", from: "x", to: "cwt" }
      ]
    };

    const result = evaluateGraph(graph);

    expect(result.analysis.get("stft")).toMatchObject({ type: "time-frequency-pending", method: "STFT", status: "pending" });
    expect(result.analysis.get("cwt")).toMatchObject({ type: "time-frequency-pending", method: "CWT", status: "pending" });
  });
});

describe("exports", () => {
  it("exports CSV with time and value columns", () => {
    const csv = exportCsv({
      id: "s",
      name: "Signal",
      sampleRate: 2,
      unit: "a.u.",
      time: [0, 0.5],
      values: [1, -1],
      params: {}
    });

    expect(csv.trim()).toBe("# SignalForge signal export\n# node=s\n# sampleRate=2\n# unit=a.u.\n# params={}\ntime,value\n0,1\n0.5,-1");
  });

  it("exports scalar and spectrum analysis results", () => {
    expect(
      exportAnalysisCsv({
        type: "scalar",
        id: "rms",
        name: "RMS",
        label: "RMS",
        value: 1.25,
        unit: "a.u.",
        params: {}
      }).trim()
    ).toBe("# SignalForge analysis export\n# node=rms\n# type=scalar\n# params={}\nlabel,value,unit\nRMS,1.25,a.u.");

    expect(
      exportAnalysisCsv({
        type: "spectrum",
        id: "fft",
        name: "FFT",
        frequency: [0, 10],
        magnitude: [0.1, 0.8],
        unit: "a.u.",
        params: {}
      }).trim()
    ).toBe("# SignalForge analysis export\n# node=fft\n# type=spectrum\n# params={}\nfrequency,magnitude\n0,0.1\n10,0.8");

    expect(JSON.parse(exportAnalysisJson({ type: "scalar", id: "mean", name: "Mean", label: "Mean", value: 2, unit: "a.u.", params: {} })).type).toBe("scalar");
  });

  it("exports time-frequency matrices as long-form CSV", () => {
    const analysis: AnalysisResult = {
      type: "time-frequency",
      id: "stft",
      name: "STFT",
      method: "STFT",
      status: "done",
      time: [0, 0.5],
      frequency: [10, 20],
      power: [
        [1, 2],
        [3, 4]
      ],
      unit: "power",
      params: {}
    };
    const csv = exportAnalysisCsv(analysis);

    expect(csv.trim()).toBe("# SignalForge analysis export\n# node=stft\n# type=time-frequency\n# params={}\nfrequency,time,power\n10,0,1\n10,0.5,2\n20,0,3\n20,0.5,4");
    expect(exportAnalysisCsv(analysis, "matrix").trim()).toBe("# SignalForge analysis export\n# node=stft\n# type=time-frequency\n# params={}\nfrequency\\time,0,0.5\n10,1,2\n20,3,4");
  });

  it("exports a Python script that reconstructs source nodes and operations", () => {
    const graph: SignalGraph = {
      nodes: [
        {
          id: "a",
          type: "source",
          kind: "sine",
          name: "A",
          position: { x: 0, y: 0 },
          timelineOffset: 0,
          sampleRate: 100,
          length: 100,
          params: { frequency: 5, amplitude: 1, phase: 0 }
        }
      ],
      edges: []
    };

    const script = exportPython(graph);

    expect(script).toContain("import numpy as np");
    expect(script).toContain("nodes['a']");
    expect(script).toContain("np.sin");
  });

  it("exports a NumPy .npy Float64 payload", async () => {
    const bytes = createNpyFloat64Bytes({
      id: "s",
      name: "Signal",
      sampleRate: 2,
      unit: "a.u.",
      time: [0, 0.5],
      values: [1, -1],
      params: {}
    });

    expect(Array.from(bytes.slice(0, 6))).toEqual([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]);
    expect(bytes.length).toBeGreaterThan(16);
  });
});
