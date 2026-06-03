import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimeFrequencyRequest, isTimeFrequencyNode, runTimeFrequencyBackend } from "../src/signal";

describe("time-frequency backend bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("runs STFT and CWT through the local HTTP backend in browser sessions", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("http://127.0.0.1:8765/analyze/time-frequency");
      expect(JSON.parse(String(init?.body))).toMatchObject({ method: "STFT", sampleRate: 100 });
      return new Response(JSON.stringify({
        time: [0.04],
        frequency: [0, 25, 50],
        power: [[0], [1], [0]],
        unit: "power"
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await runTimeFrequencyBackend({
      nodeId: "stft",
      name: "STFT",
      method: "STFT",
      sampleRate: 100,
      values: [1, 0, -1],
      params: {}
    });

    expect(result).toMatchObject({
      type: "time-frequency",
      status: "done",
      method: "STFT",
      time: [0.04],
      frequency: [0, 25, 50]
    });
  });

  it("explains that STFT and CWT need the local analysis backend when browser service is offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection refused");
    }));

    const result = await runTimeFrequencyBackend({
      nodeId: "stft",
      name: "STFT",
      method: "STFT",
      sampleRate: 100,
      values: [1, 0, -1],
      params: {}
    });

    expect(result).toMatchObject({
      type: "time-frequency-error",
      status: "error"
    });
    if (result.type !== "time-frequency-error") {
      throw new Error("Expected the browser preview path to return a time-frequency backend error when the HTTP service is offline.");
    }
    expect(result.message).toContain("pnpm backend:dev");
  });

  it("falls back to the Tauri command when the desktop shell has no HTTP analysis service", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection refused");
    }));
    const invoke = vi.fn(async () => ({
      time: [0.02],
      frequency: [0, 50],
      power: [[0.1], [0.9]],
      unit: "power"
    }));
    Object.defineProperty(window, "__TAURI__", {
      value: { core: { invoke } },
      configurable: true
    });

    const result = await runTimeFrequencyBackend({
      nodeId: "stft",
      name: "STFT",
      method: "STFT",
      sampleRate: 100,
      values: [1, 0, -1],
      params: {}
    });

    expect(invoke).toHaveBeenCalledWith("run_time_frequency_analysis", expect.objectContaining({
      request: expect.objectContaining({ method: "STFT" })
    }));
    expect(result).toMatchObject({
      type: "time-frequency",
      status: "done",
      time: [0.02]
    });
  });
});
