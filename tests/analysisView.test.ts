import { describe, expect, it } from "vitest";
import { createTimeFrequencyView } from "../src/signal";

describe("analysis result view helpers", () => {
  it("downsamples time-frequency matrices and reports peak coordinates", () => {
    const view = createTimeFrequencyView({
      type: "time-frequency",
      id: "stft",
      name: "STFT",
      method: "STFT",
      status: "done",
      time: [0, 0.1, 0.2, 0.3],
      frequency: [5, 10, 20],
      power: [
        [0.1, 0.2, 0.3, 0.4],
        [0.3, 2.5, 0.1, 0.2],
        [0.1, 0.2, 0.3, 0.4]
      ],
      unit: "power",
      params: {}
    }, { maxRows: 2, maxColumns: 3 });

    expect(view.rowCount).toBe(3);
    expect(view.columnCount).toBe(4);
    expect(view.cells).toHaveLength(6);
    expect(view.peak).toMatchObject({ frequency: 10, time: 0.1, value: 2.5 });
    expect(view.xLabels).toEqual(["0 s", "0.15 s", "0.3 s"]);
    expect(view.yLabels).toEqual(["5 Hz", "20 Hz"]);
  });

  it("handles empty time-frequency matrices without invalid numbers", () => {
    const view = createTimeFrequencyView({
      type: "time-frequency",
      id: "cwt",
      name: "CWT",
      method: "CWT",
      status: "done",
      time: [],
      frequency: [],
      power: [],
      unit: "power",
      params: {}
    });

    expect(view.cells).toEqual([]);
    expect(view.peak.value).toBe(0);
    expect(view.xLabels).toEqual(["0 s", "0 s", "0 s"]);
    expect(view.yLabels).toEqual(["0 Hz", "0 Hz"]);
  });
});
