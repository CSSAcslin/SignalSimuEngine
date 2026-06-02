import type { Signal } from "./types";

export type TimeView = {
  start: number;
  end: number;
};

export type ValueRange = {
  min: number;
  max: number;
};

const roundTime = (value: number) => Number(value.toFixed(6));

export const clampView = (view: TimeView, duration: number): TimeView => {
  const safeDuration = Math.max(duration, 0);
  const width = Math.min(Math.max(view.end - view.start, 0.001), Math.max(safeDuration, 0.001));
  let start = Math.min(Math.max(view.start, 0), Math.max(safeDuration - width, 0));
  let end = start + width;

  if (view.end > safeDuration) {
    end = safeDuration;
    start = Math.max(0, end - width);
  }

  return { start: roundTime(start), end: roundTime(end) };
};

export const zoomView = (view: TimeView, zoomFactor: number, focalRatio: number, duration: number): TimeView => {
  const currentWidth = view.end - view.start;
  const nextWidth = Math.max(0.001, currentWidth * zoomFactor);
  const clampedFocalRatio = Math.min(Math.max(focalRatio, 0), 1);
  const focalTime = view.start + currentWidth * clampedFocalRatio;
  const start = focalTime - nextWidth * clampedFocalRatio;
  return clampView({ start, end: start + nextWidth }, duration);
};

export const panView = (view: TimeView, deltaSeconds: number, duration: number): TimeView =>
  clampView({ start: view.start + deltaSeconds, end: view.end + deltaSeconds }, duration);

export const clampSelection = (selection: TimeView, viewport: TimeView, duration: number): TimeView => {
  const safeDuration = Math.max(duration, 0);
  const viewportStart = Math.max(0, viewport.start);
  const viewportEnd = Math.min(safeDuration, Math.max(viewport.end, viewportStart + 0.001));
  const width = Math.min(Math.max(selection.end - selection.start, 0.001), Math.max(viewportEnd - viewportStart, 0.001));
  const start = Math.min(Math.max(selection.start, viewportStart), viewportEnd - width);
  return { start: roundTime(start), end: roundTime(start + width) };
};

export const panSelection = (selection: TimeView, deltaSeconds: number, duration: number): TimeView => {
  const width = Math.max(selection.end - selection.start, 0.001);
  let start = selection.start + deltaSeconds;
  start = Math.min(Math.max(start, 0), Math.max(duration - width, 0));
  return { start: roundTime(start), end: roundTime(start + width) };
};

export const selectSignalWindow = (signal: Signal, view: TimeView): Signal => {
  const indexes = signal.time
    .map((time, index) => ({ time, index }))
    .filter(({ time }) => time >= view.start && time <= view.end)
    .map(({ index }) => index);

  return {
    ...signal,
    time: indexes.map((index) => signal.time[index]),
    values: indexes.map((index) => signal.values[index])
  };
};

export const createTimeTicks = (view: TimeView, count: number) => {
  const safeCount = Math.max(2, count);
  const span = view.end - view.start;
  return Array.from({ length: safeCount }, (_, index) => {
    const ratio = index / (safeCount - 1);
    const time = view.start + span * ratio;
    return {
      ratio,
      time,
      label: `${time.toFixed(3)}s`
    };
  });
};

export const readSignalAtTime = (signal: Signal | undefined, time: number) => {
  if (!signal || signal.time.length === 0 || signal.values.length === 0) return undefined;
  const safeTime = Number.isFinite(time) ? time : signal.time[0];
  let bestIndex = 0;
  let bestDistance = Math.abs(signal.time[0] - safeTime);

  for (let index = 1; index < signal.time.length; index += 1) {
    const distance = Math.abs(signal.time[index] - safeTime);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }

  return {
    index: bestIndex,
    time: roundTime(signal.time[bestIndex]),
    value: signal.values[bestIndex]
  };
};

export const createValueTicks = (min: number, max: number, count: number) => {
  const safeCount = Math.max(2, count);
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin + 1;
  const span = safeMax - safeMin || 1;

  return Array.from({ length: safeCount }, (_, index) => {
    const valueRatio = index / (safeCount - 1);
    const value = safeMin + span * valueRatio;
    return {
      ratio: Number((1 - valueRatio).toFixed(6)),
      value: Number(value.toFixed(6)),
      label: value.toFixed(3)
    };
  });
};

export const snapTimeToSample = (time: number, sampleRate: number, duration: number) => {
  const rate = Math.max(1, sampleRate);
  const safeDuration = Math.max(0, duration);
  const snapped = Math.round(time * rate) / rate;
  return roundTime(Math.min(safeDuration, Math.max(0, snapped)));
};

export const zoomValueRange = (range: ValueRange, factor: number, center: number): ValueRange => {
  const span = Math.max(1e-9, (range.max - range.min) * factor);
  return {
    min: Number((center - span / 2).toFixed(6)),
    max: Number((center + span / 2).toFixed(6))
  };
};

export const panValueRange = (range: ValueRange, ratio: number): ValueRange => {
  const delta = (range.max - range.min) * ratio;
  return {
    min: Number((range.min + delta).toFixed(6)),
    max: Number((range.max + delta).toFixed(6))
  };
};

export const decibels = (magnitude: number) => 20 * Math.log10(Math.max(Math.abs(magnitude), 1e-12));

export const signalDuration = (signal?: Signal) => {
  if (!signal || signal.time.length === 0) return 1;
  return signal.time[signal.time.length - 1] ?? signal.values.length / signal.sampleRate;
};
