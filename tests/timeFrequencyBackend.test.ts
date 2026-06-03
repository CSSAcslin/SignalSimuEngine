import { describe, expect, it } from "vitest";
import { createTimeFrequencyRequest, isTimeFrequencyNode } from "../src/signal";

describe("time-frequency backend bridge", () => {
  it("creates backend requests from analysis nodes and input signals", () => {
    const request = createTimeFrequencyRequest(
      {
        id: "stft",
        name: "STFT",
        type: "operation",
        kind: "stft",
        position: { x: 0, y: 0 },
        timelineOffset: 0,
        params: { windowSize: 64, hopSize: 16 }
      },
      {
        id: "x",
        name: "X",
        sampleRate: 100,
        unit: "a.u.",
        time: [0, 0.01],
        values: [1, -1],
        params: {}
      }
    );

    expect(request.method).toBe("STFT");
    expect(request.nodeId).toBe("stft");
    expect(request.sampleRate).toBe(100);
    expect(request.params).toEqual({ windowSize: 64, hopSize: 16 });
  });

  it("identifies only STFT and CWT nodes as backend time-frequency nodes", () => {
    expect(isTimeFrequencyNode({ id: "cwt", name: "CWT", type: "operation", kind: "cwt", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} })).toBe(true);
    expect(isTimeFrequencyNode({ id: "fft", name: "FFT", type: "operation", kind: "fft", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} })).toBe(false);
  });
});
