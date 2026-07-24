import type { ParamValue, SignalGraph, SignalNode } from "./types";

export const CURRENT_PROJECT_SCHEMA_VERSION = 2;
export const CURRENT_SIGNAL_PROTOCOL_VERSION = 3;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);

const asNumber = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const asParamRecord = (value: unknown): Record<string, ParamValue> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === "number" || typeof item === "string" || typeof item === "boolean" || Array.isArray(item))
  ) as Record<string, ParamValue>;
};

const migrateNode = (value: unknown): SignalNode | undefined => {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" ? value.id : undefined;
  const name = typeof value.name === "string" ? value.name : id;
  const type = value.type;
  const rawKind = typeof value.kind === "string" ? value.kind : undefined;
  if (!id || !name || !rawKind) return undefined;

  const position = isRecord(value.position)
    ? { x: asNumber(value.position.x, 0), y: asNumber(value.position.y, 0) }
    : { x: 0, y: 0 };
  const timelineOffset = asNumber(value.timelineOffset, 0);
  const params = asParamRecord(value.params);

  if (type === "source") {
    const kind = rawKind === "cosine" ? "sine" : rawKind;
    const migratedParams = rawKind === "cosine" ? { ...params, phase: asNumber(params.phase, 0) + Math.PI / 2 } : params;
    return {
      id,
      name,
      type: "source",
      kind: kind as SignalNode["kind"],
      position,
      timelineOffset,
      sampleRate: Math.max(1, Math.round(asNumber(value.sampleRate, 1000))),
      length: Math.max(1, Math.round(asNumber(value.length, 1000))),
      seed: typeof value.seed === "number" ? value.seed : undefined,
      params: migratedParams
    } as SignalNode;
  }

  if (type === "operation") {
    const migratedParams = { ...params };
    if (rawKind === "secondOrderCorrelation") {
      delete migratedParams.averagePoints;
      if (migratedParams.outputMode === "curveOverTime") migratedParams.outputMode = "curveOverLag";
    }
    return {
      id,
      name,
      type: "operation",
      kind: rawKind as SignalNode["kind"],
      position,
      timelineOffset,
      params: migratedParams
    } as SignalNode;
  }

  return undefined;
};

export const migrateProjectGraph = (value: unknown): SignalGraph => {
  if (!isRecord(value)) throw new Error("Project JSON must be an object.");
  const nodes = Array.isArray(value.nodes) ? value.nodes.map(migrateNode).filter((node): node is SignalNode => Boolean(node)) : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(value.edges)
    ? value.edges
        .filter(isRecord)
        .map((edge) => ({
          id: typeof edge.id === "string" ? edge.id : `edge-${String(edge.from)}-${String(edge.to)}`,
          from: typeof edge.from === "string" ? edge.from : "",
          to: typeof edge.to === "string" ? edge.to : ""
        }))
        .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    : [];
  if (nodes.length === 0) throw new Error("Project does not contain any valid nodes.");

  const selectedNodeId = typeof value.selectedNodeId === "string" && nodeIds.has(value.selectedNodeId) ? value.selectedNodeId : nodes[0].id;
  const displayNodeId = typeof value.displayNodeId === "string" && nodeIds.has(value.displayNodeId) ? value.displayNodeId : selectedNodeId;
  const disabledNodeIds = Array.isArray(value.disabledNodeIds) ? value.disabledNodeIds.filter((id): id is string => typeof id === "string" && nodeIds.has(id)) : undefined;

  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    sampleRate: Math.max(1, Math.round(asNumber(value.sampleRate, 1000))),
    samples: Math.max(1, Math.round(asNumber(value.samples, 1000))),
    disabledNodeIds,
    nodes,
    edges,
    selectedNodeId,
    displayNodeId
  };
};

export const parseProjectJson = (json: string) => migrateProjectGraph(JSON.parse(json));

export const serializeProjectGraph = (graph: SignalGraph) =>
  JSON.stringify(
    {
      ...graph,
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      protocol: {
        name: "SignalForge 1D Signal Protocol",
        version: CURRENT_SIGNAL_PROTOCOL_VERSION,
        signalFields: ["sampleRate", "unit", "time", "values", "params", "provenance"],
        analysisFields: ["type", "params", "unit", "provenance"]
      },
      metadata: {
        app: "SignalForge",
        exportedAt: new Date().toISOString(),
        backend: {
          analysisServiceUrl: "http://127.0.0.1:8765",
          timeFrequencyBackend: "local-python-scipy"
        },
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length
      }
    },
    null,
    2
  );
