import { describe, expect, it } from "vitest";
import { moduleDefinitions } from "../src/signal";

describe("module definitions", () => {
  it("uses sine phase instead of a separate cosine source", () => {
    expect(moduleDefinitions.some((definition) => String(definition.kind) === "cosine")).toBe(false);
    expect(moduleDefinitions.some((definition) => definition.kind === "triangle")).toBe(true);
    expect(moduleDefinitions.some((definition) => definition.kind === "gaussianPulse")).toBe(true);
  });

  it("declares first-stage analysis modules as analysis outputs", () => {
    const analysisKinds = ["fft", "rms", "mean", "peak", "snr", "dominantFrequency", "bandwidth", "stft", "cwt"];

    analysisKinds.forEach((kind) => {
      const definition = moduleDefinitions.find((item) => item.kind === kind);
      expect(definition?.type).toBe("analysis");
      expect(definition?.outputType).toBe(kind === "stft" || kind === "cwt" ? "time-frequency" : kind === "fft" ? "spectrum" : "scalar");
    });
  });
});
