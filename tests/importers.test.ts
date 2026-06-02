import { describe, expect, it } from "vitest";
import { parseCsvSignalData } from "../src/signal";

describe("CSV signal import", () => {
  it("imports one-column CSV data as values", () => {
    const imported = parseCsvSignalData("value\n1\n2\n-3\n", 500);

    expect(imported.values).toEqual([1, 2, -3]);
    expect(imported.sampleRate).toBe(500);
    expect(imported.startTime).toBe(0);
  });

  it("imports two-column CSV data as time,value and infers sample rate", () => {
    const imported = parseCsvSignalData("t,value\n0.1,1\n0.102,0\n0.104,-1\n", 1000);

    expect(imported.values).toEqual([1, 0, -1]);
    expect(imported.sampleRate).toBe(500);
    expect(imported.startTime).toBe(0.1);
  });
});
