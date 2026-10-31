import { useMemo, useRef, useState } from "react";
import {
  createValueTicks,
  decibels,
  type ScientificPlotModel,
  type ValueRange
} from "../signal";

type LinePlotModel = Extract<ScientificPlotModel, { kind: "line" }>;
type SpectrumPlotModel = Extract<ScientificPlotModel, { kind: "spectrum" }>;

export const scientificPlotPalette = ["#0891b2", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(3);
  return value.toFixed(4);
};

const axisText = (value: number, unit: string) => {
  const absolute = Math.abs(value);
  if (unit === "s" && absolute > 0 && absolute < 0.1) return `${formatNumber(value * 1000)} ms`;
  return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
};

const fullRange = (values: number[]): ValueRange => {
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? { min: min - 0.5, max: max + 0.5 } : { min, max };
};

const paddedRange = (values: number[]): ValueRange => {
  const range = fullRange(values);
  const padding = Math.max((range.max - range.min) * 0.08, 1e-12);
  return { min: range.min - padding, max: range.max + padding };
};

const clampRange = (range: ValueRange, bounds: ValueRange): ValueRange => {
  const boundsSpan = Math.max(bounds.max - bounds.min, 1e-12);
  const width = Math.min(Math.max(range.max - range.min, boundsSpan / 100000), boundsSpan);
  let min = Math.max(bounds.min, Math.min(range.min, bounds.max - width));
  if (!Number.isFinite(min)) min = bounds.min;
  return { min, max: min + width };
};

const downsamplePairs = (x: number[], y: number[], limit: number) => {
  const length = Math.min(x.length, y.length);
  if (length <= limit) return Array.from({ length }, (_, index) => ({ x: x[index], y: y[index] }));
  const bucketCount = Math.max(1, Math.floor(limit / 2));
  const bucketSize = length / bucketCount;
  const output: Array<{ x: number; y: number }> = [];
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.min(length, Math.ceil((bucket + 1) * bucketSize));
    let minIndex = start;
    let maxIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      if (y[index] < y[minIndex]) minIndex = index;
      if (y[index] > y[maxIndex]) maxIndex = index;
    }
    [minIndex, maxIndex]
      .sort((left, right) => left - right)
      .forEach((index) => output.push({ x: x[index], y: y[index] }));
  }
  return output;
};

const nearestPoint = (x: number[], y: number[], target: number) => {
  const length = Math.min(x.length, y.length);
  if (length === 0) return undefined;
  let best = 0;
  let distance = Math.abs(x[0] - target);
  for (let index = 1; index < length; index += 1) {
    const candidate = Math.abs(x[index] - target);
    if (candidate < distance) {
      best = index;
      distance = candidate;
    }
  }
  return { index: best, x: x[best], y: y[best] };
};

export const ScientificSeriesPlot = ({
  model,
  comparisons = [],
  xRange,
  yRange,
  cursorX,
  cursorSeriesId,
  maxPreviewPoints = 1200,
  xScale = "linear",
  onXRange,
  onYRange,
  onCursorX
}: {
  model: LinePlotModel;
  comparisons?: LinePlotModel[];
  xRange?: ValueRange;
  yRange?: ValueRange;
  cursorX?: number;
  cursorSeriesId?: string;
  maxPreviewPoints?: number;
  xScale?: "linear" | "log";
  onXRange?: (range?: ValueRange) => void;
  onYRange?: (range?: ValueRange) => void;
  onCursorX?: (value: number) => void;
}) => {
  const plotRef = useRef<HTMLDivElement>(null);
  const allSeries = [model, ...comparisons];
  const cursorSeriesIndex = Math.max(0, allSeries.findIndex((series) => series.id === cursorSeriesId));
  const cursorSeries = allSeries[cursorSeriesIndex] ?? model;
  const xBounds = useMemo(() => fullRange(model.x), [model.x]);
  const activeXRange = xRange ?? xBounds;
  const visibleSeries = allSeries.map((series) => {
    const indexes = series.x
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => value >= activeXRange.min && value <= activeXRange.max)
      .map(({ index }) => index);
    return {
      ...series,
      x: indexes.map((index) => series.x[index]),
      y: indexes.map((index) => series.y[index])
    };
  });
  const visibleY = visibleSeries.flatMap((series) => series.y).filter(Number.isFinite);
  const autoYRange = paddedRange(visibleY.length > 0 ? visibleY : [0]);
  const activeYRange = yRange ?? autoYRange;
  const xSpan = Math.max(activeXRange.max - activeXRange.min, 1e-12);
  const ySpan = Math.max(activeYRange.max - activeYRange.min, 1e-12);
  const yTicks = createValueTicks(activeYRange.min, activeYRange.max, 5);
  const [hover, setHover] = useState<{ x: number; y: number }>();
  const [drag, setDrag] = useState<{ clientX: number; range: ValueRange; moved: boolean }>();

  const scaleX = (value: number) => {
    if (xScale === "log") {
      const safeMin = Math.max(activeXRange.min, Number.MIN_VALUE);
      const safeValue = Math.max(value, safeMin);
      const logSpan = Math.max(Math.log10(activeXRange.max) - Math.log10(safeMin), 1e-12);
      return ((Math.log10(safeValue) - Math.log10(safeMin)) / logSpan) * 100;
    }
    return ((value - activeXRange.min) / xSpan) * 100;
  };
  const unscaleX = (ratio: number) => {
    if (xScale === "log") {
      const safeMin = Math.max(activeXRange.min, Number.MIN_VALUE);
      return 10 ** (Math.log10(safeMin) + (Math.log10(activeXRange.max) - Math.log10(safeMin)) * ratio);
    }
    return activeXRange.min + xSpan * ratio;
  };
  const updateHover = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
    const point = nearestPoint(cursorSeries.x, cursorSeries.y, unscaleX(ratio));
    if (point) setHover({ x: point.x, y: point.y });
  };
  const paths = visibleSeries.map((series) => {
    const points = downsamplePairs(series.x, series.y, maxPreviewPoints);
    return points
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && (xScale !== "log" || point.x > 0))
      .map((point, index) => {
        const x = scaleX(point.x);
        const y = 92 - ((point.y - activeYRange.min) / ySpan) * 84;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`;
      })
      .join(" ");
  });
  const activeCursor = hover ?? (cursorX === undefined ? undefined : nearestPoint(cursorSeries.x, cursorSeries.y, cursorX));
  const cursorLeft = activeCursor ? scaleX(activeCursor.x) : undefined;
  const cursorTop = activeCursor ? 92 - ((activeCursor.y - activeYRange.min) / ySpan) * 84 : undefined;

  return (
    <div className="axis-chart scientific-chart">
      <div className="axis-title axis-title-y">{model.yLabel}{model.yUnit ? ` (${model.yUnit})` : ""}</div>
      <div className="y-axis">
        {yTicks.map((tick) => <span key={tick.label} style={{ top: `${tick.ratio * 100}%` }}>{tick.label}</span>)}
      </div>
      <div
        ref={plotRef}
        className={`plot-surface ${model.xAxis.linkToMaster ? "master-linked" : "independent"}`}
        onMouseDown={(event) => {
          if (event.button !== 0 || model.xAxis.linkToMaster) return;
          setDrag({ clientX: event.clientX, range: activeXRange, moved: false });
        }}
        onMouseMove={(event) => {
          updateHover(event.clientX);
          if (!drag || model.xAxis.linkToMaster) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const delta = ((drag.clientX - event.clientX) / Math.max(rect.width, 1)) * (drag.range.max - drag.range.min);
          onXRange?.(clampRange({ min: drag.range.min + delta, max: drag.range.max + delta }, xBounds));
          if (Math.abs(event.clientX - drag.clientX) > 3 && !drag.moved) setDrag({ ...drag, moved: true });
        }}
        onMouseUp={(event) => {
          if (!drag?.moved) {
            updateHover(event.clientX);
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)));
            onCursorX?.(nearestPoint(cursorSeries.x, cursorSeries.y, unscaleX(ratio))?.x ?? unscaleX(ratio));
          }
          setDrag(undefined);
        }}
        onMouseLeave={() => {
          setHover(undefined);
          setDrag(undefined);
        }}
        onWheel={(event) => {
          if (event.altKey) {
            event.preventDefault();
            const factor = event.deltaY > 0 ? 1.2 : 0.82;
            const center = activeCursor?.y ?? (activeYRange.min + activeYRange.max) / 2;
            const half = ((activeYRange.max - activeYRange.min) * factor) / 2;
            onYRange?.({ min: center - half, max: center + half });
            return;
          }
          if (model.xAxis.linkToMaster) return;
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)));
          const center = unscaleX(ratio);
          const factor = event.deltaY > 0 ? 1.22 : 0.82;
          const width = (activeXRange.max - activeXRange.min) * factor;
          onXRange?.(clampRange({ min: center - width * ratio, max: center + width * (1 - ratio) }, xBounds));
        }}
        onDoubleClick={() => {
          if (!model.xAxis.linkToMaster) onXRange?.(undefined);
          onYRange?.(undefined);
        }}
      >
        <svg className="chart-svg wide" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${model.title} scientific plot`}>
          <path className="chart-grid" d="M 0 8 H 100 M 0 29 H 100 M 0 50 H 100 M 0 71 H 100 M 0 92 H 100" />
          {activeYRange.min < 0 && activeYRange.max > 0 ? (
            <path className="zero-line" d={`M 0 ${(92 - ((0 - activeYRange.min) / ySpan) * 84).toFixed(3)} H 100`} />
          ) : null}
          {paths.map((path, index) => (
            <path key={visibleSeries[index].id} d={path} fill="none" stroke={scientificPlotPalette[index % scientificPlotPalette.length]} strokeWidth={index === 0 ? 1.8 : 1.25} opacity={index === 0 ? 1 : 0.76} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {cursorLeft !== undefined && cursorTop !== undefined && cursorLeft >= 0 && cursorLeft <= 100 ? (
          <>
            <span className="crosshair-x" style={{ left: `${cursorLeft}%` }} />
            <span className="crosshair-y" style={{ top: `${Math.min(100, Math.max(0, cursorTop))}%` }} />
            <span className="crosshair-point" style={{ left: `${cursorLeft}%`, top: `${Math.min(100, Math.max(0, cursorTop))}%`, borderColor: scientificPlotPalette[cursorSeriesIndex % scientificPlotPalette.length] }} />
            {hover ? (
              <span className="crosshair-tooltip">
                {axisText(activeCursor?.x ?? 0, model.xAxis.unit)}
                <strong>{formatNumber(activeCursor?.y ?? 0)} {cursorSeries.yUnit}</strong>
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="x-axis">
        <span>{axisText(activeXRange.min, model.xAxis.unit)}</span>
        <span>{axisText((activeXRange.min + activeXRange.max) / 2, model.xAxis.unit)}</span>
        <span>{axisText(activeXRange.max, model.xAxis.unit)}</span>
      </div>
      <div className="axis-title axis-title-x">{model.xAxis.label}{model.xAxis.unit ? ` (${model.xAxis.unit})` : ""}</div>
    </div>
  );
};

export const ScientificSpectrumPlot = ({
  model,
  magnitudeMode,
  frequencyScale,
  xRange,
  yRange,
  onXRange,
  onYRange
}: {
  model: SpectrumPlotModel;
  magnitudeMode: "linear" | "db";
  frequencyScale: "linear" | "log";
  xRange?: ValueRange;
  yRange?: ValueRange;
  onXRange?: (range?: ValueRange) => void;
  onYRange?: (range?: ValueRange) => void;
}) => {
  const frequency = frequencyScale === "log" ? model.frequency.filter((value) => value > 0) : model.frequency;
  const startIndex = frequencyScale === "log" ? model.frequency.findIndex((value) => value > 0) : 0;
  const magnitude = model.magnitude.slice(Math.max(0, startIndex));
  const values = magnitudeMode === "db" ? magnitude.map(decibels) : magnitude;
  const peakIndex = values.reduce((best, value, index) => (value > (values[best] ?? -Infinity) ? index : best), 0);
  const lineModel: LinePlotModel = {
    kind: "line",
    id: model.id,
    title: model.title,
    x: frequency,
    y: values,
    xAxis: model.xAxis,
    yLabel: magnitudeMode === "db" ? "Magnitude" : model.yLabel,
    yUnit: magnitudeMode === "db" ? "dB" : model.yUnit
  };
  return (
    <div className="spectrum-line-panel">
      <ScientificSeriesPlot
        model={lineModel}
        xRange={xRange}
        yRange={yRange}
        xScale={frequencyScale}
        onXRange={onXRange}
        onYRange={onYRange}
      />
      <div className="spectrum-peak-readout">
        Peak <strong>{axisText(frequency[peakIndex] ?? 0, "Hz")}</strong>
        <span>{formatNumber(values[peakIndex] ?? 0)} {magnitudeMode === "db" ? "dB" : model.yUnit}</span>
      </div>
    </div>
  );
};

export const ScientificHistogramPlot = ({
  model
}: {
  model: Extract<ScientificPlotModel, { kind: "histogram" }>;
}) => {
  const [mode, setMode] = useState<"count" | "density">("count");
  const values = mode === "count" ? model.counts : model.density;
  const peak = Math.max(...values, 1e-12);
  const yTicks = createValueTicks(0, peak, 5);
  const xMin = model.binEdges[0] ?? 0;
  const xMax = model.binEdges[model.binEdges.length - 1] ?? xMin + 1;
  return (
    <div className="axis-chart scientific-chart histogram-plot">
      <div className="axis-title axis-title-y">{mode === "count" ? "Count (samples)" : "Probability density"}</div>
      <div className="y-axis">
        {yTicks.map((tick) => <span key={tick.label} style={{ top: `${tick.ratio * 100}%` }}>{tick.label}</span>)}
      </div>
      <div className="histogram-surface">
        <div className="histogram-mode compact-segments">
          <button className={mode === "count" ? "active" : ""} onClick={() => setMode("count")}>Count</button>
          <button className={mode === "density" ? "active" : ""} onClick={() => setMode("density")}>Density</button>
        </div>
        <div className="histogram-bars">
          {values.map((value, index) => (
            <span
              key={index}
              title={`${axisText(model.binEdges[index] ?? 0, model.xAxis.unit)} to ${axisText(model.binEdges[index + 1] ?? 0, model.xAxis.unit)}: ${formatNumber(value)}`}
              style={{ height: `${Math.max(1, (value / peak) * 100)}%` }}
            />
          ))}
        </div>
      </div>
      <div className="x-axis">
        <span>{axisText(xMin, model.xAxis.unit)}</span>
        <span>{axisText((xMin + xMax) / 2, model.xAxis.unit)}</span>
        <span>{axisText(xMax, model.xAxis.unit)}</span>
      </div>
      <div className="axis-title axis-title-x">{model.xAxis.label}{model.xAxis.unit ? ` (${model.xAxis.unit})` : ""}</div>
      <div className="chart-legend">
        <span><i />{model.counts.length} bins · {model.counts.reduce((sum, count) => sum + count, 0).toLocaleString()} samples</span>
      </div>
    </div>
  );
};
