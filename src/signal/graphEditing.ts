import type { SignalGraph, SignalNode } from "./types";
import { getModuleDefinition } from "./modules";

const edgeId = (from: string, to: string) => `edge-${from}-${to}`;

const downstreamFrom = (graph: SignalGraph, startId: string) => {
  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    graph.edges
      .filter((edge) => edge.from === current)
      .forEach((edge) => {
        if (visited.has(edge.to)) return;
        visited.add(edge.to);
        queue.push(edge.to);
      });
  }

  return visited;
};

export const wouldCreateCycle = (graph: SignalGraph, from: string, to: string) => {
  if (from === to) return true;
  return downstreamFrom(graph, to).has(from);
};

export const canConnectGraphNodes = (graph: SignalGraph, from: string, to: string): { ok: boolean; reason?: string } => {
  if (from === to) return { ok: false, reason: "Cannot connect a node to itself." };
  if (graph.edges.some((edge) => edge.from === from && edge.to === to)) return { ok: false, reason: "Connection already exists." };
  if (wouldCreateCycle(graph, from, to)) return { ok: false, reason: "Connection would create a cycle." };

  const target = graph.nodes.find((node) => node.id === to);
  const definition = target ? getModuleDefinition(target.kind) : undefined;
  if (definition && definition.inputCount !== "many") {
    const currentInputs = graph.edges.filter((edge) => edge.to === to).length;
    if (currentInputs >= definition.inputCount) {
      return { ok: false, reason: `${definition.label} accepts ${definition.inputCount} input${definition.inputCount === 1 ? "" : "s"}.` };
    }
  }

  return { ok: true };
};

export const connectGraphNodes = (graph: SignalGraph, from: string, to: string): SignalGraph => {
  if (!canConnectGraphNodes(graph, from, to).ok) return graph;
  return {
    ...graph,
    edges: [...graph.edges, { id: edgeId(from, to), from, to }]
  };
};

export const removeGraphEdge = (graph: SignalGraph, edgeIdToRemove: string): SignalGraph => ({
  ...graph,
  edges: graph.edges.filter((edge) => edge.id !== edgeIdToRemove)
});

export const removeGraphNode = (graph: SignalGraph, nodeId: string): SignalGraph => ({
  ...graph,
  selectedNodeId: graph.selectedNodeId === nodeId ? undefined : graph.selectedNodeId,
  displayNodeId: graph.displayNodeId === nodeId ? undefined : graph.displayNodeId,
  disabledNodeIds: graph.disabledNodeIds?.filter((id) => id !== nodeId),
  nodes: graph.nodes.filter((node) => node.id !== nodeId),
  edges: graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId)
});

export const removeGraphNodes = (graph: SignalGraph, nodeIds: string[]): SignalGraph => {
  const ids = new Set(nodeIds);
  return {
    ...graph,
    selectedNodeId: graph.selectedNodeId && ids.has(graph.selectedNodeId) ? undefined : graph.selectedNodeId,
    displayNodeId: graph.displayNodeId && ids.has(graph.displayNodeId) ? undefined : graph.displayNodeId,
    disabledNodeIds: graph.disabledNodeIds?.filter((id) => !ids.has(id)),
    nodes: graph.nodes.filter((node) => !ids.has(node.id)),
    edges: graph.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to))
  };
};

export const setDisplayNode = (graph: SignalGraph, nodeId: string): SignalGraph => {
  if (!graph.nodes.some((node) => node.id === nodeId)) return graph;
  return { ...graph, displayNodeId: nodeId };
};

export const clearGraphCanvas = (graph: SignalGraph): SignalGraph => ({
  ...graph,
  nodes: [],
  edges: [],
  disabledNodeIds: [],
  selectedNodeId: undefined,
  displayNodeId: undefined
});

export const duplicateGraphNode = (graph: SignalGraph, nodeId: string): SignalGraph => {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) return graph;
  const copyId = `${node.id}-copy-${graph.nodes.filter((item) => item.id.startsWith(`${node.id}-copy`)).length + 1}`;
  const copy = {
    ...node,
    id: copyId,
    name: `${node.name} Copy`,
    position: { x: node.position.x + 32, y: node.position.y + 32 },
    params: { ...node.params }
  } as SignalNode;

  return {
    ...graph,
    selectedNodeId: copyId,
    nodes: [...graph.nodes, copy]
  };
};

export const duplicateGraphNodes = (graph: SignalGraph, nodeIds: string[]): SignalGraph => {
  const ids = new Set(nodeIds);
  const idMap = new Map<string, string>();
  const copies = graph.nodes
    .filter((node) => ids.has(node.id))
    .map((node) => {
      const copyId = `${node.id}-copy-${graph.nodes.filter((item) => item.id.startsWith(`${node.id}-copy`)).length + idMap.size + 1}`;
      idMap.set(node.id, copyId);
      return {
        ...node,
        id: copyId,
        name: `${node.name} Copy`,
        position: { x: node.position.x + 32, y: node.position.y + 32 },
        params: { ...node.params }
      } as SignalNode;
    });

  const copiedEdges = graph.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .map((edge) => {
      const from = idMap.get(edge.from) as string;
      const to = idMap.get(edge.to) as string;
      return { id: edgeId(from, to), from, to };
    });

  return {
    ...graph,
    selectedNodeId: copies[copies.length - 1]?.id ?? graph.selectedNodeId,
    nodes: [...graph.nodes, ...copies],
    edges: [...graph.edges, ...copiedEdges]
  };
};

export const moveGraphNodes = (graph: SignalGraph, nodeIds: string[], delta: { x: number; y: number }): SignalGraph => {
  const ids = new Set(nodeIds);
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      ids.has(node.id)
        ? {
            ...node,
            position: {
              x: Math.max(14, node.position.x + delta.x),
              y: Math.max(14, node.position.y + delta.y)
            }
          }
        : node
    )
  };
};

export const autoLayoutGraph = (graph: SignalGraph): SignalGraph => {
  const columnGap = 270;
  const rowGap = 132;
  const origin = { x: 76, y: 84 };
  const depth = new Map<string, number>();
  graph.nodes.forEach((node) => depth.set(node.id, 0));

  for (let pass = 0; pass < graph.nodes.length; pass += 1) {
    graph.edges.forEach((edge) => {
      const nextDepth = (depth.get(edge.from) ?? 0) + 1;
      if (nextDepth > (depth.get(edge.to) ?? 0)) depth.set(edge.to, nextDepth);
    });
  }

  const connectedIds = new Set(graph.edges.flatMap((edge) => [edge.from, edge.to]));
  const unconnectedNodes = graph.nodes.filter((node) => !connectedIds.has(node.id));
  const zoneNodes = new Set(unconnectedNodes.map((node) => node.id));
  const lanes = new Map<number, number>();
  const connectedPositions = new Map<string, { x: number; y: number }>();
  let maxConnectedY = origin.y - rowGap;
  graph.nodes
    .filter((node) => connectedIds.has(node.id))
    .forEach((node) => {
      const column = depth.get(node.id) ?? 0;
      const lane = lanes.get(column) ?? 0;
      lanes.set(column, lane + 1);
      const position = {
        x: origin.x + column * columnGap,
        y: origin.y + lane * rowGap
      };
      connectedPositions.set(node.id, position);
      maxConnectedY = Math.max(maxConnectedY, position.y);
    });

  const zoneStartY = connectedPositions.size > 0 ? maxConnectedY + rowGap + 40 : origin.y;
  const zoneLanes = new Map<string, number>();
  const zoneConfig = (node: SignalNode) => {
    const definition = getModuleDefinition(node.kind);
    if (node.type === "source") return { key: "source", baseX: origin.x, columns: 2 };
    if (definition?.type === "analysis") return { key: "analysis", baseX: origin.x + 5 * columnGap, columns: 3 };
    return { key: "operation", baseX: origin.x + 2 * columnGap, columns: 3 };
  };

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (zoneNodes.has(node.id)) {
        const zone = zoneConfig(node);
        const lane = zoneLanes.get(zone.key) ?? 0;
        zoneLanes.set(zone.key, lane + 1);
        return {
          ...node,
          position: {
            x: zone.baseX + (lane % zone.columns) * columnGap,
            y: zoneStartY + Math.floor(lane / zone.columns) * rowGap
          }
        };
      }
      return {
        ...node,
        position: connectedPositions.get(node.id) ?? node.position
      };
    })
  };
};
