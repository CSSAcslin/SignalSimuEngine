import { describe, expect, it } from "vitest";
import {
  clampView,
  clampSelection,
  createTimeTicks,
  createValueTicks,
  decibels,
  panValueRange,
  panSelection,
  panView,
  readSignalAtTime,
  selectSignalWindow,
  snapTimeToSample,
  zoomValueRange,
  zoomView,
  type TimeView
} from "../src/signal";

const signal = {
  id: "sig",
  name: "Signal",
  sampleRate: 10,
  unit: "a.u.",
  time: Array.from({ length: 11 }, (_, index) => index / 10),
  values: Array.from({ length: 11 }, (_, index) => index),
  params: {}
};

describe("timeline viewport utilities", () => {
  it("clamps a view inside the available signal duration", () => {
    const view = clampView({ start: -0.5, end: 1.5 }, 1);

    expect(view).toEqual({ start: 0, end: 1 });
  });

  it("zooms around a normalized focal point", () => {
    const view = zoomView({ start: 0, end: 1 }, 0.5, 0.5, 1);

    expect(view.start).toBeCloseTo(0.25);
    expect(view.end).toBeCloseTo(0.75);
  });

  it("pans without leaving the full duration", () => {
    const view = panView({ start: 0.2, end: 0.6 }, -1, 1);

    expect(view).toEqual({ start: 0, end: 0.4 });
  });

  it("clamps a selection inside a viewport and duration", () => {
    const selection = clampSelection({ start: -0.2, end: 1.4 }, { start: 0, end: 1 }, 1);

    expect(selection).toEqual({ start: 0, end: 1 });
  });

  it("pans a selection without changing its width", () => {
    const selection = panSelection({ start: 0.2, end: 0.5 }, 0.4, 1);

    expect(selection).toEqual({ start: 0.6, end: 0.9 });
  });

  it("selects samples inside a time window", () => {
    const windowed = selectSignalWindow(signal, { start: 0.2, end: 0.5 });

    expect(windowed.time).toEqual([0.2, 0.3, 0.4, 0.5]);
    expect(windowed.values).toEqual([2, 3, 4, 5]);
  });

  it("creates stable visible tick labels", () => {
    const ticks = createTimeTicks({ start: 0, end: 1 } satisfies TimeView, 5);

    expect(ticks.map((tick) => tick.label)).toEqual(["0.000s", "0.250s", "0.500s", "0.750s", "1.000s"]);
  });

  it("reads the nearest sample at the cursor time", () => {
    const readout = readSignalAtTime(signal, 0.26);

    expect(readout).toEqual({ index: 3, time: 0.3, value: 3 });
  });

  it("clamps cursor readout to the nearest signal edge", () => {
    expect(readSignalAtTime(signal, -1)).toEqual({ index: 0, time: 0, value: 0 });
    expect(readSignalAtTime(signal, 2)).toEqual({ index: 10, time: 1, value: 10 });
  });

  it("creates value axis ticks from a numeric range", () => {
    const ticks = createValueTicks(-1, 1, 5);

    expect(ticks).toEqual([
      { ratio: 1, value: -1, label: "-1.000" },
      { ratio: 0.75, value: -0.5, label: "-0.500" },
      { ratio: 0.5, value: 0, label: "0.000" },
      { ratio: 0.25, value: 0.5, label: "0.500" },
      { ratio: 0, value: 1, label: "1.000" }
    ]);
  });

  it("snaps time to the nearest sample period", () => {
    expect(snapTimeToSample(0.026, 100, 1)).toBe(0.03);
    expect(snapTimeToSample(-1, 100, 1)).toBe(0);
    expect(snapTimeToSample(2, 100, 1)).toBe(1);
  });

  it("zooms and pans value ranges", () => {
    expect(zoomValueRange({ min: -1, max: 1 }, 0.5, 0)).toEqual({ min: -0.5, max: 0.5 });
    expect(panValueRange({ min: -1, max: 1 }, 0.25)).toEqual({ min: -0.5, max: 1.5 });
  });

  it("converts magnitudes to finite decibels", () => {
    expect(decibels(1)).toBe(0);
    expect(Number.isFinite(decibels(0))).toBe(true);
    expect(decibels(0)).toBeLessThan(-100);
  });
});
