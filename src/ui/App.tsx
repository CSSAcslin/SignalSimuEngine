import {
  Activity,
  ArrowDownToLine,
  Braces,
  Cable,
  CircleDot,
  Database,
  Copy,
  Download,
  Eye,
  FileJson,
  FlaskConical,
  Focus,
  GitBranch,
  Hand,
  Maximize2,
  Minus,
  MousePointer2,
  MoreVertical,
  PanelRight,
  Play,
  Plus,
  Repeat,
  Save,
  Shuffle,
  SkipBack,
  SkipForward,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Square,
  Triangle,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
  Waves
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  autoLayoutGraph,
  canConnectGraphNodes,
  clampSelection,
  clampView,
  connectGraphNodes,
  createTimeTicks,
  createValueTicks,
  decibels,
  duplicateGraphNode,
  duplicateGraphNodes,
  evaluateGraph,
  exportCsv,
  exportNpyFloat64,
  exportPython,
  getModuleDefinition,
  moduleDefinitions,
  moveGraphNodes,
  panSelection,
  panValueRange,
  panView,
  parseCsvSignalData,
  parseProjectJson,
  readSignalAtTime,
  removeGraphEdge,
  removeGraphNode,
  removeGraphNodes,
  sampleGraph,
  selectSignalWindow,
  setDisplayNode,
  snapTimeToSample,
  serializeProjectGraph,
  type ModuleDefinition,
  type OperationKind,
  type ParamValue,
  type AnalysisResult,
  type Signal,
  type SignalGraph,
  type SignalNode,
  type SourceKind,
  type Spectrum,
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
      seed: definition.kind === "noise" ? Math.floor(Math.random() * 10000) : undefined
    };
  }

  return {
    ...base,
    type: "operation",
    kind: definition.kind as OperationKind
  };
};

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

const moduleIconMap: Record<string, LucideIcon> = {
  sine: Waves,
  triangle: Triangle,
  square: Square,
  pulse: CircleDot,
  gaussianPulse: Activity,
  chirp: Sparkles,
  noise: Shuffle,
  constant: CircleDot,
  import: Upload,
  add: Plus,
  subtract: Minus,
  multiply: Sigma,
  scale: SlidersHorizontal,
  delay: Activity,
  convolve: Repeat,
  correlate: GitBranch,
  fft: Activity,
  normalize: Focus,
  rms: Activity,
  mean: Sigma,
  peak: ArrowDownToLine,
  snr: SlidersHorizontal,
  dominantFrequency: Waves,
  bandwidth: Maximize2,
  stft: Activity,
  cwt: Waves
};

const ModuleIcon = ({ kind, size = 16 }: { kind: string; size?: number }) => {
  const Icon = moduleIconMap[kind] ?? Sigma;
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
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
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
              const x = (index / Math.max(comparePoints.length - 1, 1)) * 100;
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

  if (analysis.type === "time-frequency-pending") {
    return (
      <div className="analysis-result-panel">
        <div className="analysis-pending-card">
          <span className="spinner" />
          <div>
            <strong>{analysis.method} queued for backend</strong>
            <p>{analysis.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return <SpectrumBars spectrumData={{ frequency: analysis.frequency, magnitude: analysis.magnitude }} mode="linear" />;
};

const ModuleLibrary = ({ onAdd }: { onAdd: (definition: ModuleDefinition) => void }) => {
  const sources = moduleDefinitions.filter((definition) => definition.type === "source");
  const operations = moduleDefinitions.filter((definition) => definition.type === "operation");
  const analysis = moduleDefinitions.filter((definition) => definition.type === "analysis");

  return (
    <aside className="module-library">
      <div className="panel-title">
        <Database size={17} />
        <span>Module Library</span>
      </div>
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
    </aside>
  );
};

const NodeCanvas = ({
  graph,
  selectedNodeIds,
  errors,
  signals,
  previewView,
  canvasView,
  connectFromId,
  dragConnection,
  selectedEdgeId,
  openNodeMenuId,
  connectionError,
  onSelect,
  onSelectMany,
  onSelectEdge,
  onAdd,
  onMoveNodes,
  onDuplicateNode,
  onDeleteNode,
  onSetDisplayNode,
  onRenameNode,
  onToggleDisabled,
  onStartConnect,
  onDragConnect,
  onFinishConnect,
  onAutoLayout,
  onCanvasView
}: {
  graph: SignalGraph;
  selectedNodeIds: string[];
  errors: Map<string, string>;
  signals: Map<string, Signal>;
  previewView: TimeView;
  canvasView: { x: number; y: number; zoom: number };
  connectFromId?: string;
  dragConnection?: { fromId: string; x: number; y: number };
  selectedEdgeId?: string;
  openNodeMenuId?: string;
  connectionError?: string;
  onSelect: (id: string, append?: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  onSelectEdge: (id: string) => void;
  onAdd: (definition: ModuleDefinition, position: { x: number; y: number }) => void;
  onMoveNodes: (ids: string[], delta: { x: number; y: number }) => void;
  onDuplicateNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onSetDisplayNode: (id: string) => void;
  onRenameNode: (id: string, name: string) => void;
  onToggleDisabled: (id: string) => void;
  onStartConnect: (id: string) => void;
  onDragConnect: (point?: { fromId: string; x: number; y: number }) => void;
  onFinishConnect: (id: string) => void;
  onAutoLayout: () => void;
  onCanvasView: (view: { x: number; y: number; zoom: number }) => void;
}) => {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const [panStart, setPanStart] = useState<{ x: number; y: number; viewX: number; viewY: number }>();
  const [blankStart, setBlankStart] = useState<{ x: number; y: number; moved: boolean }>();
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; currentX: number; currentY: number }>();
  const [nodeDragStart, setNodeDragStart] = useState<{ ids: string[]; nodeId: string; startPosition: { x: number; y: number } }>();
  const [localOpenMenuId, setLocalOpenMenuId] = useState<string | undefined>(openNodeMenuId);
  const selectedSet = new Set(selectedNodeIds);
  const disabledSet = new Set(graph.disabledNodeIds ?? []);
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

  return (
    <div className="canvas-shell">
      <div className="canvas-tools">
        <button onClick={() => onCanvasView({ ...canvasView, zoom: Math.min(1.6, canvasView.zoom + 0.1) })} title="Zoom in">
          <ZoomIn size={14} />
        </button>
        <button onClick={() => onCanvasView({ ...canvasView, zoom: Math.max(0.55, canvasView.zoom - 0.1) })} title="Zoom out">
          <ZoomOut size={14} />
        </button>
        <button onClick={() => onCanvasView({ x: 0, y: 0, zoom: 1 })} title="Fit view">
          <Maximize2 size={14} />
        </button>
        <button onClick={onAutoLayout} title="Auto layout">
          <Focus size={14} />
        </button>
        <span>
          <Hand size={13} />
          {Math.round(canvasView.zoom * 100)}%
        </span>
      </div>
      <div
      className="node-canvas"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const kind = event.dataTransfer.getData("module-kind");
        const definition = getModuleDefinition(kind);
        if (!definition) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onAdd(definition, { x: (event.clientX - rect.left - canvasView.x) / canvasView.zoom - 80, y: (event.clientY - rect.top - canvasView.y) / canvasView.zoom - 36 });
      }}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (event.button !== 0 || target.closest(".graph-node, .node-port, .canvas-tools, path")) return;
        if (event.shiftKey) {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - rect.left - canvasView.x) / canvasView.zoom;
          const y = (event.clientY - rect.top - canvasView.y) / canvasView.zoom;
          setSelectionBox({ x, y, currentX: x, currentY: y });
          return;
        }
        setBlankStart({ x: event.clientX, y: event.clientY, moved: false });
        setPanStart({ x: event.clientX, y: event.clientY, viewX: canvasView.x, viewY: canvasView.y });
      }}
      onMouseMove={(event) => {
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
      onMouseUp={() => {
        if (selectionBox) {
          const left = Math.min(selectionBox.x, selectionBox.currentX);
          const right = Math.max(selectionBox.x, selectionBox.currentX);
          const top = Math.min(selectionBox.y, selectionBox.currentY);
          const bottom = Math.max(selectionBox.y, selectionBox.currentY);
          onSelectMany(
            graph.nodes
              .filter((node) => node.position.x + 176 >= left && node.position.x <= right && node.position.y + 70 >= top && node.position.y <= bottom)
              .map((node) => node.id)
          );
          setSelectionBox(undefined);
        }
        if (blankStart && !blankStart.moved) onSelectMany([]);
        setBlankStart(undefined);
        setPanStart(undefined);
        onDragConnect(undefined);
      }}
      onMouseLeave={() => {
        setPanStart(undefined);
        setSelectionBox(undefined);
        setBlankStart(undefined);
      }}
      onWheel={(event) => {
        if (!event.shiftKey) return;
        event.preventDefault();
        const zoom = Math.min(1.6, Math.max(0.55, canvasView.zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
        onCanvasView({ ...canvasView, zoom });
      }}
    >
      <div className="canvas-transform" style={{ transform: `translate(${canvasView.x}px, ${canvasView.y}px) scale(${canvasView.zoom})` }}>
      <svg className="edge-layer">
        {graph.edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;
          const startX = from.position.x + 176;
          const startY = from.position.y + 48;
          const endX = to.position.x;
          const endY = to.position.y + 48;
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
            d={`M ${(nodeMap.get(dragConnection.fromId)?.position.x ?? 0) + 176} ${(nodeMap.get(dragConnection.fromId)?.position.y ?? 0) + 48} C ${dragConnection.x - 80} ${(nodeMap.get(dragConnection.fromId)?.position.y ?? 0) + 48}, ${dragConnection.x - 60} ${dragConnection.y}, ${dragConnection.x} ${dragConnection.y}`}
          />
        ) : null}
      </svg>
      {graph.nodes.map((node) => {
        const moduleType = getModuleDefinition(node.kind)?.type ?? node.type;
        return (
        <div
          key={node.id}
          className={`graph-node ${node.type} ${moduleType} ${selectedSet.has(node.id) ? "selected" : ""} ${errors.has(node.id) ? "error" : ""} ${disabledSet.has(node.id) ? "disabled" : ""} ${localOpenMenuId === node.id ? "menu-open" : ""}`}
          style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }}
          onClick={(event) => onSelect(node.id, event.shiftKey)}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("node-id", node.id);
            const ids = selectedSet.has(node.id) ? selectedNodeIds : [node.id];
            if (!selectedSet.has(node.id)) onSelect(node.id);
            setNodeDragStart({ ids, nodeId: node.id, startPosition: node.position });
          }}
          onDragEnd={(event) => {
            const canvas = event.currentTarget.closest(".node-canvas");
            const rect = canvas?.getBoundingClientRect();
            if (!rect || !nodeDragStart) return;
            const nextPosition = {
              x: Math.max(14, (event.clientX - rect.left - canvasView.x) / canvasView.zoom - 80),
              y: Math.max(14, (event.clientY - rect.top - canvasView.y) / canvasView.zoom - 34)
            };
            onMoveNodes(nodeDragStart.ids, { x: nextPosition.x - nodeDragStart.startPosition.x, y: nextPosition.y - nodeDragStart.startPosition.y });
            setNodeDragStart(undefined);
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
                Set display target
              </button>
              <button
                onClick={() => {
                  onSetDisplayNode(node.id);
                  setLocalOpenMenuId(undefined);
                }}
              >
                <Eye size={13} />
                Inspect Output
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
  signal,
  analysis,
  error,
  inputNames,
  sampleRate,
  totalDuration,
  onChangeNode,
  onExportProject,
  onExportSignal,
  onExportPython
}: {
  node?: SignalNode;
  signal?: Signal;
  analysis?: AnalysisResult;
  error?: string;
  inputNames: string[];
  sampleRate: number;
  totalDuration: number;
  onChangeNode: (node: SignalNode) => void;
  onExportProject: () => void;
  onExportSignal: (format: "csv" | "npy") => void;
  onExportPython: () => void;
}) => {
  const definition = node ? getModuleDefinition(node.kind) : undefined;
  const sourceStart = node?.type === "source" ? clampNumber(node.timelineOffset, 0, totalDuration, 0) : 0;
  const minSourceDuration = Math.max(1 / sampleRate, 0.000001);
  const maxSourceDuration = Math.max(minSourceDuration, totalDuration - sourceStart);
  const outputLabel = signal ? "Signal" : analysis ? (analysis.type === "scalar" ? "Scalar analysis" : analysis.type === "spectrum" ? "Spectrum analysis" : "Time-frequency analysis") : "Unavailable";

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
            const value = node.params[param.key] ?? param.defaultValue;
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
              </label>
            );
          })}
          {error ? <div className="error-box">{error}</div> : null}
          <div className="signal-stats">
            <strong>{signal ? signal.values.length.toLocaleString() : 0}</strong>
            <span>samples</span>
            <strong>{signal ? signal.sampleRate.toLocaleString() : "-"}</strong>
            <span>Hz</span>
          </div>
          <div className="provenance-box">
            <div className="provenance-title">
              <Activity size={14} />
              <span>Run Summary</span>
            </div>
            <dl>
              <dt>Module</dt>
              <dd>{definition ? `${definition.label} / ${definition.type}` : node.kind}</dd>
              <dt>Output</dt>
              <dd>{outputLabel}</dd>
              <dt>Inputs</dt>
              <dd>{inputNames.length > 0 ? inputNames.join(", ") : "None"}</dd>
              <dt>Status</dt>
              <dd>{error ? "Error" : "Ready"}</dd>
            </dl>
          </div>
        </>
      )}
      <div className="export-stack">
        <button onClick={onExportProject}>
          <FileJson size={15} />
          Project JSON
        </button>
        <button onClick={() => onExportSignal("csv")} disabled={!signal}>
          <ArrowDownToLine size={15} />
          CSV
        </button>
        <button onClick={() => onExportSignal("npy")} disabled={!signal}>
          <Braces size={15} />
          NPY
        </button>
        <button onClick={onExportPython}>
          <Download size={15} />
          Python
        </button>
      </div>
    </aside>
  );
};

export const App = () => {
  const [graph, setGraph] = useState<SignalGraph>(sampleGraph);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(sampleGraph.selectedNodeId ? [sampleGraph.selectedNodeId] : []);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const [connectFromId, setConnectFromId] = useState<string>();
  const [dragConnection, setDragConnection] = useState<{ fromId: string; x: number; y: number }>();
  const [connectionError, setConnectionError] = useState<string>();
  const [canvasView, setCanvasView] = useState({ x: 0, y: 0, zoom: 1 });
  const [chartMode, setChartMode] = useState<"time" | "spectrum">("time");
  const [spectrumMode, setSpectrumMode] = useState<"linear" | "db">("linear");
  const [plotPreviewPoints, setPlotPreviewPoints] = useState(520);
  const [timeView, setTimeView] = useState<TimeView>({ start: 0, end: 1 });
  const [timeSelection, setTimeSelection] = useState<TimeView>({ start: 0, end: 1 });
  const [currentTime, setCurrentTime] = useState(0);
  const [yRange, setYRange] = useState<ValueRange>();
  const [undoStack, setUndoStack] = useState<SignalGraph[]>([]);
  const [redoStack, setRedoStack] = useState<SignalGraph[]>([]);
  const [csvImportMessage, setCsvImportMessage] = useState<string>();
  const selectedNodeId = selectedNodeIds[selectedNodeIds.length - 1] ?? graph.selectedNodeId;
  const evaluation = useMemo(() => evaluateGraph({ ...graph, selectedNodeId }), [graph, selectedNodeId]);
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const selectedSignal = selectedNodeId ? evaluation.signals.get(selectedNodeId) : undefined;
  const selectedAnalysis = selectedNodeId ? evaluation.analysis.get(selectedNodeId) : undefined;
  const displayNodeId = graph.displayNodeId ?? selectedNodeId;
  const displayNode = graph.nodes.find((node) => node.id === displayNodeId);
  const displaySignal = displayNodeId ? evaluation.signals.get(displayNodeId) : undefined;
  const displayAnalysis = displayNodeId ? evaluation.analysis.get(displayNodeId) : undefined;
  const displaySpectrum = displayAnalysis?.type === "spectrum" ? { frequency: displayAnalysis.frequency, magnitude: displayAnalysis.magnitude } : undefined;
  const compareSignals = selectedNodeIds
    .filter((id) => id !== displayNodeId)
    .map((id) => evaluation.signals.get(id))
    .filter((signal): signal is Signal => Boolean(signal));
  const cursorReadout = readSignalAtTime(displaySignal, currentTime);
  const sampleRate = graphSampleRate(graph);
  const samples = graphSamples(graph);
  const duration = graphDuration(graph);
  const visibleTimeView = clampView(timeView.end > duration ? { start: 0, end: duration } : timeView, duration);
  const visibleSelection = clampSelection(timeSelection.end > duration ? { start: 0, end: duration } : timeSelection, visibleTimeView, duration);

  const commitGraph = (updater: (current: SignalGraph) => SignalGraph) => {
    setGraph((current) => {
      const next = updater(current);
      if (next === current) return current;
      setUndoStack((stack) => [...stack, current].slice(-80));
      setRedoStack([]);
      return next;
    });
  };

  const setSelection = (ids: string[]) => {
    const existing = ids.filter((id) => graph.nodes.some((node) => node.id === id));
    setSelectedNodeIds(existing);
    setSelectedEdgeId(undefined);
    setGraph((current) => ({ ...current, selectedNodeId: existing[existing.length - 1] }));
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
        if (selectedEdgeId) {
          commitGraph((current) => removeGraphEdge(current, selectedEdgeId));
          setSelectedEdgeId(undefined);
        } else {
          deleteSelectedNodes();
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelectedNodes();
      }
      if (event.key === "Escape") {
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

  const deleteSelectedEdge = () => {
    if (!selectedEdgeId) return;
    commitGraph((current) => removeGraphEdge(current, selectedEdgeId));
    setSelectedEdgeId(undefined);
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

  const autoLayout = () => {
    commitGraph((current) => autoLayoutGraph(current));
    setCanvasView({ x: 0, y: 0, zoom: 1 });
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
    setSelectedEdgeId(undefined);
  };

  const redoGraph = () => {
    const next = redoStack[0];
    if (!next) return;
    setUndoStack((stack) => [...stack, graph].slice(-80));
    setRedoStack((stack) => stack.slice(1));
    setGraph(next);
    setSelectedNodeIds(next.selectedNodeId ? [next.selectedNodeId] : []);
    setSelectedEdgeId(undefined);
  };

  const exportSelected = (format: "csv" | "npy") => {
    if (!displaySignal) return;
    if (format === "csv") downloadText(`${displaySignal.name}.csv`, exportCsv(displaySignal), "text/csv");
    else downloadBlob(`${displaySignal.name}.npy`, exportNpyFloat64(displaySignal));
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
      setCsvImportMessage(imported.warnings[0] ?? `Imported ${imported.values.length.toLocaleString()} samples from ${file.name}`);
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
          <button onClick={() => csvInputRef.current?.click()}>
            <Upload size={15} />
            Import CSV
          </button>
          <button onClick={() => projectInputRef.current?.click()}>
            <FileJson size={15} />
            Load
          </button>
          <button onClick={undoGraph} disabled={undoStack.length === 0}>
            <Repeat size={15} />
            Undo
          </button>
          <button onClick={redoGraph} disabled={redoStack.length === 0}>
            <Repeat size={15} />
            Redo
          </button>
          <button onClick={() => downloadText("signalforge-project.json", serializeProjectGraph({ ...graph, selectedNodeId }), "application/json")}>
            <Save size={15} />
            Save
          </button>
          <button onClick={() => downloadText("signalforge-reproduce.py", exportPython({ ...graph, selectedNodeId }), "text/x-python")}>
            <Play size={15} />
            Python
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
            <div className="status-chip">
              <Sparkles size={14} />
              {evaluation.errors.size === 0 ? `DAG valid · ${selectedNodeIds.length} selected` : `${evaluation.errors.size} error(s) · ${selectedNodeIds.length} selected`}
            </div>
          </div>
          <NodeCanvas
            graph={graph}
            selectedNodeIds={selectedNodeIds}
            errors={evaluation.errors}
            signals={evaluation.signals}
            previewView={visibleSelection}
            canvasView={canvasView}
            connectFromId={connectFromId}
            dragConnection={dragConnection}
            selectedEdgeId={selectedEdgeId}
            connectionError={connectionError}
            onSelect={(id, append) => {
              if (append) {
                const next = selectedNodeIds.includes(id) ? selectedNodeIds.filter((item) => item !== id) : [...selectedNodeIds, id];
                setSelection(next);
              } else {
                setSelection([id]);
              }
            }}
            onSelectMany={setSelection}
            onSelectEdge={(id) => {
              setSelectedEdgeId(id);
              setSelectedNodeIds([]);
            }}
            onAdd={addNode}
            onMoveNodes={moveNodesByDelta}
            onDuplicateNode={duplicateNodeById}
            onDeleteNode={deleteNodeById}
            onSetDisplayNode={(id) => commitGraph((current) => setDisplayNode(current, id))}
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
                  <button className={chartMode === "time" ? "active" : ""} onClick={() => setChartMode("time")}>Time</button>
                  <button className={chartMode === "spectrum" ? "active" : ""} onClick={() => setChartMode("spectrum")}>Spectrum</button>
                  {displayAnalysis && displayAnalysis.type !== "spectrum" ? <button className="active">Analysis</button> : null}
                  {chartMode === "spectrum" ? (
                    <>
                      <button className={spectrumMode === "linear" ? "active" : ""} onClick={() => setSpectrumMode("linear")}>Linear</button>
                      <button className={spectrumMode === "db" ? "active" : ""} onClick={() => setSpectrumMode("db")}>dB</button>
                    </>
                  ) : null}
                </div>
                <div className="chart-tools">
                  {chartMode === "time" && !displayAnalysis ? (
                    <>
                      <div className="cursor-readout">
                        <span>Current Sample</span>
                        <strong>{cursorReadout ? cursorReadout.time.toFixed(6) : "-"}s</strong>
                        <code>{formatValue(cursorReadout?.value)}</code>
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
                      <button className="icon-action" title="Auto scale Y axis" onClick={() => setYRange(undefined)}>
                        <SlidersHorizontal size={14} />
                        Auto Scale Y
                      </button>
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
              {displayAnalysis && displayAnalysis.type !== "spectrum" ? (
                <AnalysisPanel analysis={displayAnalysis} />
              ) : chartMode === "time" ? (
                <SignalLine
                  signal={displaySignal}
                  compareSignals={compareSignals}
                  color="#0ea5e9"
                  timeView={visibleSelection}
                  currentTime={currentTime}
                  cursorValue={cursorReadout?.value}
                  yRange={yRange}
                  maxPreviewPoints={plotPreviewPoints}
                  onYRange={setYRange}
                  onCurrentTime={setCurrentTime}
                />
              ) : (
                <SpectrumBars signal={displaySignal} spectrumData={displaySpectrum} mode={spectrumMode} />
              )}
              <div className="chart-window-readout">
                <MousePointer2 size={13} />
                <span>{displayNode?.name ?? "no display target"}</span>
              </div>
            </div>
          </section>
        </section>
        <Inspector
          node={selectedNode}
          signal={selectedSignal}
          error={selectedNodeId ? evaluation.errors.get(selectedNodeId) : undefined}
          sampleRate={sampleRate}
          totalDuration={duration}
          onChangeNode={updateNode}
          analysis={selectedAnalysis}
          inputNames={selectedNodeId ? graph.edges.filter((edge) => edge.to === selectedNodeId).map((edge) => graph.nodes.find((node) => node.id === edge.from)?.name ?? edge.from) : []}
          onExportProject={() => downloadText("signalforge-project.json", serializeProjectGraph({ ...graph, selectedNodeId }), "application/json")}
          onExportSignal={exportSelected}
          onExportPython={() => downloadText("signalforge-reproduce.py", exportPython({ ...graph, selectedNodeId }), "text/x-python")}
        />
      </div>
    </main>
  );
};
