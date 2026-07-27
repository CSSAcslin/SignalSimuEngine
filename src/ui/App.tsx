import {
  Activity,
  ArrowDownToLine,
  Braces,
  Cable,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Database,
  Copy,
  Eraser,
  Eye,
  Expand,
  FileCode,
  FileJson,
  FlaskConical,
  Focus,
  FolderOpen,
  GitBranch,
  Hand,
  Hash,
  Layers3,
  Maximize2,
  Minimize2,
  Minus,
  MoreVertical,
  MousePointer2,
  PanelRight,
  Plus,
  Radical,
  Repeat,
  Redo2,
  Save,
  Scan,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareActivity,
  TableCellsSplit,
  Terminal,
  Triangle,
  Trash2,
  Undo2,
  Ungroup,
  Upload,
  ZoomIn,
  ZoomOut,
  Waves,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createCustomExpressionInputRows, isEditableEventTarget } from "./inspectorHelpers";
import { FloatingPanel, type FloatingPanelPosition } from "./FloatingPanel";
import { scientificPlotPalette, ScientificHistogramPlot, ScientificSeriesPlot, ScientificSpectrumPlot } from "./ScientificPlot";
import {
  canConnectGraphNodes,
  clearGraphCanvas,
  clampSelection,
  clampView,
  connectGraphNodes,
  createRandomSeed,
  createExternalCommandRequest,
  createTimeTicks,
  createTimeFrequencyView,
  createValueTicks,
  decibels,
  duplicateGraphNode,
  duplicateGraphNodes,
  duplicateGraphGroups,
  evaluateGraph,
  fftSpectrum,
  exportAnalysisCsv,
  exportAnalysisJson,
  exportCsv,
  exportNpyFloat64,
  exportPython,
  getModuleDefinition,
  getGraphGroupNodeIds,
  groupGraphNodes,
  moduleDefinitions,
  moveGraphNodes,
  moveGraphGroups,
  panSelection,
  panValueRange,
  panView,
  parseCsvSignalData,
  parseProjectJson,
  readSignalAtTime,
  checkAnalysisBackendStatus,
  removeGraphEdge,
  removeGraphNode,
  removeGraphNodes,
  removeGraphGroups,
  createTimeFrequencyRequest,
  createAnalysisPlotModel,
  createSignalPlotModel,
  isRandomSourceKind,
  isTimeFrequencyNode,
  layoutSignalGraph,
  runExternalCommandBackend,
  runTimeFrequencyBackend,
  sampleGraph,
  selectSignalWindow,
  setDisplayNode,
  snapTimeToSample,
  summarizeAnalysisResult,
  ungroupGraphGroups,
  serializeProjectGraph,
  type AnalysisBackendStatus,
  type ModuleDefinition,
  type OperationKind,
  type ParamValue,
  type AnalysisResult,
  type ExternalCommandRequest,
  type ExternalCommandSignalResult,
  type GraphGroup,
  type LayoutPoint,
  type Signal,
  type SignalGraph,
  type SignalNode,
  type SourceKind,
  type Spectrum,
  type ScientificPlotModel,
  type TimeView,
  zoomValueRange,
  zoomView
} from "../signal";

const downloadText = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const createNodeFromDefinition = (definition: ModuleDefinition, index: number, sampleRate: number, samples: number): SignalNode => {
  const params = Object.fromEntries(definition.params.map((param) => [param.key, param.defaultValue])) as Record<string, ParamValue>;
  const base = {
    id: `${definition.kind}-${Date.now()}-${index}`,
    name: definition.label,
    position: { x: 120 + (index % 3) * 250, y: 90 + Math.floor(index / 3) * 140 },
    timelineOffset: 0,
    params
  };

  if (definition.type === "source") {
    return {
      ...base,
      type: "source",
      kind: definition.kind as SourceKind,
      sampleRate,
      length: samples,
      seed: isRandomSourceKind(definition.kind as SourceKind) ? createRandomSeed() : undefined
    };
  }

  return {
    ...base,
    type: "operation",
    kind: definition.kind as OperationKind
  };
};

const externalCommandResultToSignal = (node: SignalNode, request: ExternalCommandRequest, result: ExternalCommandSignalResult): Signal => ({
  id: node.id,
  name: node.name,
  sampleRate: request.sampleRate,
  unit: result.unit ?? "a.u.",
  time: result.values.map((_, index) => index / request.sampleRate),
  values: result.values,
  params: { ...node.params },
  timelineOffset: node.timelineOffset,
  provenance: {
    nodeId: node.id,
    nodeName: node.name,
    nodeKind: node.kind,
    inputNodeIds: request.inputs.map((input) => input.id),
    params: { ...node.params },
    sampleRate: request.sampleRate,
    sampleCount: result.values.length,
    unit: result.unit ?? "a.u.",
    backend: "external-command",
    warnings: result.warnings ?? [],
    metadata: result.metadata
  }
});

const parseArray = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));

const graphSampleRate = (graph: SignalGraph) => graph.sampleRate ?? 1000;
const graphSamples = (graph: SignalGraph) => graph.samples ?? 1000;
const graphDuration = (graph: SignalGraph) => graphSamples(graph) / graphSampleRate(graph);
const clampPositiveInteger = (value: number, fallback: number) => {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.round(value));
};
const clampNumber = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

const moduleIconMap: Record<string, LucideIcon | string> = {
  sine: Waves,
  triangle: Triangle,
  square: Square,
  pulse: CircleDot,
  gaussianPulse: SquareActivity,
  chirp: Sparkles,
  noise: Shuffle,
  photonCounts: CircleDot,
  constant: "C",
  import: Upload,
  customSource: Braces,
  add: Plus,
  subtract: Minus,
  multiply: "x",
  scale: SlidersHorizontal,
  customExpression: Braces,
  externalCommand: Terminal,
  delay: Clock,
  convolve: Repeat,
  correlate: GitBranch,
  fft: "FFT",
  normalize: Focus,
  rms: Radical,
  quantiles: "P%",
  distribution: TableCellsSplit,
  snr: "SNR",
  dominantFrequency: Hash,
  bandwidth: Maximize2,
  secondOrderCorrelation: "G2",
  stft: "STFT",
  cwt: "CWT"
};

const ModuleIcon = ({ kind, size = 16 }: { kind: string; size?: number }) => {
  const icon = moduleIconMap[kind] ?? Sigma;
  if (typeof icon === "string") return <span className={`module-icon-text ${icon.length > 2 ? "compact" : ""}`}>{icon}</span>;
  const Icon = icon;
  return <Icon size={size} />;
};

const downsample = (values: number[], maxPoints = 180) => {
  if (values.length <= maxPoints) return values.map((value, index) => ({ index, value }));
  const step = Math.ceil(values.length / maxPoints);
  return values.filter((_, index) => index % step === 0).map((value, index) => ({ index: index * step, value }));
};

type ValueRange = {
  min: number;
  max: number;
};

const expandRange = (min: number, max: number): ValueRange => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1, max: 1 };
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.2, 1);
    return { min: min - padding, max: max + padding };
  }
  const padding = (max - min) * 0.08;
  return { min: min - padding, max: max + padding };
};

const formatValue = (value: number | undefined) => {
  if (value === undefined || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(3);
  return value.toFixed(4);
};

const summarizeParams = (params: Record<string, ParamValue>) => {
  const entries = Object.entries(params);
  if (entries.length === 0) return "None";
  return entries
    .slice(0, 4)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? `[${value.length}]` : String(value)}`)
    .join(", ");
};

const SignalLine = ({
  signal,
  compareSignals = [],
  color = "#0ea5e9",
  timeView,
  currentTime,
  cursorValue,
  yRange,
  maxPreviewPoints,
  onYRange,
  onCurrentTime
}: {
  signal?: Signal;
  compareSignals?: Signal[];
  color?: string;
  timeView: TimeView;
  currentTime: number;
  cursorValue?: number;
  yRange?: ValueRange;
  maxPreviewPoints: number;
  onYRange: (range?: ValueRange) => void;
  onCurrentTime: (time: number) => void;
}) => {
  if (!signal || signal.values.length === 0) return <div className="chart-empty">No signal selected</div>;
  const windowedSignal = selectSignalWindow(signal, timeView);
  const windowedCompare = compareSignals.map((item) => selectSignalWindow(item, timeView));
  const points = downsample(windowedSignal.values, maxPreviewPoints);
  if (points.length === 0) return <div className="chart-empty">No samples in visible window</div>;
  const visibleValues = [windowedSignal, ...windowedCompare].flatMap((item) => item.values);
  const autoRange = expandRange(Math.min(...visibleValues), Math.max(...visibleValues));
  const { min, max } = yRange ?? autoRange;
  const span = max - min || 1;
  const yTicks = createValueTicks(min, max, 5);
  const cursorLeft = ((currentTime - timeView.start) / Math.max(timeView.end - timeView.start, 0.001)) * 100;
  const cursorTop = cursorValue === undefined ? undefined : 88 - ((cursorValue - min) / span) * 76;
  const compareColors = ["#22c55e", "#f59e0b", "#a855f7", "#ef4444"];
  const [valueDragStart, setValueDragStart] = useState<{ y: number; range: ValueRange }>();
  const visibleSpan = Math.max(timeView.end - timeView.start, 0.001);
  const path = points
    .map((point, index) => {
      const pointTime = windowedSignal.time[point.index] ?? windowedSignal.time[index] ?? timeView.start;
      const x = ((pointTime - timeView.start) / visibleSpan) * 100;
      const y = 88 - ((point.value - min) / span) * 76;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div
      className="axis-chart"
      onMouseDown={(event) => {
        if (!event.altKey && event.button !== 1) return;
        event.preventDefault();
        setValueDragStart({ y: event.clientY, range: yRange ?? autoRange });
      }}
      onMouseMove={(event) => {
        if (valueDragStart) {
          const deltaRatio = (event.clientY - valueDragStart.y) / Math.max((event.currentTarget as HTMLElement).clientHeight, 1);
          onYRange(panValueRange(valueDragStart.range, deltaRatio));
          return;
        }
        if (event.buttons !== 1) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left - 58) / Math.max(rect.width - 58, 1);
        onCurrentTime(snapTimeToSample(timeView.start + (timeView.end - timeView.start) * Math.min(1, Math.max(0, ratio)), signal.sampleRate, signal.time[signal.time.length - 1] ?? timeView.end));
      }}
      onMouseUp={() => setValueDragStart(undefined)}
      onMouseLeave={() => setValueDragStart(undefined)}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left - 58) / Math.max(rect.width - 58, 1);
        onCurrentTime(snapTimeToSample(timeView.start + (timeView.end - timeView.start) * Math.min(1, Math.max(0, ratio)), signal.sampleRate, signal.time[signal.time.length - 1] ?? timeView.end));
      }}
      onWheel={(event) => {
        if (!event.altKey) return;
        event.preventDefault();
        const factor = event.deltaY > 0 ? 1.22 : 0.82;
        const center = cursorValue ?? (min + max) / 2;
        onYRange(zoomValueRange({ min, max }, factor, center));
      }}
      onDoubleClick={() => onYRange(undefined)}
    >
      <div className="y-axis">
        {yTicks.map((tick) => (
          <span key={tick.label} style={{ top: `${tick.ratio * 100}%` }}>{tick.label}</span>
        ))}
      </div>
      <svg className="chart-svg wide" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${signal.name} waveform`}>
        <path className="chart-grid" d="M 0 12 H 100 M 0 31 H 100 M 0 50 H 100 M 0 69 H 100 M 0 88 H 100" />
        {min < 0 && max > 0 ? <path className="zero-line" d={`M 0 ${(88 - ((0 - min) / span) * 76).toFixed(2)} H 100`} /> : null}
        {windowedCompare.map((item, signalIndex) => {
          const comparePoints = downsample(item.values, maxPreviewPoints);
          const comparePath = comparePoints
            .map((point, index) => {
              const pointTime = item.time[point.index] ?? item.time[index] ?? timeView.start;
              const x = ((pointTime - timeView.start) / visibleSpan) * 100;
              const y = 88 - ((point.value - min) / span) * 76;
              return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(" ");
          return <path key={item.id} d={comparePath} fill="none" stroke={compareColors[signalIndex % compareColors.length]} strokeWidth="1.35" opacity="0.78" vectorEffect="non-scaling-stroke" />;
        })}
        <path d={path} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        {currentTime >= timeView.start && currentTime <= timeView.end ? (
          <>
            <path className="chart-cursor-line" d={`M ${Math.min(100, Math.max(0, cursorLeft)).toFixed(2)} 8 V 92`} />
            {cursorTop !== undefined ? <circle cx={Math.min(100, Math.max(0, cursorLeft))} cy={Math.min(92, Math.max(8, cursorTop))} r="1.6" className="chart-cursor-dot" /> : null}
          </>
        ) : null}
      </svg>
      <div className="x-axis">
        <span>{timeView.start.toFixed(3)}s</span>
        <span>{((timeView.start + timeView.end) / 2).toFixed(3)}s</span>
        <span>{timeView.end.toFixed(3)}s</span>
      </div>
      <div className="chart-legend">
        <span><i style={{ background: color }} />{signal.name}: {formatValue(readSignalAtTime(signal, currentTime)?.value)}</span>
        {compareSignals.map((item, index) => (
          <span key={item.id}><i style={{ background: compareColors[index % compareColors.length] }} />{item.name}: {formatValue(readSignalAtTime(item, currentTime)?.value)}</span>
        ))}
      </div>
    </div>
  );
};

const SpectrumBars = ({ signal, spectrumData, mode }: { signal?: Signal; spectrumData?: Spectrum; mode: "linear" | "db" }) => {
  const spectrum = useMemo(() => {
    if (spectrumData) return spectrumData.magnitude.slice(1, 46);
    if (!signal) return [];
    const n = Math.min(signal.values.length, 192);
    return Array.from({ length: Math.floor(n / 2) }, (_, k) => {
      let real = 0;
      let imag = 0;
      for (let index = 0; index < n; index += 1) {
        const angle = (-2 * Math.PI * k * index) / n;
        real += signal.values[index] * Math.cos(angle);
        imag += signal.values[index] * Math.sin(angle);
      }
      return Math.sqrt(real * real + imag * imag) / n;
    }).slice(1, 46);
  }, [signal, spectrumData]);

  if (!signal && !spectrumData) return <div className="chart-empty">No spectrum available</div>;
  const displayed = mode === "db" ? spectrum.map(decibels) : spectrum;
  const floor = mode === "db" ? Math.min(...displayed, -120) : 0;
  const peak = Math.max(...displayed, mode === "db" ? -120 : 1);
  const span = peak - floor || 1;
  const peakIndex = displayed.reduce((best, value, index) => (value > displayed[best] ? index : best), 0);
  const maxFrequency = spectrumData ? spectrumData.frequency[spectrumData.frequency.length - 1] ?? 0 : (signal?.sampleRate ?? 0) / 2;
  const yTicks = createValueTicks(floor, peak, 4);
  return (
    <div className="axis-chart spectrum-chart" role="img" aria-label={`${signal?.name ?? "analysis"} frequency spectrum`}>
      <div className="y-axis">
        {yTicks.map((tick) => (
          <span key={tick.label} style={{ top: `${tick.ratio * 100}%` }}>{tick.label}</span>
        ))}
      </div>
      <div className="spectrum-bars">
        {displayed.map((value, index) => (
          <span
            key={index}
            className={index === peakIndex ? "peak" : ""}
            title={`${(((index + 1) / Math.max(displayed.length, 1)) * maxFrequency).toFixed(2)} Hz, ${formatValue(value)}${mode === "db" ? " dB" : ""}`}
            style={{ height: `${Math.max(4, ((value - floor) / span) * 100)}%` }}
          />
        ))}
      </div>
      <div className="x-axis">
        <span>0 Hz</span>
        <span>{(maxFrequency / 2).toFixed(1)} Hz</span>
        <span>{maxFrequency.toFixed(1)} Hz</span>
      </div>
      <div className="chart-legend spectrum-peak">
        <span><i />Peak {(((peakIndex + 1) / Math.max(displayed.length, 1)) * maxFrequency).toFixed(2)} Hz, {formatValue(displayed[peakIndex])}{mode === "db" ? " dB" : ""}</span>
      </div>
    </div>
  );
};

const AnalysisPanel = ({ analysis }: { analysis?: AnalysisResult }) => {
  if (!analysis) return <div className="chart-empty">No analysis result selected</div>;
  if (analysis.type === "scalar") {
    return (
      <div className="analysis-result-panel">
        <div className="analysis-metric-card">
          <span>{analysis.label}</span>
          <strong>{formatValue(analysis.value)}</strong>
          <em>{analysis.unit}</em>
        </div>
      </div>
    );
  }

  if (analysis.type === "summary") {
    return (
      <div className="analysis-result-panel">
        <div className="analysis-summary-grid">
          {analysis.metrics.map((metric) => (
            <div className="analysis-metric-card compact" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{formatValue(metric.value)}</strong>
              <em>{metric.unit}</em>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (analysis.type === "distribution") {
    const model = createAnalysisPlotModel(analysis);
    return model.kind === "histogram" ? <ScientificHistogramPlot model={model} /> : <div className="chart-empty">Invalid distribution result</div>;
  }

  if (analysis.type === "time-frequency-pending" || analysis.type === "time-frequency-error") {
    return (
      <div className="analysis-result-panel">
        <div className="analysis-pending-card">
          {analysis.type === "time-frequency-pending" ? <span className="spinner" /> : null}
          <div>
            <strong>{analysis.method} {analysis.status === "running" ? "running" : analysis.status === "error" ? "backend error" : "queued for backend"}</strong>
            <p>{analysis.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (analysis.type === "time-frequency") {
    const view = createTimeFrequencyView(analysis, { maxRows: 52, maxColumns: 110 });
    const columns = Math.max(...view.cells.map((cell) => cell.column + 1), 1);
    return (
      <div className="time-frequency-panel">
        <div className="time-frequency-readout">
          <span>{analysis.method}</span>
          <strong>{view.rowCount} x {view.columnCount}</strong>
          <em>Peak {formatValue(view.peak.value)} {analysis.unit} @ {formatValue(view.peak.frequency)} Hz, {formatValue(view.peak.time)} s</em>
        </div>
        <div className="time-frequency-chart">
          <div className="tf-y-title">Frequency (Hz)</div>
          <div className="tf-y-axis">
            <span>{view.yLabels[1]}</span>
            <span>{view.yLabels[0]}</span>
          </div>
          <div className="time-frequency-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {view.cells.map((cell) => (
              <span
                key={`${cell.row}-${cell.column}`}
                title={`${cell.frequency.toFixed(3)} Hz, ${cell.time.toFixed(3)} s, ${formatValue(cell.value)} ${analysis.unit}`}
                style={{ opacity: 0.18 + 0.82 * cell.intensity }}
              />
            ))}
          </div>
          <div className="tf-colorbar"><span>High</span><i /><span>Low</span></div>
          <div className="tf-x-axis">
            {view.xLabels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}
          </div>
          <div className="tf-x-title">Time (s)</div>
        </div>
        <div className="chart-legend spectrum-peak">
          <span><i />Intensity is downsampled for preview; exports keep full-resolution {analysis.unit} values.</span>
        </div>
      </div>
    );
  }

  return <SpectrumBars spectrumData={{ frequency: analysis.frequency, magnitude: analysis.magnitude }} mode="linear" />;
};

const GroupResultsPanel = ({
  group,
  nodeIds,
  nodes,
  signals,
  analyses
}: {
  group: GraphGroup;
  nodeIds: string[];
  nodes: SignalNode[];
  signals: Map<string, Signal>;
  analyses: Map<string, AnalysisResult>;
}) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const lineBuckets = new Map<string, Extract<ScientificPlotModel, { kind: "line" }>[]>();
  nodeIds.forEach((id) => {
    const signal = signals.get(id);
    if (!signal) return;
    const plot = createSignalPlotModel(signal);
    if (plot.kind !== "line") return;
    const key = `${plot.xAxis.kind}:${plot.xAxis.unit}:${plot.xAxis.linkToMaster}`;
    lineBuckets.set(key, [...(lineBuckets.get(key) ?? []), { ...plot, title: nodeMap.get(id)?.name ?? plot.title }]);
  });
  const metricEntries = nodeIds
    .map((id) => ({ node: nodeMap.get(id), analysis: analyses.get(id) }))
    .filter(
      (entry): entry is { node: SignalNode; analysis: Extract<AnalysisResult, { type: "scalar" | "summary" }> } =>
        Boolean(entry.node && entry.analysis && (entry.analysis.type === "scalar" || entry.analysis.type === "summary"))
    );
  const visualEntries = nodeIds
    .map((id) => ({ node: nodeMap.get(id), analysis: analyses.get(id) }))
    .filter(
      (entry): entry is { node: SignalNode; analysis: AnalysisResult } =>
        Boolean(entry.node && entry.analysis && entry.analysis.type !== "scalar" && entry.analysis.type !== "summary")
    );
  const lineViews = [...lineBuckets.entries()].map(([key, plots], index) => ({
    key: `line:${key}`,
    label: plots[0]?.xAxis.kind === "frequency" ? `Frequency ${index + 1}` : plots[0]?.xAxis.kind === "delay" ? `Delay ${index + 1}` : `Series ${index + 1}`,
    plots
  }));
  const views = [
    ...lineViews.map((view) => ({ key: view.key, label: view.label })),
    ...(metricEntries.length > 0 ? [{ key: "metrics", label: "Metrics" }] : []),
    ...visualEntries.map((entry) => ({ key: `analysis:${entry.node.id}`, label: entry.node.name }))
  ];
  const [activeKey, setActiveKey] = useState(views[0]?.key ?? "empty");
  const [xRange, setXRange] = useState<ValueRange>();
  const [yRange, setYRange] = useState<ValueRange>();
  const [cursorX, setCursorX] = useState<number>();
  useEffect(() => {
    if (!views.some((view) => view.key === activeKey)) setActiveKey(views[0]?.key ?? "empty");
    setXRange(undefined);
    setYRange(undefined);
  }, [activeKey, group.id, views.map((view) => view.key).join("|")]);

  const activeLine = lineViews.find((view) => view.key === activeKey);
  const activeVisual = visualEntries.find((entry) => `analysis:${entry.node.id}` === activeKey);

  return (
    <div className="group-results-panel">
      <div className="group-results-tabs">
        {views.map((view) => (
          <button key={view.key} className={activeKey === view.key ? "active" : ""} onClick={() => setActiveKey(view.key)}>
            {view.label}
          </button>
        ))}
      </div>
      <div className="group-results-content">
        {activeLine && activeLine.plots.length > 0 ? (
          <div className="group-series-view">
            <div className="group-results-legend">
              {activeLine.plots.map((plot, index) => (
                <span key={plot.id}>
                  <i style={{ background: scientificPlotPalette[index % scientificPlotPalette.length] }} />
                  {plot.title}
                </span>
              ))}
            </div>
            <ScientificSeriesPlot
              model={activeLine.plots[0]}
              comparisons={activeLine.plots.slice(1)}
              xRange={xRange}
              yRange={yRange}
              cursorX={cursorX ?? activeLine.plots[0].x[0]}
              maxPreviewPoints={1200}
              onXRange={setXRange}
              onYRange={setYRange}
              onCursorX={setCursorX}
            />
          </div>
        ) : activeKey === "metrics" ? (
          <div className="group-metric-grid">
            {metricEntries.map(({ node, analysis }) => (
              <section key={node.id}>
                <strong>{node.name}</strong>
                {analysis.type === "scalar" ? (
                  <div className="analysis-metric-card compact">
                    <span>{analysis.label}</span>
                    <strong>{formatValue(analysis.value)}</strong>
                    <em>{analysis.unit}</em>
                  </div>
                ) : (
                  <div className="analysis-summary-grid">
                    {analysis.metrics.map((metric) => (
                      <div className="analysis-metric-card compact" key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{formatValue(metric.value)}</strong>
                        <em>{metric.unit}</em>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : activeVisual ? (
          <div className="group-analysis-view">
            <AnalysisPanel analysis={activeVisual.analysis} />
          </div>
        ) : (
          <div className="chart-empty">No group results are available yet.</div>
        )}
      </div>
    </div>
  );
};

const InspectorAnalysisResult = ({ analysis }: { analysis: AnalysisResult }) => {
  const summary = summarizeAnalysisResult(analysis);
  const spectrumPoints =
    analysis.type === "spectrum"
      ? downsample(analysis.magnitude, 42).map((point, index, points) => {
          const max = Math.max(...points.map((item) => item.value), 1e-12);
          const x = (index / Math.max(points.length - 1, 1)) * 100;
          const y = 26 - (point.value / max) * 22;
          return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
        })
      : [];
  const timeFrequencyView = analysis.type === "time-frequency" ? createTimeFrequencyView(analysis, { maxRows: 12, maxColumns: 32 }) : undefined;
  const distributionMax = analysis.type === "distribution" ? Math.max(...analysis.counts, 1) : 1;

  return (
    <>
      <div className="analysis-inspector-head">
        <span>{summary.primaryLabel}</span>
        <strong>{summary.primaryText ?? formatValue(summary.primaryValue)}</strong>
        {summary.unit ? <em>{summary.unit}</em> : null}
      </div>
      {analysis.type === "spectrum" ? (
        <svg className="analysis-mini-spectrum" viewBox="0 0 100 30" preserveAspectRatio="none" aria-label={`${analysis.name} spectrum preview`}>
          <path d={spectrumPoints.join(" ")} />
        </svg>
      ) : null}
      {timeFrequencyView ? (
        <div className="analysis-mini-heatmap" style={{ gridTemplateColumns: `repeat(${Math.max(...timeFrequencyView.cells.map((cell) => cell.column + 1), 1)}, 1fr)` }}>
          {timeFrequencyView.cells.map((cell) => (
            <span
              key={`${cell.row}-${cell.column}`}
              title={`${cell.frequency.toFixed(3)} Hz, ${cell.time.toFixed(3)} s, ${formatValue(cell.value)}`}
              style={{ opacity: 0.18 + 0.82 * cell.intensity }}
            />
          ))}
        </div>
      ) : null}
      {analysis.type === "distribution" ? (
        <div className="analysis-mini-distribution">
          {analysis.counts.map((count, index) => (
            <span key={index} style={{ height: `${Math.max(8, (count / distributionMax) * 100)}%` }} />
          ))}
        </div>
      ) : null}
      {analysis.type === "summary" ? (
        <div className="analysis-summary-list">
          {analysis.metrics.map((metric) => (
            <span key={metric.label}>{metric.label}: {formatValue(metric.value)} {metric.unit}</span>
          ))}
        </div>
      ) : null}
      {analysis.type === "time-frequency-pending" ? (
        <div className="analysis-backend-note">
          <span className="spinner tiny" />
          <span>{analysis.message}</span>
        </div>
      ) : null}
      <dl>
        {summary.rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd title={row.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
};

const ProvenanceBox = ({ provenance }: { provenance?: Signal["provenance"] }) => {
  if (!provenance) return null;
  return (
    <dl>
      <dt>Node</dt>
      <dd>{provenance.nodeName} / {provenance.nodeKind}</dd>
      <dt>Inputs</dt>
      <dd>{provenance.inputNodeIds.length > 0 ? provenance.inputNodeIds.join(", ") : "None"}</dd>
      <dt>Samples</dt>
      <dd>{provenance.sampleCount?.toLocaleString() ?? "-"}</dd>
      <dt>Rate</dt>
      <dd>{provenance.sampleRate ? `${provenance.sampleRate.toLocaleString()} Hz` : "-"}</dd>
      <dt>Backend</dt>
      <dd>{provenance.backend ?? "TypeScript core"}</dd>
      <dt>Warnings</dt>
      <dd>{provenance.warnings && provenance.warnings.length > 0 ? provenance.warnings.join("; ") : "None"}</dd>
      <dt>Metadata</dt>
      <dd title={JSON.stringify(provenance.metadata ?? {})}>{provenance.metadata ? JSON.stringify(provenance.metadata) : "None"}</dd>
    </dl>
  );
};

const CollapsiblePanel = ({
  title,
  icon,
  defaultOpen = true,
  children,
  className = "provenance-box"
}: {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button className="collapsible-title" type="button" onClick={() => setIsOpen((open) => !open)} aria-expanded={isOpen}>
        <span className="collapsible-label">
          {icon}
          <span>{title}</span>
        </span>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {isOpen ? <div className="collapsible-body">{children}</div> : null}
    </div>
  );
};

const ModuleLibrary = ({ onAdd }: { onAdd: (definition: ModuleDefinition) => void }) => {
  const [query, setQuery] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const libraryRef = useRef<HTMLElement | null>(null);
  const customKinds = new Set(["customSource", "customExpression", "externalCommand"]);
  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (definition: ModuleDefinition) => {
    if (!normalizedQuery) return true;
    return [definition.label, definition.description, definition.kind, definition.type]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  };
  const visibleDefinitions = moduleDefinitions.filter(matchesQuery);
  const sources = visibleDefinitions.filter((definition) => definition.type === "source" && !customKinds.has(definition.kind));
  const operations = visibleDefinitions.filter((definition) => definition.type === "operation" && !customKinds.has(definition.kind));
  const analysis = visibleDefinitions.filter((definition) => definition.type === "analysis");
  const custom = visibleDefinitions.filter((definition) => customKinds.has(definition.kind));
  const hasResults = sources.length + operations.length + analysis.length + custom.length > 0;

  return (
    <aside
      className="module-library"
      ref={libraryRef}
      onScroll={(event) => setShowScrollTop(event.currentTarget.scrollTop > 180)}
    >
      <div className="panel-title">
        <Database size={17} />
        <span>Module Library</span>
      </div>
      <label className="module-search">
        <Search size={14} />
        <input type="search" placeholder="Search modules" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {!hasResults ? <div className="module-empty">No modules match "{query}".</div> : null}
      <section>
        <h2>
          <Waves size={15} />
          Signal Sources
        </h2>
        <div className="module-list">
          {sources.map((definition) => (
            <button key={definition.kind} className={`module-card ${definition.type}`} draggable onDragStart={(event) => event.dataTransfer.setData("module-kind", definition.kind)} onClick={() => onAdd(definition)}>
              <i>
                <ModuleIcon kind={definition.kind} />
              </i>
              <span>{definition.label}</span>
              <small>{definition.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>
          <Sigma size={15} />
          Operations
        </h2>
        <div className="module-list">
          {operations.map((definition) => (
            <button key={definition.kind} className={`module-card ${definition.type}`} draggable onDragStart={(event) => event.dataTransfer.setData("module-kind", definition.kind)} onClick={() => onAdd(definition)}>
              <i>
                <ModuleIcon kind={definition.kind} />
              </i>
              <span>{definition.label}</span>
              <small>{definition.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>
          <Activity size={15} />
          Analysis
        </h2>
        <div className="module-list">
          {analysis.map((definition) => (
            <button key={definition.kind} className={`module-card ${definition.type}`} draggable onDragStart={(event) => event.dataTransfer.setData("module-kind", definition.kind)} onClick={() => onAdd(definition)}>
              <i>
                <ModuleIcon kind={definition.kind} />
              </i>
              <span>{definition.label}</span>
              <small>{definition.description}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>
          <Braces size={15} />
          Custom
        </h2>
        <div className="module-list">
          {custom.map((definition) => (
            <button key={definition.kind} className={`module-card ${definition.type}`} draggable onDragStart={(event) => event.dataTransfer.setData("module-kind", definition.kind)} onClick={() => onAdd(definition)}>
              <i>
                <ModuleIcon kind={definition.kind} />
              </i>
              <span>{definition.label}</span>
              <small>{definition.description}</small>
            </button>
          ))}
        </div>
      </section>
      {showScrollTop ? (
        <button className="module-scroll-top" type="button" onClick={() => libraryRef.current?.scrollTo({ top: 0, behavior: "smooth" })} title="Scroll module library to top">
          <ArrowDownToLine size={15} />
        </button>
      ) : null}
    </aside>
  );
};

const NodeCanvas = ({
  graph,
  mode,
  tool,
  selectedNodeIds,
  selectedGroupIds,
  errors,
  signals,
  previewView,
  canvasView,
  fitVersion,
  layoutRunning,
  connectFromId,
  dragConnection,
  selectedEdgeId,
  openNodeMenuId,
  connectionError,
  onSelect,
  onInspectNode,
  onSelectMany,
  onSelectGroup,
  onSelectEdge,
  onAdd,
  onMoveNodes,
  onMoveGroups,
  onDuplicateGroup,
  onDeleteGroup,
  onUngroupGroup,
  onRenameGroup,
  onOpenGroupResults,
  onGroup,
  onUngroup,
  onDuplicateSelection,
  onDeleteSelection,
  onDuplicateNode,
  onDeleteNode,
  onSetDisplayNode,
  onRenameNode,
  onToggleDisabled,
  onStartConnect,
  onDragConnect,
  onFinishConnect,
  onAutoLayout,
  onUndo,
  onRedo,
  onClear,
  onTool,
  onToggleInspector,
  onToggleResults,
  inspectorVisible,
  resultsVisible,
  onToggleFullscreen,
  canUndo,
  canRedo,
  canClear,
  onCanvasView
}: {
  graph: SignalGraph;
  mode: "embedded" | "fullscreen";
  tool: "select" | "hand";
  selectedNodeIds: string[];
  selectedGroupIds: string[];
  errors: Map<string, string>;
  signals: Map<string, Signal>;
  previewView: TimeView;
  canvasView: { x: number; y: number; zoom: number };
  fitVersion: number;
  layoutRunning: boolean;
  connectFromId?: string;
  dragConnection?: { fromId: string; x: number; y: number };
  selectedEdgeId?: string;
  openNodeMenuId?: string;
  connectionError?: string;
  onSelect: (id: string, append?: boolean) => void;
  onInspectNode: (id: string, anchor: LayoutPoint) => void;
  onSelectMany: (ids: string[], append?: boolean) => void;
  onSelectGroup: (id: string, append?: boolean) => void;
  onSelectEdge: (id: string) => void;
  onAdd: (definition: ModuleDefinition, position: { x: number; y: number }) => void;
  onMoveNodes: (ids: string[], delta: { x: number; y: number }) => void;
  onMoveGroups: (ids: string[], delta: { x: number; y: number }) => void;
  onDuplicateGroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
  onUngroupGroup: (id: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onOpenGroupResults: (id: string) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  onDuplicateNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onSetDisplayNode: (id: string) => void;
  onRenameNode: (id: string, name: string) => void;
  onToggleDisabled: (id: string) => void;
  onStartConnect: (id: string) => void;
  onDragConnect: (point?: { fromId: string; x: number; y: number }) => void;
  onFinishConnect: (id: string) => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onTool: (tool: "select" | "hand") => void;
  onToggleInspector: () => void;
  onToggleResults: () => void;
  inspectorVisible: boolean;
  resultsVisible: boolean;
  onToggleFullscreen: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  onCanvasView: (view: { x: number; y: number; zoom: number }) => void;
}) => {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const canvasRef = useRef<HTMLDivElement>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number; viewX: number; viewY: number }>();
  const [blankStart, setBlankStart] = useState<{ x: number; y: number; moved: boolean }>();
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; currentX: number; currentY: number }>();
  const [dragPreview, setDragPreview] = useState<{
    nodeIds: string[];
    delta: LayoutPoint;
  }>();
  const activeDragRef = useRef<{
    pointerId: number;
    kind: "nodes" | "groups";
    ids: string[];
    nodeIds: string[];
    primaryId?: string;
    clientX: number;
    clientY: number;
  } | undefined>(undefined);
  const pendingDragDeltaRef = useRef<LayoutPoint>({ x: 0, y: 0 });
  const dragFrameRef = useRef<number | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number }>();
  const [localOpenMenuId, setLocalOpenMenuId] = useState<string | undefined>(openNodeMenuId);
  const selectedSet = new Set(selectedNodeIds);
  const selectedGroupSet = new Set(selectedGroupIds);
  const disabledSet = new Set(graph.disabledNodeIds ?? []);
  const previewNodeSet = new Set(dragPreview?.nodeIds ?? []);
  const nodePosition = (node: SignalNode) =>
    previewNodeSet.has(node.id) && dragPreview
      ? { x: node.position.x + dragPreview.delta.x, y: node.position.y + dragPreview.delta.y }
      : node.position;
  const groupBounds = (graph.groups ?? [])
    .map((group) => {
      const resolvedNodeIds = getGraphGroupNodeIds(graph, [group.id]);
      const nodes = resolvedNodeIds.map((id) => nodeMap.get(id)).filter((node): node is SignalNode => Boolean(node));
      if (nodes.length < 2) return undefined;
      const padding = 22;
      const headerHeight = 28;
      const minX = Math.max(4, Math.min(...nodes.map((node) => nodePosition(node).x)) - padding);
      const minY = Math.max(4, Math.min(...nodes.map((node) => nodePosition(node).y)) - padding - headerHeight);
      const maxX = Math.max(...nodes.map((node) => nodePosition(node).x + 176)) + padding;
      const maxY = Math.max(...nodes.map((node) => nodePosition(node).y + 112)) + padding;
      return { group, memberCount: resolvedNodeIds.length, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    })
    .filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
    .sort((left, right) => right.width * right.height - left.width * left.height);
  const groupAtPoint = (x: number, y: number) =>
    [...groupBounds]
      .reverse()
      .find((bounds) => x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height);
  const groupHue = (id: string) => 170 + [...id].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) % 120, 0);
  const beginPointerDrag = (
    event: ReactPointerEvent<HTMLElement>,
    kind: "nodes" | "groups",
    ids: string[],
    nodeIds: string[],
    primaryId?: string
  ) => {
    if (event.button !== 0 || nodeIds.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    canvas?.setPointerCapture(event.pointerId);
    pendingDragDeltaRef.current = { x: 0, y: 0 };
    activeDragRef.current = {
      pointerId: event.pointerId,
      kind,
      ids,
      nodeIds,
      primaryId,
      clientX: event.clientX,
      clientY: event.clientY
    };
    setDragPreview({ nodeIds, delta: { x: 0, y: 0 } });
  };
  const updatePointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const delta = {
      x: (event.clientX - drag.clientX) / canvasView.zoom,
      y: (event.clientY - drag.clientY) / canvasView.zoom
    };
    pendingDragDeltaRef.current = delta;
    if (dragFrameRef.current === undefined) {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = undefined;
        const current = activeDragRef.current;
        if (current) setDragPreview({ nodeIds: current.nodeIds, delta: pendingDragDeltaRef.current });
      });
    }
    return true;
  };
  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    if (dragFrameRef.current !== undefined) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = undefined;
    const delta = pendingDragDeltaRef.current;
    const moved = Math.hypot(delta.x, delta.y) > 3 / canvasView.zoom;
    activeDragRef.current = undefined;
    setDragPreview(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (moved) {
      suppressClickRef.current = true;
      if (drag.kind === "groups") onMoveGroups(drag.ids, delta);
      else onMoveNodes(drag.ids, delta);
      requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });
    } else if (drag.kind === "nodes" && drag.primaryId && drag.ids.length === 1) {
      const node = nodeMap.get(drag.primaryId);
      const canvas = canvasRef.current;
      if (node && canvas) {
        const position = nodePosition(node);
        const rect = canvas.getBoundingClientRect();
        onInspectNode(drag.primaryId, {
          x: rect.left + canvasView.x + (position.x + 176) * canvasView.zoom + 12,
          y: rect.top + canvasView.y + position.y * canvasView.zoom
        });
      }
    }
    return true;
  };
  const canvasWorldWidth = Math.max(
    1600,
    ...graph.nodes.map((node) => nodePosition(node).x + 360),
    (dragConnection?.x ?? 0) + 240
  );
  const canvasWorldHeight = Math.max(
    900,
    ...graph.nodes.map((node) => nodePosition(node).y + 260),
    (dragConnection?.y ?? 0) + 180
  );
  const signalPath = (signal?: Signal) => {
    if (!signal || signal.values.length === 0) return "";
    const points = downsample(selectSignalWindow(signal, previewView).values, 32);
    const min = Math.min(...points.map((point) => point.value));
    const max = Math.max(...points.map((point) => point.value));
    const span = max - min || 1;
    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * 100;
        const y = 18 - ((point.value - min) / span) * 16;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  };
  const fitAllNodes = () => {
    if (graph.nodes.length === 0) {
      onCanvasView({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const canvas = canvasRef.current;
    const width = canvas?.clientWidth ?? 900;
    const height = canvas?.clientHeight ?? 520;
    const nodeWidth = 190;
    const nodeHeight = 118;
    const padding = 72;
    const minX = Math.min(...graph.nodes.map((node) => node.position.x));
    const minY = Math.min(...graph.nodes.map((node) => node.position.y));
    const maxX = Math.max(...graph.nodes.map((node) => node.position.x + nodeWidth));
    const maxY = Math.max(...graph.nodes.map((node) => node.position.y + nodeHeight));
    const boxWidth = Math.max(maxX - minX, 1);
    const boxHeight = Math.max(maxY - minY, 1);
    const zoom = Math.min(1.35, Math.max(0.55, Math.min((width - padding * 2) / boxWidth, (height - padding * 2) / boxHeight)));
    onCanvasView({
      x: (width - boxWidth * zoom) / 2 - minX * zoom,
      y: (height - boxHeight * zoom) / 2 - minY * zoom,
      zoom
    });
  };
  useEffect(() => {
    if (fitVersion > 0) fitAllNodes();
  }, [fitVersion]);

  return (
    <div className={`canvas-shell ${mode}`}>
      <div className="canvas-tools">
        {mode === "fullscreen" ? (
          <>
            <button className={tool === "select" ? "active" : ""} onClick={() => onTool("select")} title="Select and box select">
              <MousePointer2 size={14} />
            </button>
            <button className={tool === "hand" ? "active" : ""} onClick={() => onTool("hand")} title="Pan canvas">
              <Hand size={14} />
            </button>
            <i className="canvas-tool-separator" />
          </>
        ) : null}
        <button onClick={() => onCanvasView({ ...canvasView, zoom: Math.min(1.6, canvasView.zoom + 0.1) })} title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button onClick={() => onCanvasView({ ...canvasView, zoom: Math.max(0.55, canvasView.zoom - 0.1) })} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <button onClick={fitAllNodes} title="Fit all nodes">
          <Scan size={14} />
        </button>
        <button onClick={onAutoLayout} disabled={layoutRunning} title={layoutRunning ? "Computing layout" : "Auto layout"}>
          {layoutRunning ? <span className="spinner tiny" /> : <Workflow size={14} />}
        </button>
        <i className="canvas-tool-separator" />
        <button onClick={onUndo} disabled={!canUndo} title="Undo">
          <Undo2 size={14} />
        </button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo">
          <Redo2 size={14} />
        </button>
        {mode === "fullscreen" ? (
          <>
            <i className="canvas-tool-separator" />
            <button onClick={onGroup} disabled={selectedNodeIds.length + selectedGroupIds.length < 2} title="Group selected nodes and groups (Ctrl+G)">
              <Layers3 size={14} />
            </button>
            <button onClick={onUngroup} disabled={selectedGroupIds.length === 0} title="Ungroup selection (Ctrl+Shift+G)">
              <Ungroup size={14} />
            </button>
            <button onClick={onDuplicateSelection} disabled={selectedNodeIds.length === 0 && selectedGroupIds.length === 0} title="Duplicate selection">
              <Copy size={14} />
            </button>
            <button onClick={onDeleteSelection} disabled={selectedNodeIds.length === 0 && selectedGroupIds.length === 0 && !selectedEdgeId} title="Delete selection">
              <Trash2 size={14} />
            </button>
          </>
        ) : null}
        <i className="canvas-tool-separator" />
        <button onClick={onClear} disabled={!canClear} title="Clear canvas">
          <Eraser size={14} />
        </button>
        {mode === "fullscreen" ? (
          <>
            <i className="canvas-tool-separator" />
            <button className={inspectorVisible ? "active" : ""} onClick={onToggleInspector} title="Toggle inspector">
              <PanelRight size={14} />
            </button>
            <button className={resultsVisible ? "active" : ""} onClick={onToggleResults} title="Toggle results">
              <Activity size={14} />
            </button>
            <button onClick={onToggleFullscreen} title="Exit advanced canvas">
              <Minimize2 size={14} />
            </button>
          </>
        ) : (
          <button onClick={onToggleFullscreen} title="Open advanced canvas">
            <Expand size={14} />
          </button>
        )}
        <span>
          <Hand size={13} />
          {Math.round(canvasView.zoom * 100)}%
        </span>
      </div>
      <div
      ref={canvasRef}
      className={`node-canvas ${mode === "fullscreen" ? `tool-${tool}` : ""} ${dragPreview ? "dragging-selection" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const kind = event.dataTransfer.getData("module-kind");
        const definition = getModuleDefinition(kind);
        if (!definition) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onAdd(definition, { x: (event.clientX - rect.left - canvasView.x) / canvasView.zoom - 80, y: (event.clientY - rect.top - canvasView.y) / canvasView.zoom - 36 });
      }}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (event.button !== 0 || target.closest(".graph-node, .graph-group-header, .node-port, .canvas-tools, path")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const hitGroup = groupAtPoint(
          (event.clientX - rect.left - canvasView.x) / canvasView.zoom,
          (event.clientY - rect.top - canvasView.y) / canvasView.zoom
        );
        if (!hitGroup) return;
        const isSelected = selectedGroupSet.has(hitGroup.group.id);
        const ids = event.shiftKey
          ? isSelected
            ? selectedGroupIds.filter((id) => id !== hitGroup.group.id)
            : [...selectedGroupIds, hitGroup.group.id]
          : isSelected
            ? selectedGroupIds
            : [hitGroup.group.id];
        if (event.shiftKey || !isSelected) onSelectGroup(hitGroup.group.id, event.shiftKey);
        if (!ids.includes(hitGroup.group.id)) return;
        beginPointerDrag(event, "groups", ids, getGraphGroupNodeIds(graph, ids));
      }}
      onPointerMove={(event) => {
        updatePointerDrag(event);
      }}
      onPointerUp={(event) => {
        finishPointerDrag(event);
      }}
      onPointerCancel={(event) => {
        finishPointerDrag(event);
      }}
      onMouseDown={(event) => {
        if (activeDragRef.current) return;
        const target = event.target as HTMLElement;
        if (event.button !== 0 || target.closest(".graph-node, .graph-group-header, .node-port, .canvas-tools, path")) return;
        setGroupMenu(undefined);
        const rect = event.currentTarget.getBoundingClientRect();
        const worldX = (event.clientX - rect.left - canvasView.x) / canvasView.zoom;
        const worldY = (event.clientY - rect.top - canvasView.y) / canvasView.zoom;
        if (groupAtPoint(worldX, worldY)) return;
        const shouldSelect = mode === "fullscreen" ? tool === "select" : event.shiftKey;
        if (shouldSelect) {
          const x = worldX;
          const y = worldY;
          setSelectionBox({ x, y, currentX: x, currentY: y });
          return;
        }
        setBlankStart({ x: event.clientX, y: event.clientY, moved: false });
        setPanStart({ x: event.clientX, y: event.clientY, viewX: canvasView.x, viewY: canvasView.y });
      }}
      onMouseMove={(event) => {
        if (activeDragRef.current) return;
        if (blankStart && Math.hypot(event.clientX - blankStart.x, event.clientY - blankStart.y) > 4) {
          setBlankStart({ ...blankStart, moved: true });
        }
        if (selectionBox) {
          const rect = event.currentTarget.getBoundingClientRect();
          setSelectionBox({
            ...selectionBox,
            currentX: (event.clientX - rect.left - canvasView.x) / canvasView.zoom,
            currentY: (event.clientY - rect.top - canvasView.y) / canvasView.zoom
          });
        }
        if (panStart) {
          onCanvasView({ ...canvasView, x: panStart.viewX + event.clientX - panStart.x, y: panStart.viewY + event.clientY - panStart.y });
        }
        if (connectFromId) {
          const rect = event.currentTarget.getBoundingClientRect();
          onDragConnect({
            fromId: connectFromId,
            x: (event.clientX - rect.left - canvasView.x) / canvasView.zoom,
            y: (event.clientY - rect.top - canvasView.y) / canvasView.zoom
          });
        }
      }}
      onMouseUp={(event) => {
        if (activeDragRef.current) return;
        if (selectionBox) {
          const left = Math.min(selectionBox.x, selectionBox.currentX);
          const right = Math.max(selectionBox.x, selectionBox.currentX);
          const top = Math.min(selectionBox.y, selectionBox.currentY);
          const bottom = Math.max(selectionBox.y, selectionBox.currentY);
          const boxedIds = graph.nodes
              .filter((node) => node.position.x + 176 >= left && node.position.x <= right && node.position.y + 70 >= top && node.position.y <= bottom)
              .map((node) => node.id);
          onSelectMany(event.shiftKey ? [...new Set([...selectedNodeIds, ...boxedIds])] : boxedIds, event.shiftKey);
          setSelectionBox(undefined);
        }
        if (blankStart && !blankStart.moved) onSelectMany([]);
        setBlankStart(undefined);
        setPanStart(undefined);
        onDragConnect(undefined);
      }}
      onMouseLeave={() => {
        if (activeDragRef.current) return;
        setPanStart(undefined);
        setSelectionBox(undefined);
        setBlankStart(undefined);
      }}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".graph-node, path, .canvas-tools")) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const hitGroup = groupAtPoint(
          (event.clientX - rect.left - canvasView.x) / canvasView.zoom,
          (event.clientY - rect.top - canvasView.y) / canvasView.zoom
        );
        if (!hitGroup) return;
        event.preventDefault();
        onSelectGroup(hitGroup.group.id);
        setGroupMenu({ groupId: hitGroup.group.id, x: event.clientX, y: event.clientY });
      }}
      onWheel={(event) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        const zoom = Math.min(1.6, Math.max(0.55, canvasView.zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
        onCanvasView({ ...canvasView, zoom });
      }}
    >
      <div
        className="canvas-transform"
        style={{
          width: canvasWorldWidth,
          height: canvasWorldHeight,
          transform: `translate(${canvasView.x}px, ${canvasView.y}px) scale(${canvasView.zoom})`
        }}
      >
      {groupBounds.map(({ group, memberCount, x, y, width, height }) => (
        <div
          key={group.id}
          className={`graph-group ${selectedGroupSet.has(group.id) ? "selected" : ""}`}
          style={{
            left: x,
            top: y,
            width,
            height,
            "--group-hue": groupHue(group.id)
          } as CSSProperties}
          onClick={(event) => {
            event.stopPropagation();
            if (suppressClickRef.current) return;
            onSelectGroup(group.id, event.shiftKey);
          }}
        >
          <div
            className="graph-group-header"
            onClick={(event) => {
              event.stopPropagation();
              if (suppressClickRef.current) return;
              onSelectGroup(group.id, event.shiftKey);
            }}
            onPointerDown={(event) => {
              const isSelected = selectedGroupSet.has(group.id);
              const ids = event.shiftKey
                ? isSelected
                  ? selectedGroupIds.filter((id) => id !== group.id)
                  : [...selectedGroupIds, group.id]
                : isSelected
                  ? selectedGroupIds
                  : [group.id];
              if (event.shiftKey || !isSelected) onSelectGroup(group.id, event.shiftKey);
              if (!ids.includes(group.id)) return;
              beginPointerDrag(event, "groups", ids, getGraphGroupNodeIds(graph, ids));
            }}
          >
            <Layers3 size={13} />
            <span>{group.name}</span>
            <small>{memberCount}</small>
          </div>
        </div>
      ))}
      <svg className="edge-layer">
        {graph.edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const fromPosition = nodePosition(from);
          const toPosition = nodePosition(to);
          const startX = fromPosition.x + 176;
          const startY = fromPosition.y + 48;
          const endX = toPosition.x;
          const endY = toPosition.y + 48;
          const mid = (endX - startX) / 2;
          return (
            <path
              key={edge.id}
              className={selectedEdgeId === edge.id ? "selected-edge" : ""}
              d={`M ${startX} ${startY} C ${startX + mid} ${startY}, ${endX - mid} ${endY}, ${endX} ${endY}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectEdge(edge.id);
              }}
            />
          );
        })}
        {dragConnection ? (
          <path
            className="draft-edge"
            d={`M ${nodeMap.get(dragConnection.fromId) ? nodePosition(nodeMap.get(dragConnection.fromId) as SignalNode).x + 176 : 176} ${nodeMap.get(dragConnection.fromId) ? nodePosition(nodeMap.get(dragConnection.fromId) as SignalNode).y + 48 : 48} C ${dragConnection.x - 80} ${nodeMap.get(dragConnection.fromId) ? nodePosition(nodeMap.get(dragConnection.fromId) as SignalNode).y + 48 : 48}, ${dragConnection.x - 60} ${dragConnection.y}, ${dragConnection.x} ${dragConnection.y}`}
          />
        ) : null}
      </svg>
      {graph.nodes.map((node) => {
        const moduleType = getModuleDefinition(node.kind)?.type ?? node.type;
        const position = nodePosition(node);
        return (
        <div
          key={node.id}
          className={`graph-node ${node.type} ${moduleType} ${selectedSet.has(node.id) ? "selected" : ""} ${errors.has(node.id) ? "error" : ""} ${disabledSet.has(node.id) ? "disabled" : ""} ${localOpenMenuId === node.id ? "menu-open" : ""}`}
          style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          onClick={(event) => {
            if (!suppressClickRef.current) onSelect(node.id, event.shiftKey);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect(node.id);
            setGroupMenu(undefined);
            setLocalOpenMenuId(node.id);
          }}
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button, input, select, textarea, .node-menu")) return;
            const isSelected = selectedSet.has(node.id);
            const ids = event.shiftKey
              ? isSelected
                ? selectedNodeIds.filter((id) => id !== node.id)
                : [...selectedNodeIds, node.id]
              : isSelected
                ? selectedNodeIds
                : [node.id];
            if (event.shiftKey || !isSelected || selectedNodeIds.length === 1) onSelect(node.id, event.shiftKey);
            if (!ids.includes(node.id)) return;
            beginPointerDrag(event, "nodes", ids, ids, node.id);
          }}
        >
          <button
            className="node-port input"
            onMouseUp={(event) => {
              event.stopPropagation();
              onFinishConnect(node.id);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onFinishConnect(node.id);
            }}
            title="Connect input"
          />
          <button
            className={`node-port output ${connectFromId === node.id ? "connecting" : ""}`}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onStartConnect(node.id);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onStartConnect(node.id);
            }}
            title="Connect output"
          />
          <span className="node-icon">
            <ModuleIcon kind={node.kind} />
          </span>
          <strong>{node.name}</strong>
          <small>{node.kind}</small>
          <svg className="node-sparkline" viewBox="0 0 100 20" preserveAspectRatio="none">
            <path d={signalPath(signals.get(node.id))} />
          </svg>
          <span className="node-summary">{errors.get(node.id) ?? (signals.get(node.id) ? `${signals.get(node.id)?.values.length.toLocaleString()} samples · ${signals.get(node.id)?.sampleRate.toLocaleString()} Hz` : "No output")}</span>
          <button
            className="node-menu-trigger"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(node.id);
              setLocalOpenMenuId(localOpenMenuId === node.id ? undefined : node.id);
            }}
            title="Node actions"
          >
            <MoreVertical size={14} />
          </button>
          {localOpenMenuId === node.id ? (
            <div className="node-menu" onClick={(event) => event.stopPropagation()}>
              <button
                onClick={() => {
                  onSetDisplayNode(node.id);
                  setLocalOpenMenuId(undefined);
                }}
              >
                <Eye size={13} />
                {graph.displayNodeId === node.id ? "Clear display target" : "Set display target"}
              </button>
              <button
                onClick={() => {
                  const nextName = window.prompt("Rename node", node.name);
                  if (nextName?.trim()) onRenameNode(node.id, nextName.trim());
                  setLocalOpenMenuId(undefined);
                }}
              >
                <PanelRight size={13} />
                Rename
              </button>
              <button
                onClick={() => {
                  onToggleDisabled(node.id);
                  setLocalOpenMenuId(undefined);
                }}
              >
                <Minus size={13} />
                {disabledSet.has(node.id) ? "Enable" : "Disable"}
              </button>
              <button
                onClick={() => {
                  onDuplicateNode(node.id);
                  setLocalOpenMenuId(undefined);
                }}
              >
                <Copy size={13} />
                Duplicate
              </button>
              <button
                onClick={() => {
                  onDeleteNode(node.id);
                  setLocalOpenMenuId(undefined);
                }}
              >
                <Trash2 size={13} />
                Delete
              </button>
              <button
                onClick={() => {
                  onStartConnect(node.id);
                  setLocalOpenMenuId(undefined);
                }}
              >
                <Cable size={13} />
                Start connection
              </button>
            </div>
          ) : null}
          {graph.displayNodeId === node.id ? <span className="display-badge">DISPLAY</span> : null}
          {disabledSet.has(node.id) ? <span className="disabled-badge">DISABLED</span> : null}
        </div>
        );
      })}
      {selectionBox ? (
        <div
          className="selection-box"
          style={{
            left: Math.min(selectionBox.x, selectionBox.currentX),
            top: Math.min(selectionBox.y, selectionBox.currentY),
            width: Math.abs(selectionBox.currentX - selectionBox.x),
            height: Math.abs(selectionBox.currentY - selectionBox.y)
          }}
        />
      ) : null}
      </div>
      </div>
      {connectFromId || connectionError ? <div className={`canvas-hint ${connectionError ? "error" : ""}`}>{connectionError ?? "Drag to an input port or click another node input to connect. Esc cancels."}</div> : null}
      {mode === "fullscreen" && !connectFromId && !connectionError ? (
        <div className="canvas-shortcut-strip">
          Drag to select · Ctrl+A all · Ctrl+G group · Ctrl+Shift+G ungroup · Ctrl+D duplicate · Delete · Esc
        </div>
      ) : null}
      {groupMenu ? (
        <div className="group-context-menu" style={{ left: groupMenu.x, top: groupMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => { onOpenGroupResults(groupMenu.groupId); setGroupMenu(undefined); }}>
            <Activity size={13} />
            Open Group Results
          </button>
          <button onClick={() => {
            const group = graph.groups?.find((item) => item.id === groupMenu.groupId);
            const name = window.prompt("Rename group", group?.name ?? "Group");
            if (name?.trim()) onRenameGroup(groupMenu.groupId, name.trim());
            setGroupMenu(undefined);
          }}>
            <PanelRight size={13} />
            Rename
          </button>
          <button onClick={() => { onDuplicateGroup(groupMenu.groupId); setGroupMenu(undefined); }}>
            <Copy size={13} />
            Duplicate
          </button>
          <button onClick={() => { onUngroupGroup(groupMenu.groupId); setGroupMenu(undefined); }}>
            <Ungroup size={13} />
            Ungroup
          </button>
          <button className="danger" onClick={() => { onDeleteGroup(groupMenu.groupId); setGroupMenu(undefined); }}>
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
};

const Timeline = ({
  timeView,
  selection,
  duration,
  currentTime,
  sampleRate,
  onCurrentTime,
  onTimeView,
  onSelection,
  displayName
}: {
  timeView: TimeView;
  selection: TimeView;
  duration: number;
  currentTime: number;
  sampleRate: number;
  onCurrentTime: (time: number) => void;
  onTimeView: (view: TimeView) => void;
  onSelection: (view: TimeView) => void;
  displayName?: string;
}) => {
  const ticks = createTimeTicks(timeView, 7);
  const [dragStart, setDragStart] = useState<{ type: "pan" | "in" | "out" | "selection"; x: number; start: number; end: number }>();
  const [suppressClick, setSuppressClick] = useState(false);
  const visibleSpan = Math.max(timeView.end - timeView.start, 0.001);
  const secondsPerPixel = (element: HTMLElement) => visibleSpan / Math.max(element.clientWidth, 1);
  const minSpan = Math.max(0.001, 1 / 1000);
  const safeCurrentTime = Math.min(duration, Math.max(0, currentTime));
  const playheadLeft = ((safeCurrentTime - timeView.start) / visibleSpan) * 100;
  const selectionLeft = ((selection.start - timeView.start) / visibleSpan) * 100;
  const selectionWidth = ((selection.end - selection.start) / visibleSpan) * 100;
  const formatTime = (time: number) => {
    const whole = Math.floor(time);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const seconds = whole % 60;
    const millis = Math.floor((time - whole) * 1000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  };

  return (
  <div
    className="timeline-panel global-timeline"
    onWheel={(event) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const focalRatio = (event.clientX - rect.left) / Math.max(rect.width, 1);
      onTimeView(zoomView(timeView, event.deltaY > 0 ? 1.2 : 0.82, focalRatio, duration));
    }}
    onMouseMove={(event) => {
      if (!dragStart) return;
      if (Math.abs(dragStart.x - event.clientX) > 2) setSuppressClick(true);
      const delta = (event.clientX - dragStart.x) * secondsPerPixel(event.currentTarget);
      if (dragStart.type === "pan") {
        onTimeView(clampView({ start: dragStart.start - delta, end: dragStart.end - delta }, duration));
      } else if (dragStart.type === "in") {
        const nextStart = Math.min(snapTimeToSample(Math.max(0, dragStart.start + delta), sampleRate, duration), dragStart.end - minSpan);
        onSelection(clampSelection({ start: nextStart, end: dragStart.end }, timeView, duration));
      } else if (dragStart.type === "out") {
        const nextEnd = Math.max(dragStart.start + minSpan, snapTimeToSample(Math.min(duration, dragStart.end + delta), sampleRate, duration));
        onSelection(clampSelection({ start: dragStart.start, end: nextEnd }, timeView, duration));
      } else {
        onSelection(clampSelection(panSelection({ start: dragStart.start, end: dragStart.end }, delta, duration), timeView, duration));
      }
    }}
    onMouseUp={() => setDragStart(undefined)}
    onMouseLeave={() => setDragStart(undefined)}
  >
    <div className="timeline-toolbar">
      <div className="section-heading">
        <Activity size={15} />
        <span>Master Timeline</span>
        <code>{displayName ?? "No display target"}</code>
      </div>
      <div className="timeline-readout">
        <span>Selection {formatTime(selection.start)} - {formatTime(selection.end)}</span>
        <strong>Now {formatTime(safeCurrentTime)}</strong>
      </div>
      <div className="timeline-controls">
        <button title="Move playhead to selection start" onClick={() => onCurrentTime(snapTimeToSample(selection.start, sampleRate, duration))}><SkipBack size={13} /> To Start</button>
        <button title="Move playhead to selection end" onClick={() => onCurrentTime(snapTimeToSample(selection.end, sampleRate, duration))}><SkipForward size={13} /> To End</button>
        <button title="Fit selection" onClick={() => onTimeView(clampView({ start: selection.start - (selection.end - selection.start) * 0.1, end: selection.end + (selection.end - selection.start) * 0.1 }, duration))}><Focus size={13} /> Fit Sel</button>
        <button title="Fit full timeline" onClick={() => onTimeView({ start: 0, end: duration })}><Maximize2 size={13} /> Full</button>
      </div>
    </div>
    <div
      className="timeline-stage"
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest(".playhead, .timeline-handle, .timeline-window")) return;
        setDragStart({ type: "pan", x: event.clientX, start: timeView.start, end: timeView.end });
      }}
      onClick={(event) => {
        if (suppressClick) {
          setSuppressClick(false);
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / Math.max(rect.width, 1);
        onCurrentTime(snapTimeToSample(timeView.start + visibleSpan * ratio, sampleRate, duration));
      }}
    >
      {ticks.map((tick) => (
        <span className="timeline-tick" key={tick.label} style={{ left: `${tick.ratio * 100}%` }}>
          {formatTime(tick.time)}
        </span>
      ))}
      <div
        className="timeline-window"
        style={{ left: `${Math.min(100, Math.max(0, selectionLeft))}%`, width: `${Math.min(100, Math.max(0, selectionWidth))}%` }}
        title="Drag selected range"
        onMouseDown={(event) => {
          event.stopPropagation();
          setDragStart({ type: "selection", x: event.clientX, start: selection.start, end: selection.end });
        }}
      >
        <i
          className="timeline-handle left"
          title="Drag IN point"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => {
            event.stopPropagation();
            setDragStart({ type: "in", x: event.clientX, start: selection.start, end: selection.end });
          }}
        >
          IN
        </i>
        <i
          className="timeline-handle right"
          title="Drag OUT point"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => {
            event.stopPropagation();
            setDragStart({ type: "out", x: event.clientX, start: selection.start, end: selection.end });
          }}
        >
          OUT
        </i>
      </div>
      <button
        className="playhead"
        data-time={formatTime(safeCurrentTime)}
        style={{ left: `${Math.min(100, Math.max(0, playheadLeft))}%` }}
        onMouseDown={(event) => {
          event.stopPropagation();
          const ruler = event.currentTarget.parentElement as HTMLElement;
          const move = (moveEvent: MouseEvent) => {
            const rect = ruler.getBoundingClientRect();
            const ratio = (moveEvent.clientX - rect.left) / Math.max(rect.width, 1);
            onCurrentTime(snapTimeToSample(timeView.start + visibleSpan * ratio, sampleRate, duration));
          };
          const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        }}
      >
        {formatTime(safeCurrentTime)}
      </button>
    </div>
  </div>
  );
};

const Inspector = ({
  node,
  graph,
  signals,
  signal,
  analysis,
  error,
  inputNames,
  sampleRate,
  totalDuration,
  onChangeNode,
  onExportNodeSignal,
  onExportNodeAnalysis
}: {
  node?: SignalNode;
  graph: SignalGraph;
  signals: Map<string, Signal>;
  signal?: Signal;
  analysis?: AnalysisResult;
  error?: string;
  inputNames: string[];
  sampleRate: number;
  totalDuration: number;
  onChangeNode: (node: SignalNode) => void;
  onExportNodeSignal: (format: "csv" | "npy") => void;
  onExportNodeAnalysis: (format: "csv" | "matrix-csv" | "json") => void;
}) => {
  const definition = node ? getModuleDefinition(node.kind) : undefined;
  const sourceStart = node?.type === "source" ? clampNumber(node.timelineOffset, 0, totalDuration, 0) : 0;
  const minSourceDuration = Math.max(1 / sampleRate, 0.000001);
  const maxSourceDuration = Math.max(minSourceDuration, totalDuration - sourceStart);
  const outputLabel = signal ? "Signal" : analysis ? (analysis.type === "scalar" ? "Scalar analysis" : analysis.type === "spectrum" ? "Spectrum analysis" : "Time-frequency analysis") : "Unavailable";
  const provenance = analysis?.provenance ?? signal?.provenance;
  const customInputRows = node?.kind === "customExpression" ? createCustomExpressionInputRows(graph, node.id, signals) : [];
  const firstInputSignal =
    node && node.type === "operation"
      ? signals.get(graph.edges.find((edge) => edge.to === node.id)?.from ?? "")
      : undefined;
  const effectiveSampleRate = firstInputSignal?.sampleRate ?? sampleRate;

  return (
    <aside className="inspector">
      <div className="panel-title">
        <PanelRight size={17} />
        <span>Parameters</span>
      </div>
      {!node ? (
        <div className="empty-state">Select a node to edit parameters.</div>
      ) : (
        <>
          <label className="field">
            <span>Name</span>
            <input value={node.name} onChange={(event) => onChangeNode({ ...node, name: event.target.value })} />
          </label>
          {node.type === "source" && (
            <div className="field-grid">
              <label className="field">
                <span>Start Time <em>s</em></span>
                <input
                  type="number"
                  value={sourceStart}
                  min={0}
                  max={totalDuration}
                  step={1 / sampleRate}
                  onChange={(event) => onChangeNode({ ...node, timelineOffset: clampNumber(Number(event.target.value), 0, totalDuration, sourceStart) })}
                />
              </label>
              <label className="field">
                <span>Duration <em>s</em></span>
                <input
                  type="number"
                  value={Number((node.length / sampleRate).toFixed(4))}
                  min={minSourceDuration}
                  max={maxSourceDuration}
                  step={1 / sampleRate}
                  onChange={(event) => {
                    const nextDuration = clampNumber(Number(event.target.value), minSourceDuration, maxSourceDuration, node.length / sampleRate);
                    onChangeNode({ ...node, sampleRate, length: Math.max(1, Math.round(nextDuration * sampleRate)) });
                  }}
                />
              </label>
            </div>
          )}
          {definition?.params.map((param) => {
            const storedG2OutputMode = String(node.params.outputMode ?? "averageAtLag");
            const g2OutputMode = storedG2OutputMode === "curveOverTime" ? "curveOverLag" : storedG2OutputMode;
            if (node.kind === "photonCounts" && param.key === "coherenceTime" && String(node.params.lightStatistics ?? "coherent") !== "thermal") return null;
            if (node.kind === "secondOrderCorrelation") {
              if (g2OutputMode === "curveOverLag" && param.key === "lagSamples") return null;
              if (g2OutputMode !== "curveOverLag" && param.key === "maxLagSamples") return null;
            }
            const storedValue = node.params[param.key] ?? param.defaultValue;
            const value =
              node.kind === "secondOrderCorrelation" && param.key === "outputMode" && storedValue === "curveOverTime"
                ? "curveOverLag"
                : storedValue;
            const lagSeconds =
              node.kind === "secondOrderCorrelation" && (param.key === "lagSamples" || param.key === "maxLagSamples")
                ? Math.max(0, Math.floor(typeof value === "number" ? value : Number(value) || 0)) / Math.max(effectiveSampleRate, 1e-12)
                : undefined;
            return (
              <label className="field" key={param.key}>
                <span>
                  {param.label}
                  {param.unit ? <em>{param.unit}</em> : null}
                </span>
                {param.type === "array" ? (
                  <textarea
                    value={Array.isArray(value) ? value.join(", ") : String(value)}
                    onChange={(event) => onChangeNode({ ...node, params: { ...node.params, [param.key]: parseArray(event.target.value) } })}
                  />
                ) : param.type === "text" ? (
                  <textarea
                    value={String(value ?? "")}
                    onChange={(event) => onChangeNode({ ...node, params: { ...node.params, [param.key]: event.target.value } })}
                  />
                ) : param.type === "select" ? (
                  <select value={String(value ?? param.defaultValue)} onChange={(event) => onChangeNode({ ...node, params: { ...node.params, [param.key]: event.target.value } })}>
                    {(param.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={typeof value === "number" ? value : Number(value) || 0}
                    onChange={(event) => onChangeNode({ ...node, params: { ...node.params, [param.key]: Number(event.target.value) } })}
                  />
                )}
                {lagSeconds !== undefined ? (
                  <small className="field-note">
                    {formatValue(lagSeconds)} s @ {formatValue(effectiveSampleRate)} Hz
                  </small>
                ) : null}
              </label>
            );
          })}
          {node.kind === "customExpression" ? (
            <div className="input-variable-box">
              <div className="input-variable-title">
                <Braces size={14} />
                <span>Input Variables</span>
              </div>
              {customInputRows.length === 0 ? (
                <p>Connect signals to use x0, x1...</p>
              ) : (
                <div className="input-variable-list">
                  {customInputRows.map((row) => (
                    <div key={row.variable} className={row.available ? "" : "unavailable"}>
                      <code>{row.variable}</code>
                      <span>{row.nodeName}</span>
                      <em>{row.detail}</em>
                    </div>
                  ))}
                </div>
              )}
              <small>Use x0, x1..., t, n, sampleRate, p0, p1, p2 and math functions.</small>
            </div>
          ) : null}
          {error ? <div className="error-box">{error}</div> : null}
          <div className="signal-stats">
            <strong>{signal ? signal.values.length.toLocaleString() : 0}</strong>
            <span>samples</span>
            <strong>{signal ? signal.sampleRate.toLocaleString() : "-"}</strong>
            <span>Hz</span>
          </div>
          <CollapsiblePanel title="Run Summary" icon={<Activity size={14} />}>
            <dl>
              <dt>Module</dt>
              <dd>{definition ? `${definition.label} / ${definition.type}` : node.kind}</dd>
              <dt>Output</dt>
              <dd>{outputLabel}</dd>
              <dt>Inputs</dt>
              <dd>{inputNames.length > 0 ? inputNames.join(", ") : "None"}</dd>
              <dt>Params</dt>
              <dd title={summarizeParams(node.params)}>{summarizeParams(node.params)}</dd>
              <dt>Status</dt>
              <dd>{error ? "Error" : "Ready"}</dd>
            </dl>
          </CollapsiblePanel>
          {analysis ? (
            <CollapsiblePanel title="Analysis Results" icon={<Activity size={14} />} className={`inspector-analysis ${summarizeAnalysisResult(analysis).kind}`}>
              <InspectorAnalysisResult analysis={analysis} />
            </CollapsiblePanel>
          ) : null}
          <CollapsiblePanel title="Provenance" icon={<GitBranch size={14} />} defaultOpen={false}>
            <ProvenanceBox provenance={provenance} />
          </CollapsiblePanel>
        </>
      )}
      <CollapsiblePanel title="Selected Node Output" icon={<ArrowDownToLine size={14} />} className="export-stack">
        {analysis ? (
          <>
            {analysis.type === "time-frequency" ? (
              <>
                <button onClick={() => onExportNodeAnalysis("matrix-csv")} title={`Export ${analysis.name} as a frequency-by-time matrix CSV`}>
                  <ArrowDownToLine size={15} />
                  Matrix CSV
                </button>
                <button onClick={() => onExportNodeAnalysis("csv")} title={`Export ${analysis.name} as long-form frequency/time/power CSV`}>
                  <ArrowDownToLine size={15} />
                  Long CSV
                </button>
              </>
            ) : (
              <button onClick={() => onExportNodeAnalysis("csv")} title={`Export ${analysis.name} analysis as CSV`}>
                <ArrowDownToLine size={15} />
                Analysis CSV
              </button>
            )}
            <button onClick={() => onExportNodeAnalysis("json")} title={`Export ${analysis.name} analysis as JSON`}>
              <FileJson size={15} />
              Analysis JSON
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onExportNodeSignal("csv")} disabled={!signal} title={signal ? `Export ${signal.name} as CSV` : "Selected node has no signal output"}>
              <ArrowDownToLine size={15} />
              Node CSV
            </button>
            <button onClick={() => onExportNodeSignal("npy")} disabled={!signal} title={signal ? `Export ${signal.name} as NPY` : "Selected node has no signal output"}>
              <Braces size={15} />
              Node NPY
            </button>
          </>
        )}
      </CollapsiblePanel>
    </aside>
  );
};

const BackendStatusChip = ({ status, runningCount }: { status: AnalysisBackendStatus; runningCount: number }) => {
  const isRunning = runningCount > 0;
  const label = isRunning ? `Running ${runningCount}` : status.status === "online" ? "Backend Online" : "Backend Offline";
  return (
    <div className={`backend-status ${isRunning ? "running" : status.status}`} title={status.message}>
      {isRunning ? <span className="spinner tiny" /> : <Database size={14} />}
      <span>{label}</span>
    </div>
  );
};

export const App = () => {
  const [graph, setGraph] = useState<SignalGraph>(sampleGraph);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const csvInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(sampleGraph.selectedNodeId ? [sampleGraph.selectedNodeId] : []);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [connectFromId, setConnectFromId] = useState<string>();
  const [dragConnection, setDragConnection] = useState<{ fromId: string; x: number; y: number }>();
  const [connectionError, setConnectionError] = useState<string>();
  const [canvasView, setCanvasView] = useState({ x: 0, y: 0, zoom: 1 });
  const [canvasFitVersion, setCanvasFitVersion] = useState(0);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [canvasMode, setCanvasMode] = useState<"embedded" | "fullscreen">("embedded");
  const [canvasTool, setCanvasTool] = useState<"select" | "hand">("select");
  const [canvasInspectorVisible, setCanvasInspectorVisible] = useState(false);
  const [canvasResultsVisible, setCanvasResultsVisible] = useState(false);
  const [canvasResultsMaximized, setCanvasResultsMaximized] = useState(false);
  const [groupResultsId, setGroupResultsId] = useState<string>();
  const [floatingInspectorPosition, setFloatingInspectorPosition] = useState<FloatingPanelPosition>({ x: 880, y: 72 });
  const [floatingResultsPosition, setFloatingResultsPosition] = useState<FloatingPanelPosition>({ x: 40, y: 72 });
  const [floatingGroupResultsPosition, setFloatingGroupResultsPosition] = useState<FloatingPanelPosition>({ x: 70, y: 58 });
  const [groupResultsMaximized, setGroupResultsMaximized] = useState(false);
  const [activeFloatingPanel, setActiveFloatingPanel] = useState<"inspector" | "results">("inspector");
  const [chartMode, setChartMode] = useState<"time" | "spectrum">("time");
  const [spectrumMode, setSpectrumMode] = useState<"linear" | "db">("linear");
  const [frequencyScale, setFrequencyScale] = useState<"linear" | "log">("linear");
  const [plotPreviewPoints, setPlotPreviewPoints] = useState(520);
  const [timeView, setTimeView] = useState<TimeView>({ start: 0, end: 1 });
  const [timeSelection, setTimeSelection] = useState<TimeView>({ start: 0, end: 1 });
  const [currentTime, setCurrentTime] = useState(0);
  const [plotViews, setPlotViews] = useState<Record<string, { x?: ValueRange; y?: ValueRange }>>({});
  const [plotCursorXs, setPlotCursorXs] = useState<Record<string, number>>({});
  const [undoStack, setUndoStack] = useState<SignalGraph[]>([]);
  const [redoStack, setRedoStack] = useState<SignalGraph[]>([]);
  const [csvImportMessage, setCsvImportMessage] = useState<string>();
  const [analysisBackendStatus, setAnalysisBackendStatus] = useState<AnalysisBackendStatus>({
    status: "offline",
    message: "Checking local analysis backend..."
  });
  const [timeFrequencyResults, setTimeFrequencyResults] = useState<Record<string, AnalysisResult>>({});
  const [timeFrequencyRunningIds, setTimeFrequencyRunningIds] = useState<string[]>([]);
  const [externalCommandSignals, setExternalCommandSignals] = useState<Record<string, Signal>>({});
  const [externalCommandErrors, setExternalCommandErrors] = useState<Record<string, string>>({});
  const [externalCommandRunningIds, setExternalCommandRunningIds] = useState<string[]>([]);
  const selectedNodeId = selectedNodeIds[selectedNodeIds.length - 1] ?? graph.selectedNodeId;
  const evaluation = useMemo(() => evaluateGraph({ ...graph, selectedNodeId }), [graph, selectedNodeId]);
  const signalOverlay = useMemo(() => {
    const signals = new Map(evaluation.signals);
    Object.entries(externalCommandSignals).forEach(([id, signal]) => signals.set(id, signal));
    return signals;
  }, [evaluation.signals, externalCommandSignals]);
  const errorOverlay = useMemo(() => {
    const errors = new Map(evaluation.errors);
    Object.keys(externalCommandSignals).forEach((id) => errors.delete(id));
    externalCommandRunningIds.forEach((id) => errors.set(id, "External command running..."));
    Object.entries(externalCommandErrors).forEach(([id, error]) => errors.set(id, error));
    return errors;
  }, [evaluation.errors, externalCommandErrors, externalCommandRunningIds, externalCommandSignals]);
  const analysisOverlay = useMemo(() => {
    const analyses = new Map(evaluation.analysis);
    Object.entries(timeFrequencyResults).forEach(([id, analysis]) => analyses.set(id, analysis));
    return analyses;
  }, [evaluation.analysis, timeFrequencyResults]);
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selectedSignal = selectedNodeId ? signalOverlay.get(selectedNodeId) : undefined;
  const selectedAnalysis = selectedNodeId ? timeFrequencyResults[selectedNodeId] ?? evaluation.analysis.get(selectedNodeId) : undefined;
  const displayNodeId = graph.displayNodeId ?? selectedNodeId;
  const displayNode = graph.nodes.find((node) => node.id === displayNodeId);
  const displaySignal = displayNodeId ? signalOverlay.get(displayNodeId) : undefined;
  const displayAnalysis = displayNodeId ? timeFrequencyResults[displayNodeId] ?? evaluation.analysis.get(displayNodeId) : undefined;
  const compareSignals = selectedNodeIds
    .filter((id) => id !== displayNodeId)
    .map((id) => signalOverlay.get(id))
    .filter((signal): signal is Signal => Boolean(signal));
  const displaySignalPlot = useMemo(
    () => (displaySignal ? createSignalPlotModel(displaySignal) : undefined),
    [displaySignal]
  );
  const compatibleComparePlots = useMemo(() => {
    if (!displaySignalPlot || displaySignalPlot.kind !== "line") return [];
    return compareSignals
      .map(createSignalPlotModel)
      .filter(
        (plot): plot is Extract<ScientificPlotModel, { kind: "line" }> =>
          plot.kind === "line" &&
          plot.xAxis.kind === displaySignalPlot.xAxis.kind &&
          plot.xAxis.linkToMaster === displaySignalPlot.xAxis.linkToMaster
      );
  }, [compareSignals, displaySignalPlot]);
  const spectrumPlot = useMemo<Extract<ScientificPlotModel, { kind: "spectrum" }> | undefined>(() => {
    if (displayAnalysis?.type === "spectrum") {
      const plot = createAnalysisPlotModel(displayAnalysis);
      return plot.kind === "spectrum" ? plot : undefined;
    }
    if (!displaySignal || displaySignal.domain?.linkToMaster === false) return undefined;
    const spectrum = fftSpectrum(displaySignal);
    return {
      kind: "spectrum",
      id: displaySignal.id,
      title: `${displaySignal.name} Spectrum`,
      frequency: spectrum.frequency,
      magnitude: spectrum.magnitude,
      xAxis: { kind: "frequency", label: "Frequency", unit: "Hz", linkToMaster: false },
      yLabel: "Amplitude",
      yUnit: displaySignal.unit
    };
  }, [displayAnalysis, displaySignal]);
  const analysisOnly = Boolean(displayAnalysis && displayAnalysis.type !== "spectrum");
  const activeChart = analysisOnly ? "analysis" : displayAnalysis?.type === "spectrum" ? "spectrum" : chartMode === "spectrum" && spectrumPlot ? "spectrum" : "series";
  const plotKey = `${displayNodeId ?? "none"}:${activeChart}:${activeChart === "spectrum" ? `${spectrumMode}:${frequencyScale}` : "default"}`;
  const activePlotView = plotViews[plotKey] ?? {};
  const activeCursorX = displaySignalPlot?.kind === "line" && displaySignalPlot.xAxis.linkToMaster
    ? currentTime
    : plotCursorXs[plotKey] ?? (displaySignalPlot?.kind === "line" ? displaySignalPlot.x[0] : undefined);
  const cursorReadout = readSignalAtTime(displaySignal, activeCursorX ?? currentTime);
  const sampleRate = graphSampleRate(graph);
  const samples = graphSamples(graph);
  const duration = Math.max(
    graphDuration(graph),
    ...[...signalOverlay.values()]
      .filter((signal) => signal.domain?.linkToMaster !== false)
      .map((signal) => signal.time[signal.time.length - 1] ?? 0)
  );
  const visibleTimeView = clampView(timeView.end > duration ? { start: 0, end: duration } : timeView, duration);
  const visibleSelection = clampSelection(timeSelection.end > duration ? { start: 0, end: duration } : timeSelection, visibleTimeView, duration);
  const setActivePlotView = (axis: "x" | "y", range?: ValueRange) => {
    setPlotViews((current) => ({
      ...current,
      [plotKey]: { ...current[plotKey], [axis]: range }
    }));
  };

  const commitGraph = (updater: (current: SignalGraph) => SignalGraph) => {
    setGraph((current) => {
      const next = updater(current);
      if (next === current) return current;
      setUndoStack((stack) => [...stack, current].slice(-80));
      setRedoStack([]);
      return next;
    });
  };

  const setSelection = (
    ids: string[],
    options: { preserveGroups?: boolean; openInspector?: boolean } = {}
  ) => {
    const existing = ids.filter((id) => graph.nodes.some((node) => node.id === id));
    setSelectedNodeIds(existing);
    if (!options.preserveGroups) setSelectedGroupIds([]);
    setSelectedEdgeId(undefined);
    setGraph((current) => ({ ...current, selectedNodeId: existing[existing.length - 1] }));
    const hasGroups = options.preserveGroups ? selectedGroupIds.length > 0 : false;
    setCanvasInspectorVisible(canvasMode === "fullscreen" && Boolean(options.openInspector) && existing.length === 1 && !hasGroups);
  };

  const selectGroup = (id: string, append = false) => {
    const existing = graph.groups?.some((group) => group.id === id);
    if (!existing) return;
    setSelectedGroupIds((ids) => (append ? (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]) : [id]));
    if (!append) setSelectedNodeIds([]);
    setSelectedEdgeId(undefined);
    setGraph((current) => ({ ...current, selectedNodeId: append ? selectedNodeIds[selectedNodeIds.length - 1] : undefined }));
    setCanvasInspectorVisible(false);
  };

  const updateNode = (updatedNode: SignalNode) => {
    commitGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === updatedNode.id ? updatedNode : node))
    }));
  };

  useEffect(() => {
    setCurrentTime((time) => Math.min(duration, Math.max(0, time)));
    setTimeView((view) => clampView(view, duration));
    setTimeSelection((selection) => clampSelection(selection, { start: 0, end: duration }, duration));
  }, [duration]);

  useEffect(() => {
    document.body.classList.toggle("canvas-fullscreen-open", canvasMode === "fullscreen");
    return () => document.body.classList.remove("canvas-fullscreen-open");
  }, [canvasMode]);

  useEffect(() => {
    setTimeFrequencyResults({});
    setTimeFrequencyRunningIds([]);
    setExternalCommandSignals({});
    setExternalCommandErrors({});
    setExternalCommandRunningIds([]);
  }, [graph.nodes, graph.edges, graph.sampleRate, graph.samples]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void checkAnalysisBackendStatus().then((status) => {
        if (active) setAnalysisBackendStatus(status);
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 8000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const targetIds = Array.from(new Set([selectedNodeId, displayNodeId].filter((id): id is string => Boolean(id))));
    targetIds.forEach((nodeId) => {
      const node = graph.nodes.find((item) => item.id === nodeId);
      if (!node || node.type !== "operation" || !isTimeFrequencyNode(node)) return;
      const baseAnalysis = evaluation.analysis.get(nodeId);
      if (baseAnalysis?.type !== "time-frequency-pending") return;
      if (timeFrequencyResults[nodeId] || timeFrequencyRunningIds.includes(nodeId)) return;
      const inputEdge = graph.edges.find((edge) => edge.to === nodeId);
      const inputSignal = inputEdge ? evaluation.signals.get(inputEdge.from) : undefined;
      if (!inputSignal) return;

      const request = createTimeFrequencyRequest(node, inputSignal);
      setTimeFrequencyRunningIds((ids) => (ids.includes(nodeId) ? ids : [...ids, nodeId]));
      setTimeFrequencyResults((results) => ({
        ...results,
        [nodeId]: {
          type: "time-frequency-pending",
          id: node.id,
          name: node.name,
          method: request.method,
          status: "running",
          message: "Running Python/SciPy backend...",
          params: { ...node.params },
          provenance: {
            nodeId: node.id,
            nodeName: node.name,
            nodeKind: node.kind,
            inputNodeIds: request.inputNodeIds ?? [],
            params: { ...node.params },
            sampleRate: inputSignal.sampleRate,
            sampleCount: inputSignal.values.length,
            unit: "power",
            backend: "local-python-scipy"
          }
        }
      }));
      void runTimeFrequencyBackend(request).then((result) => {
        setTimeFrequencyResults((results) => ({ ...results, [nodeId]: result }));
        setTimeFrequencyRunningIds((ids) => ids.filter((id) => id !== nodeId));
      });
    });
  }, [displayNodeId, evaluation, graph.edges, graph.nodes, selectedNodeId, timeFrequencyResults, timeFrequencyRunningIds]);

  useEffect(() => {
    const targetIds = Array.from(new Set([selectedNodeId, displayNodeId].filter((id): id is string => Boolean(id))));
    targetIds.forEach((nodeId) => {
      const node = graph.nodes.find((item) => item.id === nodeId);
      if (!node || node.type !== "operation" || node.kind !== "externalCommand") return;
      if (externalCommandSignals[nodeId] || externalCommandErrors[nodeId] || externalCommandRunningIds.includes(nodeId)) return;
      const inputSignals = graph.edges
        .filter((edge) => edge.to === nodeId)
        .map((edge) => signalOverlay.get(edge.from))
        .filter((signal): signal is Signal => Boolean(signal));
      if (inputSignals.length === 0) return;

      const request = createExternalCommandRequest(node, inputSignals);
      setExternalCommandRunningIds((ids) => (ids.includes(nodeId) ? ids : [...ids, nodeId]));
      setExternalCommandErrors((errors) => {
        const next = { ...errors };
        delete next[nodeId];
        return next;
      });
      void runExternalCommandBackend(request).then((result) => {
        if (result.type === "external-command-error") {
          setExternalCommandErrors((errors) => ({ ...errors, [nodeId]: result.message }));
        } else {
          setExternalCommandSignals((signals) => ({
            ...signals,
            [nodeId]: externalCommandResultToSignal(node, request, result)
          }));
        }
        setExternalCommandRunningIds((ids) => ids.filter((id) => id !== nodeId));
      });
    });
  }, [
    displayNodeId,
    externalCommandErrors,
    externalCommandRunningIds,
    externalCommandSignals,
    graph.edges,
    graph.nodes,
    selectedNodeId,
    signalOverlay
  ]);

  useEffect(() => {
    if (displayAnalysis?.type === "spectrum") setChartMode("spectrum");
  }, [displayAnalysis?.type, displayAnalysis?.id]);

  useEffect(() => {
    if (!connectionError) return;
    const timeout = window.setTimeout(() => setConnectionError(undefined), 2200);
    return () => window.clearTimeout(timeout);
  }, [connectionError]);

  const updateGlobalSampleRate = (nextRate: number) => {
    commitGraph((current) => {
      const previousRate = graphSampleRate(current);
      const rate = clampPositiveInteger(nextRate, previousRate);
      const previousDuration = graphDuration(current);
      return {
        ...current,
        sampleRate: rate,
        samples: clampPositiveInteger(previousDuration * rate, graphSamples(current)),
        nodes: current.nodes.map((node) => {
          if (node.type !== "source") return node;
          const nodeDuration = node.length / (node.sampleRate || previousRate);
          return { ...node, sampleRate: rate, length: clampPositiveInteger(nodeDuration * rate, node.length) };
        })
      };
    });
  };

  const updateGlobalSamples = (nextSamples: number) => {
    commitGraph((current) => ({ ...current, samples: clampPositiveInteger(nextSamples, graphSamples(current)) }));
  };

  const updateGlobalDuration = (nextDuration: number) => {
    commitGraph((current) => ({ ...current, samples: clampPositiveInteger(nextDuration * graphSampleRate(current), graphSamples(current)) }));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableEventTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoGraph();
        else undoGraph();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoGraph();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        deleteSelection();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelection();
      }
      if (canvasMode === "fullscreen" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const nestedGroupIds = new Set((graph.groups ?? []).flatMap((group) => group.childGroupIds ?? []));
        const rootGroupIds = (graph.groups ?? []).filter((group) => !nestedGroupIds.has(group.id)).map((group) => group.id);
        const groupedNodeIds = new Set(getGraphGroupNodeIds(graph, rootGroupIds));
        setSelectedGroupIds(rootGroupIds);
        setSelectedNodeIds(graph.nodes.filter((node) => !groupedNodeIds.has(node.id)).map((node) => node.id));
        setSelectedEdgeId(undefined);
        setCanvasInspectorVisible(false);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroupSelectedGroups();
        else groupSelectedNodes();
      }
      if (event.key === "Escape") {
        if (connectFromId || dragConnection || selectedEdgeId || connectionError) {
          setConnectFromId(undefined);
          setDragConnection(undefined);
          setSelectedEdgeId(undefined);
          setConnectionError(undefined);
          return;
        }
        if (selectedNodeIds.length > 0 || selectedGroupIds.length > 0) {
          setSelection([]);
          setSelectedGroupIds([]);
          return;
        }
        if (canvasMode === "fullscreen") {
          setCanvasMode("embedded");
          setCanvasInspectorVisible(false);
          setCanvasResultsVisible(false);
          return;
        }
        setConnectFromId(undefined);
        setDragConnection(undefined);
        setSelectedEdgeId(undefined);
        setConnectionError(undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const addNode = (definition: ModuleDefinition, position?: { x: number; y: number }) => {
    commitGraph((current) => {
      const node = createNodeFromDefinition(definition, current.nodes.length, graphSampleRate(current), graphSamples(current));
      const placed = { ...node, position: position ?? node.position };
      setSelectedNodeIds([placed.id]);
      return { ...current, selectedNodeId: placed.id, nodes: [...current.nodes, placed] };
    });
  };

  const deleteNodeById = (nodeId?: string) => {
    if (!nodeId) return;
    commitGraph((current) => removeGraphNode(current, nodeId));
    setSelectedNodeIds((ids) => ids.filter((id) => id !== nodeId));
    setConnectFromId(undefined);
  };

  const deleteSelectedNodes = () => {
    if (selectedNodeIds.length === 0) return;
    commitGraph((current) => removeGraphNodes(current, selectedNodeIds));
    setSelectedNodeIds([]);
    setConnectFromId(undefined);
  };

  const deleteSelectedGroups = () => {
    if (selectedGroupIds.length === 0) return;
    commitGraph((current) => removeGraphGroups(current, selectedGroupIds));
    setSelectedGroupIds([]);
    setSelectedNodeIds([]);
    setConnectFromId(undefined);
  };

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    commitGraph((current) => removeGraphEdge(current, selectedEdgeId));
    setSelectedEdgeId(undefined);
  };

  const clearCanvas = () => {
    commitGraph((current) => clearGraphCanvas(current));
    setSelectedNodeIds([]);
    setSelectedGroupIds([]);
    setSelectedEdgeId(undefined);
    setConnectFromId(undefined);
    setTimeFrequencyResults({});
    setTimeFrequencyRunningIds([]);
  };

  const duplicateNodeById = (nodeId?: string) => {
    if (!nodeId) return;
    commitGraph((current) => {
      const next = duplicateGraphNode(current, nodeId);
      setSelectedNodeIds(next.selectedNodeId ? [next.selectedNodeId] : []);
      setSelectedEdgeId(undefined);
      return next;
    });
  };

  const duplicateSelectedNodes = () => {
    if (selectedNodeIds.length <= 1) return duplicateNodeById(selectedNodeId);
    commitGraph((current) => {
      const next = duplicateGraphNodes(current, selectedNodeIds);
      const newIds = next.nodes.slice(current.nodes.length).map((node) => node.id);
      setSelectedNodeIds(newIds);
      setSelectedEdgeId(undefined);
      return next;
    });
  };

  const duplicateSelectedGroups = () => {
    if (selectedGroupIds.length === 0) return;
    commitGraph((current) => {
      const previousGroupCount = current.groups?.length ?? 0;
      const next = duplicateGraphGroups(current, selectedGroupIds);
      const addedGroups = (next.groups ?? []).slice(previousGroupCount);
      setSelectedGroupIds(
        selectedGroupIds
          .map((id) => addedGroups.find((group) => group.id.startsWith(`${id}-copy-`))?.id)
          .filter((id): id is string => Boolean(id))
      );
      setSelectedNodeIds([]);
      setSelectedEdgeId(undefined);
      return next;
    });
  };

  const duplicateGroupById = (groupId: string) => {
    commitGraph((current) => {
      const previousGroupCount = current.groups?.length ?? 0;
      const next = duplicateGraphGroups(current, [groupId]);
      const copied = (next.groups ?? []).slice(previousGroupCount).find((group) => group.id.startsWith(`${groupId}-copy-`));
      setSelectedGroupIds(copied ? [copied.id] : []);
      setSelectedNodeIds([]);
      return next;
    });
  };

  const deleteGroupById = (groupId: string) => {
    commitGraph((current) => removeGraphGroups(current, [groupId]));
    setSelectedGroupIds([]);
    if (groupResultsId === groupId) setGroupResultsId(undefined);
  };

  const ungroupGroupById = (groupId: string) => {
    commitGraph((current) => ungroupGraphGroups(current, [groupId]));
    setSelectedGroupIds([]);
    if (groupResultsId === groupId) setGroupResultsId(undefined);
  };

  const renameGroupById = (groupId: string, name: string) => {
    commitGraph((current) => ({
      ...current,
      groups: current.groups?.map((group) => (group.id === groupId ? { ...group, name } : group))
    }));
  };

  const groupSelectedNodes = () => {
    if (selectedNodeIds.length + selectedGroupIds.length < 2) return;
    commitGraph((current) => {
      const next = groupGraphNodes(current, selectedNodeIds, selectedGroupIds);
      const group = next.groups?.[next.groups.length - 1];
      setSelectedGroupIds(group ? [group.id] : []);
      setSelectedNodeIds([]);
      setCanvasInspectorVisible(false);
      return next;
    });
  };

  const ungroupSelectedGroups = () => {
    if (selectedGroupIds.length === 0) return;
    commitGraph((current) => ungroupGraphGroups(current, selectedGroupIds));
    setSelectedGroupIds([]);
  };

  const duplicateSelection = () => {
    if (selectedGroupIds.length > 0) duplicateSelectedGroups();
    else duplicateSelectedNodes();
  };

  const deleteSelection = () => {
    if (selectedEdgeId) deleteSelectedEdge();
    else if (selectedGroupIds.length > 0) deleteSelectedGroups();
    else deleteSelectedNodes();
  };

  const autoLayout = async () => {
    if (layoutRunning || graph.nodes.length === 0) return;
    const sourceGraph = graph;
    const layoutSignature = (candidate: SignalGraph) =>
      JSON.stringify({
        nodes: candidate.nodes.map((node) => [node.id, node.position.x, node.position.y]),
        edges: candidate.edges.map((edge) => [edge.id, edge.from, edge.to]),
        groups: (candidate.groups ?? []).map((group) => [group.id, group.nodeIds, group.childGroupIds ?? []])
      });
    const sourceSignature = layoutSignature(sourceGraph);
    setLayoutRunning(true);
    setConnectionError(undefined);
    try {
      const layout = await layoutSignalGraph(sourceGraph);
      if (layoutSignature(graphRef.current) !== sourceSignature) return;
      commitGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => ({
          ...node,
          position: layout.positions[node.id] ?? node.position
        }))
      }));
      setCanvasFitVersion((version) => version + 1);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Auto layout failed.");
    } finally {
      setLayoutRunning(false);
    }
  };

  const connectNodes = (from: string, to: string) => {
    const status = canConnectGraphNodes(graph, from, to);
    if (!status.ok) {
      setConnectionError(status.reason);
      return;
    }
    setConnectionError(undefined);
    commitGraph((current) => connectGraphNodes(current, from, to));
  };

  const moveNodesByDelta = (nodeIds: string[], delta: { x: number; y: number }) => {
    if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) return;
    commitGraph((current) => moveGraphNodes(current, nodeIds, delta));
  };

  const moveGroupsByDelta = (groupIds: string[], delta: { x: number; y: number }) => {
    if (groupIds.length === 0 || (delta.x === 0 && delta.y === 0)) return;
    commitGraph((current) => moveGraphGroups(current, groupIds, delta));
  };

  const toggleNodeDisabled = (nodeId: string) => {
    commitGraph((current) => {
      const disabled = new Set(current.disabledNodeIds ?? []);
      if (disabled.has(nodeId)) disabled.delete(nodeId);
      else disabled.add(nodeId);
      return { ...current, disabledNodeIds: Array.from(disabled) };
    });
  };

  const undoGraph = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack((stack) => [graph, ...stack].slice(0, 80));
    setUndoStack((stack) => stack.slice(0, -1));
    setGraph(previous);
    setSelectedNodeIds(previous.selectedNodeId ? [previous.selectedNodeId] : []);
    setSelectedGroupIds([]);
    setSelectedEdgeId(undefined);
  };

  const redoGraph = () => {
    const next = redoStack[0];
    if (!next) return;
    setUndoStack((stack) => [...stack, graph].slice(-80));
    setRedoStack((stack) => stack.slice(1));
    setGraph(next);
    setSelectedNodeIds(next.selectedNodeId ? [next.selectedNodeId] : []);
    setSelectedGroupIds([]);
    setSelectedEdgeId(undefined);
  };

  const exportSelectedNodeSignal = (format: "csv" | "npy") => {
    if (!selectedSignal) return;
    if (format === "csv") downloadText(`${selectedSignal.name}.csv`, exportCsv(selectedSignal), "text/csv");
    else downloadBlob(`${selectedSignal.name}.npy`, exportNpyFloat64(selectedSignal));
  };

  const exportSelectedNodeAnalysis = (format: "csv" | "matrix-csv" | "json") => {
    if (!selectedAnalysis) return;
    if (format === "matrix-csv") downloadText(`${selectedAnalysis.name}-matrix.csv`, exportAnalysisCsv(selectedAnalysis, "matrix"), "text/csv");
    else if (format === "csv") downloadText(`${selectedAnalysis.name}.csv`, exportAnalysisCsv(selectedAnalysis), "text/csv");
    else downloadText(`${selectedAnalysis.name}.json`, exportAnalysisJson(selectedAnalysis), "application/json");
  };

  const importCsvFile = async (file?: File) => {
    if (!file) return;
    try {
      const imported = parseCsvSignalData(await file.text(), sampleRate);
      commitGraph((current) => {
        const importedSampleRate = clampPositiveInteger(imported.sampleRate ?? graphSampleRate(current), graphSampleRate(current));
        const startTime = clampNumber(imported.startTime ?? 0, 0, Number.MAX_SAFE_INTEGER, 0);
        const requiredSamples = Math.max(graphSamples(current), Math.ceil((startTime + imported.values.length / importedSampleRate) * importedSampleRate));
        const node: SignalNode = {
          id: `import-${Date.now()}`,
          type: "source",
          kind: "import",
          name: file.name.replace(/\.[^.]+$/, "") || "Imported CSV",
          position: { x: 120, y: 120 + (current.nodes.length % 4) * 42 },
          timelineOffset: startTime,
          sampleRate: importedSampleRate,
          length: imported.values.length,
          params: { values: imported.values }
        };
        setSelectedNodeIds([node.id]);
        return {
          ...current,
          schemaVersion: 2,
          sampleRate: importedSampleRate,
          samples: requiredSamples,
          selectedNodeId: node.id,
          displayNodeId: node.id,
          nodes: [...current.nodes, node]
        };
      });
      setCsvImportMessage([imported.message, ...imported.warnings].join(" "));
    } catch (error) {
      setCsvImportMessage(error instanceof Error ? error.message : "CSV import failed.");
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  const loadProjectFile = async (file?: File) => {
    if (!file) return;
    try {
      const loaded = parseProjectJson(await file.text());
      setGraph(loaded);
      setUndoStack([]);
      setRedoStack([]);
      setSelectedNodeIds(loaded.selectedNodeId ? [loaded.selectedNodeId] : []);
      setSelectedGroupIds([]);
      setSelectedEdgeId(undefined);
      setConnectFromId(undefined);
      setCsvImportMessage(`Loaded ${file.name} with schema v${loaded.schemaVersion ?? 2}`);
    } catch (error) {
      setCsvImportMessage(error instanceof Error ? error.message : "Project load failed.");
    } finally {
      if (projectInputRef.current) projectInputRef.current.value = "";
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <FlaskConical size={18} />
          </span>
          <div>
            <strong>SignalForge</strong>
            <small>Modular 1D simulation workbench</small>
          </div>
        </div>
        <div className="global-settings">
          <label>
            <span>Sample Rate</span>
            <input type="number" min={1} step={100} value={sampleRate} onChange={(event) => updateGlobalSampleRate(Number(event.target.value))} />
            <em>Hz</em>
          </label>
          <label>
            <span>Samples</span>
            <input type="number" min={1} step={100} value={samples} onChange={(event) => updateGlobalSamples(Number(event.target.value))} />
          </label>
          <label>
            <span>Duration</span>
            <input type="number" min={1 / sampleRate} step={1 / sampleRate} value={Number(duration.toFixed(4))} onChange={(event) => updateGlobalDuration(Number(event.target.value))} />
            <em>s</em>
          </label>
        </div>
        <div className="toolbar">
          <input
            ref={csvInputRef}
            className="hidden-file-input"
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            onChange={(event) => void importCsvFile(event.target.files?.[0])}
          />
          <input
            ref={projectInputRef}
            className="hidden-file-input"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void loadProjectFile(event.target.files?.[0])}
          />
          <button onClick={() => projectInputRef.current?.click()}>
            <FolderOpen size={15} />
            Load
          </button>
          <button onClick={() => downloadText("signalforge-project.json", serializeProjectGraph({ ...graph, selectedNodeId }), "application/json")}>
            <Save size={15} />
            Save
          </button>
          <button onClick={() => csvInputRef.current?.click()}>
            <Upload size={15} />
            Import CSV
          </button>
          <button onClick={() => downloadText("signalforge-reproduce.py", exportPython({ ...graph, selectedNodeId }), "text/x-python")} title="Export a Python reproduction script for the current node graph">
            <FileCode size={15} />
            Export Py
          </button>
        </div>
        {csvImportMessage ? <div className="topbar-message">{csvImportMessage}</div> : null}
      </header>

      <div className="workspace">
        <ModuleLibrary onAdd={addNode} />
        <section className="center-workspace">
          <div className="canvas-header">
            <div>
              <h1>Node Canvas</h1>
              <p className="canvas-shortcuts">Left-drag pans. Shift-drag box selects. Shift+scroll zooms. Ctrl+Z/Y undo/redo. Delete removes selection.</p>
            </div>
            <div className="canvas-status-group">
              <BackendStatusChip status={analysisBackendStatus} runningCount={timeFrequencyRunningIds.length + externalCommandRunningIds.length} />
              <div className="status-chip">
                <Sparkles size={14} />
                {errorOverlay.size === 0
                  ? `DAG valid / ${selectedNodeIds.length + selectedGroupIds.length} selected`
                  : `${errorOverlay.size} error(s) / ${selectedNodeIds.length + selectedGroupIds.length} selected`}
              </div>
            </div>
          </div>
          <NodeCanvas
            graph={graph}
            mode={canvasMode}
            tool={canvasTool}
            selectedNodeIds={selectedNodeIds}
            selectedGroupIds={selectedGroupIds}
            errors={errorOverlay}
            signals={signalOverlay}
            previewView={visibleSelection}
            canvasView={canvasView}
            fitVersion={canvasFitVersion}
            layoutRunning={layoutRunning}
            connectFromId={connectFromId}
            dragConnection={dragConnection}
            selectedEdgeId={selectedEdgeId}
            connectionError={connectionError}
            onSelect={(id, append) => {
              if (append) {
                const next = selectedNodeIds.includes(id) ? selectedNodeIds.filter((item) => item !== id) : [...selectedNodeIds, id];
                setSelection(next, { preserveGroups: true });
              } else {
                setSelection([id]);
              }
            }}
            onInspectNode={(id, anchor) => {
              if (
                canvasMode !== "fullscreen" ||
                selectedNodeIds.length > 1 ||
                selectedNodeIds[selectedNodeIds.length - 1] !== id ||
                selectedGroupIds.length > 0
              ) return;
              const panelWidth = 350;
              const panelHeight = Math.min(760, window.innerHeight - 96);
              setFloatingInspectorPosition({
                x: anchor.x + panelWidth + 8 <= window.innerWidth ? anchor.x : Math.max(8, anchor.x - panelWidth - 200),
                y: Math.min(Math.max(8, anchor.y), Math.max(8, window.innerHeight - panelHeight - 8))
              });
              setActiveFloatingPanel("inspector");
              setCanvasInspectorVisible(true);
            }}
            onSelectMany={(ids, append) => setSelection(ids, { preserveGroups: append })}
            onSelectGroup={selectGroup}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id);
              setSelectedNodeIds([]);
              setSelectedGroupIds([]);
            }}
            onAdd={addNode}
            onMoveNodes={moveNodesByDelta}
            onMoveGroups={moveGroupsByDelta}
            onDuplicateGroup={duplicateGroupById}
            onDeleteGroup={deleteGroupById}
            onUngroupGroup={ungroupGroupById}
            onRenameGroup={renameGroupById}
            onOpenGroupResults={setGroupResultsId}
            onGroup={groupSelectedNodes}
            onUngroup={ungroupSelectedGroups}
            onDuplicateSelection={duplicateSelection}
            onDeleteSelection={deleteSelection}
            onDuplicateNode={duplicateNodeById}
            onDeleteNode={deleteNodeById}
            onSetDisplayNode={(id) =>
              commitGraph((current) =>
                current.displayNodeId === id ? { ...current, displayNodeId: undefined } : setDisplayNode(current, id)
              )
            }
            onRenameNode={(id, name) => {
              const node = graph.nodes.find((item) => item.id === id);
              if (node) updateNode({ ...node, name });
            }}
            onToggleDisabled={toggleNodeDisabled}
            onCanvasView={setCanvasView}
            onStartConnect={(id) => {
              setConnectFromId(id);
              setSelectedEdgeId(undefined);
              setConnectionError(undefined);
            }}
            onDragConnect={setDragConnection}
            onFinishConnect={(id) => {
              if (!connectFromId) return;
              connectNodes(connectFromId, id);
              setConnectFromId(undefined);
              setDragConnection(undefined);
            }}
            onAutoLayout={autoLayout}
            onUndo={undoGraph}
            onRedo={redoGraph}
            onClear={clearCanvas}
            onTool={setCanvasTool}
            onToggleInspector={() => setCanvasInspectorVisible((visible) => !visible)}
            onToggleResults={() => setCanvasResultsVisible((visible) => !visible)}
            inspectorVisible={canvasInspectorVisible}
            resultsVisible={canvasResultsVisible}
            onToggleFullscreen={() => {
              setCanvasMode((mode) => {
                const next = mode === "fullscreen" ? "embedded" : "fullscreen";
                if (next === "fullscreen") {
                  setCanvasTool("select");
                  setCanvasInspectorVisible(false);
                  setCanvasResultsVisible(false);
                }
                return next;
              });
            }}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            canClear={graph.nodes.length > 0}
          />
          <Timeline
            displayName={displayNode?.name}
            timeView={visibleTimeView}
            selection={visibleSelection}
            duration={duration}
            currentTime={currentTime}
            sampleRate={sampleRate}
            onCurrentTime={setCurrentTime}
            onTimeView={setTimeView}
            onSelection={setTimeSelection}
          />
          <section className="chart-deck single">
            <div className="chart-panel dominant">
              <div className="chart-heading">
                <div className="chart-tabs">
                  {displaySignalPlot?.kind === "line" ? (
                    <button className={activeChart === "series" ? "active" : ""} onClick={() => setChartMode("time")}>
                      {displaySignalPlot.xAxis.kind === "time" ? "Waveform" : "Result"}
                    </button>
                  ) : null}
                  {spectrumPlot ? <button className={activeChart === "spectrum" ? "active" : ""} onClick={() => setChartMode("spectrum")}>Spectrum</button> : null}
                  {analysisOnly ? <button className="active">Analysis</button> : null}
                </div>
                <div className="chart-tools">
                  {activeChart === "series" && displaySignalPlot?.kind === "line" ? (
                    <>
                      <span className={`domain-badge ${displaySignalPlot.xAxis.linkToMaster ? "linked" : "independent"}`}>
                        {displaySignalPlot.xAxis.label} · {displaySignalPlot.xAxis.linkToMaster ? "Master linked" : "Independent"}
                      </span>
                      <div className="plot-legend" aria-label="Visible series">
                        {[displaySignalPlot, ...compatibleComparePlots].map((plot, index) => (
                          <span key={plot.id}>
                            <i style={{ background: scientificPlotPalette[index % scientificPlotPalette.length] }} />
                            {plot.title}
                          </span>
                        ))}
                      </div>
                      <code className="plot-size">{displaySignalPlot.x.length.toLocaleString()} points</code>
                      <div className="cursor-readout">
                        <span>Crosshair</span>
                        <strong>{cursorReadout ? `${formatValue(cursorReadout.time)} ${displaySignalPlot.xAxis.unit}` : "-"}</strong>
                        <code>{formatValue(cursorReadout?.value)} {displaySignalPlot.yUnit}</code>
                      </div>
                      <label className="preview-density">
                        <span>Preview pts</span>
                        <select value={plotPreviewPoints} onChange={(event) => setPlotPreviewPoints(Number(event.target.value))}>
                          <option value={260}>260</option>
                          <option value={520}>520</option>
                          <option value={1000}>1000</option>
                          <option value={2000}>2000</option>
                        </select>
                      </label>
                      {!displaySignalPlot.xAxis.linkToMaster ? (
                        <button className="icon-action" title="Fit the complete result domain" onClick={() => setActivePlotView("x", undefined)}>
                          <Maximize2 size={14} />
                          Fit X
                        </button>
                      ) : null}
                      <button className="icon-action" title="Auto scale Y axis" onClick={() => setActivePlotView("y", undefined)}>
                        <SlidersHorizontal size={14} />
                        Auto Y
                      </button>
                    </>
                  ) : activeChart === "spectrum" && spectrumPlot ? (
                    <>
                      <span className="domain-badge independent">Frequency · Independent</span>
                      <div className="plot-legend">
                        <span><i style={{ background: scientificPlotPalette[0] }} />{spectrumPlot.title}</span>
                      </div>
                      <code className="plot-size">{spectrumPlot.frequency.length.toLocaleString()} bins</code>
                      <div className="compact-segments" aria-label="Spectrum magnitude scale">
                        <button className={spectrumMode === "linear" ? "active" : ""} onClick={() => setSpectrumMode("linear")}>Amplitude</button>
                        <button className={spectrumMode === "db" ? "active" : ""} onClick={() => setSpectrumMode("db")}>dB</button>
                      </div>
                      <div className="compact-segments" aria-label="Frequency axis scale">
                        <button className={frequencyScale === "linear" ? "active" : ""} onClick={() => setFrequencyScale("linear")}>Linear f</button>
                        <button className={frequencyScale === "log" ? "active" : ""} onClick={() => setFrequencyScale("log")}>Log f</button>
                      </div>
                      <button className="icon-action" title="Fit the complete frequency range" onClick={() => setActivePlotView("x", undefined)}><Maximize2 size={14} /> Fit X</button>
                      <button className="icon-action" title="Auto scale spectrum amplitude" onClick={() => setActivePlotView("y", undefined)}><SlidersHorizontal size={14} /> Auto Y</button>
                    </>
                  ) : displayAnalysis && displayAnalysis.type !== "spectrum" ? (
                    <div className="section-heading">
                      <Activity size={15} />
                      <span>{displayAnalysis.name}</span>
                    </div>
                  ) : (
                    <div className="section-heading">
                      <Activity size={15} />
                      <span>Frequency Spectrum</span>
                    </div>
                  )}
                </div>
              </div>
              {activeChart === "analysis" && displayAnalysis ? (
                <AnalysisPanel analysis={displayAnalysis} />
              ) : activeChart === "series" && displaySignalPlot?.kind === "line" ? (
                <ScientificSeriesPlot
                  model={displaySignalPlot}
                  comparisons={compatibleComparePlots}
                  xRange={displaySignalPlot.xAxis.linkToMaster ? { min: visibleSelection.start, max: visibleSelection.end } : activePlotView.x}
                  yRange={activePlotView.y}
                  cursorX={activeCursorX}
                  maxPreviewPoints={plotPreviewPoints}
                  onXRange={(range) => setActivePlotView("x", range)}
                  onYRange={(range) => setActivePlotView("y", range)}
                  onCursorX={(value) => {
                    if (displaySignalPlot.xAxis.linkToMaster) setCurrentTime(value);
                    else setPlotCursorXs((current) => ({ ...current, [plotKey]: value }));
                  }}
                />
              ) : activeChart === "spectrum" && spectrumPlot ? (
                <ScientificSpectrumPlot
                  model={spectrumPlot}
                  magnitudeMode={spectrumMode}
                  frequencyScale={frequencyScale}
                  xRange={activePlotView.x}
                  yRange={activePlotView.y}
                  onXRange={(range) => setActivePlotView("x", range)}
                  onYRange={(range) => setActivePlotView("y", range)}
                />
              ) : (
                <div className="chart-empty">No compatible result view</div>
              )}
            </div>
          </section>
        </section>
        <Inspector
          node={selectedNode}
          graph={graph}
          signals={signalOverlay}
          signal={selectedSignal}
          error={selectedNodeId ? errorOverlay.get(selectedNodeId) : undefined}
          sampleRate={sampleRate}
          totalDuration={duration}
          onChangeNode={updateNode}
          analysis={selectedAnalysis}
          inputNames={selectedNodeId ? graph.edges.filter((edge) => edge.to === selectedNodeId).map((edge) => graph.nodes.find((node) => node.id === edge.from)?.name ?? edge.from) : []}
          onExportNodeSignal={exportSelectedNodeSignal}
          onExportNodeAnalysis={exportSelectedNodeAnalysis}
        />
      </div>
      {canvasMode === "fullscreen" && canvasInspectorVisible ? (
        <FloatingPanel
          title={selectedNode ? `Inspector · ${selectedNode.name}` : "Inspector"}
          position={floatingInspectorPosition}
          className="floating-inspector"
          zIndex={activeFloatingPanel === "inspector" ? 1110 : 1100}
          onMove={setFloatingInspectorPosition}
          onClose={() => setCanvasInspectorVisible(false)}
          onFocus={() => setActiveFloatingPanel("inspector")}
        >
          <Inspector
            node={selectedNode}
            graph={graph}
            signals={signalOverlay}
            signal={selectedSignal}
            error={selectedNodeId ? errorOverlay.get(selectedNodeId) : undefined}
            sampleRate={sampleRate}
            totalDuration={duration}
            onChangeNode={updateNode}
            analysis={selectedAnalysis}
            inputNames={selectedNodeId ? graph.edges.filter((edge) => edge.to === selectedNodeId).map((edge) => graph.nodes.find((node) => node.id === edge.from)?.name ?? edge.from) : []}
            onExportNodeSignal={exportSelectedNodeSignal}
            onExportNodeAnalysis={exportSelectedNodeAnalysis}
          />
        </FloatingPanel>
      ) : null}
      {canvasMode === "fullscreen" && canvasResultsVisible ? (
        <FloatingPanel
          title={displayNode ? `Results · ${displayNode.name}` : "Results"}
          position={floatingResultsPosition}
          className="floating-results"
          zIndex={activeFloatingPanel === "results" ? 1110 : 1100}
          onMove={setFloatingResultsPosition}
          onClose={() => setCanvasResultsVisible(false)}
          onFocus={() => setActiveFloatingPanel("results")}
          maximized={canvasResultsMaximized}
          onToggleMaximize={() => setCanvasResultsMaximized((maximized) => !maximized)}
        >
          <div className="floating-result-toolbar">
            {displaySignalPlot?.kind === "line" ? (
              <button className={activeChart === "series" ? "active" : ""} onClick={() => setChartMode("time")}>Waveform</button>
            ) : null}
            {spectrumPlot ? (
              <button className={activeChart === "spectrum" ? "active" : ""} onClick={() => setChartMode("spectrum")}>Spectrum</button>
            ) : null}
            <button title="Auto scale Y axis" onClick={() => setActivePlotView("y", undefined)}>
              <SlidersHorizontal size={14} />
              Auto Y
            </button>
            {activeChart === "series" && displaySignalPlot?.kind === "line" ? (
              <div className="group-results-legend compact">
                {[displaySignalPlot, ...compatibleComparePlots].map((plot, index) => (
                  <span key={plot.id}>
                    <i style={{ background: scientificPlotPalette[index % scientificPlotPalette.length] }} />
                    {plot.title}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="floating-result-plot">
            {activeChart === "analysis" && displayAnalysis ? (
              <AnalysisPanel analysis={displayAnalysis} />
            ) : activeChart === "series" && displaySignalPlot?.kind === "line" ? (
              <ScientificSeriesPlot
                model={displaySignalPlot}
                comparisons={compatibleComparePlots}
                xRange={displaySignalPlot.xAxis.linkToMaster ? { min: visibleSelection.start, max: visibleSelection.end } : activePlotView.x}
                yRange={activePlotView.y}
                cursorX={activeCursorX}
                maxPreviewPoints={plotPreviewPoints}
                onXRange={(range) => setActivePlotView("x", range)}
                onYRange={(range) => setActivePlotView("y", range)}
                onCursorX={(value) => {
                  if (displaySignalPlot.xAxis.linkToMaster) setCurrentTime(value);
                  else setPlotCursorXs((current) => ({ ...current, [plotKey]: value }));
                }}
              />
            ) : activeChart === "spectrum" && spectrumPlot ? (
              <ScientificSpectrumPlot
                model={spectrumPlot}
                magnitudeMode={spectrumMode}
                frequencyScale={frequencyScale}
                xRange={activePlotView.x}
                yRange={activePlotView.y}
                onXRange={(range) => setActivePlotView("x", range)}
                onYRange={(range) => setActivePlotView("y", range)}
              />
            ) : (
              <div className="chart-empty">No compatible result view</div>
            )}
          </div>
        </FloatingPanel>
      ) : null}
      {groupResultsId && graph.groups?.some((group) => group.id === groupResultsId) ? (
        <FloatingPanel
          title={`Group Results · ${graph.groups.find((group) => group.id === groupResultsId)?.name ?? "Group"}`}
          position={floatingGroupResultsPosition}
          className="floating-results group-results-window"
          zIndex={1120}
          onMove={setFloatingGroupResultsPosition}
          onClose={() => setGroupResultsId(undefined)}
          onFocus={() => setActiveFloatingPanel("results")}
          maximized={groupResultsMaximized}
          onToggleMaximize={() => setGroupResultsMaximized((maximized) => !maximized)}
        >
          <GroupResultsPanel
            group={graph.groups.find((group) => group.id === groupResultsId) as GraphGroup}
            nodeIds={getGraphGroupNodeIds(graph, [groupResultsId])}
            nodes={graph.nodes}
            signals={signalOverlay}
            analyses={analysisOverlay}
          />
        </FloatingPanel>
      ) : null}
    </main>
  );
};
