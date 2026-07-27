import type { GraphGroup, SignalGraph, SignalNode } from "./types";
import { getModuleDefinition } from "./modules";
import { createRandomSeed, isRandomSourceKind } from "./random";

const edgeId = (from: string, to: string) => `edge-${from}-${to}`;
const compactGroups = (
  groups: GraphGroup[] | undefined,
  excludedNodeIds = new Set<string>(),
  excludedGroupIds = new Set<string>()
) => {
  if (!groups) return undefined;
  let compacted = groups
    .filter((group) => !excludedGroupIds.has(group.id))
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((id) => !excludedNodeIds.has(id)),
      childGroupIds: group.childGroupIds?.filter((id) => !excludedGroupIds.has(id))
    }));
  let changed = true;
  while (changed) {
    const validIds = new Set(
      compacted
        .filter((group) => group.nodeIds.length + (group.childGroupIds?.length ?? 0) > 1)
        .map((group) => group.id)
    );
    const next = compacted
      .filter((group) => validIds.has(group.id))
      .map((group) => ({ ...group, childGroupIds: group.childGroupIds?.filter((id) => validIds.has(id)) }))
      .filter((group) => group.nodeIds.length + (group.childGroupIds?.length ?? 0) > 1);
    changed =
      next.length !== compacted.length ||
      next.some((group, index) => (group.childGroupIds?.length ?? 0) !== (compacted[index]?.childGroupIds?.length ?? 0));
    compacted = next;
  }
  return compacted;
};

export const getGraphGroupNodeIds = (graph: SignalGraph, groupIds: string[]): string[] => {
  const groupMap = new Map((graph.groups ?? []).map((group) => [group.id, group]));
  const visitedGroups = new Set<string>();
  const nodeIds = new Set<string>();
  const visit = (groupId: string) => {
    if (visitedGroups.has(groupId)) return;
    visitedGroups.add(groupId);
    const group = groupMap.get(groupId);
    if (!group) return;
    group.nodeIds.forEach((id) => nodeIds.add(id));
    group.childGroupIds?.forEach(visit);
  };
  groupIds.forEach(visit);
  return [...nodeIds];
};

const getGraphGroupTreeIds = (graph: SignalGraph, groupIds: string[]): string[] => {
  const groupMap = new Map((graph.groups ?? []).map((group) => [group.id, group]));
  const visited = new Set<string>();
  const visit = (groupId: string) => {
    if (visited.has(groupId)) return;
    visited.add(groupId);
    groupMap.get(groupId)?.childGroupIds?.forEach(visit);
  };
  groupIds.forEach(visit);
  return [...visited];
};

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
  edges: graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
  groups: compactGroups(graph.groups, new Set([nodeId]))
});

export const removeGraphNodes = (graph: SignalGraph, nodeIds: string[]): SignalGraph => {
  const ids = new Set(nodeIds);
  return {
    ...graph,
    selectedNodeId: graph.selectedNodeId && ids.has(graph.selectedNodeId) ? undefined : graph.selectedNodeId,
    displayNodeId: graph.displayNodeId && ids.has(graph.displayNodeId) ? undefined : graph.displayNodeId,
    disabledNodeIds: graph.disabledNodeIds?.filter((id) => !ids.has(id)),
    nodes: graph.nodes.filter((node) => !ids.has(node.id)),
    edges: graph.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to)),
    groups: compactGroups(graph.groups, ids)
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
  groups: [],
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
  if (copy.type === "source" && isRandomSourceKind(copy.kind)) copy.seed = createRandomSeed();

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
      const copy = {
        ...node,
        id: copyId,
        name: `${node.name} Copy`,
        position: { x: node.position.x + 32, y: node.position.y + 32 },
        params: { ...node.params }
      } as SignalNode;
      if (copy.type === "source" && isRandomSourceKind(copy.kind)) copy.seed = createRandomSeed();
      return copy;
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

const nextGroupId = (graph: SignalGraph) => {
  let index = (graph.groups?.length ?? 0) + 1;
  while (graph.groups?.some((group) => group.id === `group-${index}`)) index += 1;
  return `group-${index}`;
};

export const groupGraphNodes = (graph: SignalGraph, nodeIds: string[], childGroupIds: string[] = []): SignalGraph => {
  const validChildGroupIds = [...new Set(childGroupIds)].filter((id) => graph.groups?.some((group) => group.id === id));
  const coveredNodeIds = new Set(getGraphGroupNodeIds(graph, validChildGroupIds));
  const validIds = [...new Set(nodeIds)].filter((id) => graph.nodes.some((node) => node.id === id) && !coveredNodeIds.has(id));
  if (validIds.length + validChildGroupIds.length < 2) return graph;
  const idSet = new Set(validIds);
  const groups = compactGroups(graph.groups, idSet) ?? [];
  const id = nextGroupId({ ...graph, groups });
  return {
    ...graph,
    groups: [...groups, { id, name: `Group ${groups.length + 1}`, nodeIds: validIds, childGroupIds: validChildGroupIds }]
  };
};

export const ungroupGraphGroups = (graph: SignalGraph, groupIds: string[]): SignalGraph => {
  const ids = new Set(groupIds);
  if (!graph.groups?.some((group) => ids.has(group.id))) return graph;
  const removed = new Map(graph.groups.filter((group) => ids.has(group.id)).map((group) => [group.id, group]));
  return {
    ...graph,
    groups: graph.groups
      .filter((group) => !ids.has(group.id))
      .map((group) => {
        const expanded = (group.childGroupIds ?? []).filter((id) => ids.has(id)).map((id) => removed.get(id));
        return {
          ...group,
          nodeIds: [...new Set([...group.nodeIds, ...expanded.flatMap((child) => child?.nodeIds ?? [])])],
          childGroupIds: [
            ...new Set([
              ...(group.childGroupIds ?? []).filter((id) => !ids.has(id)),
              ...expanded.flatMap((child) => child?.childGroupIds ?? [])
            ])
          ]
        };
      })
  };
};

export const moveGraphGroups = (graph: SignalGraph, groupIds: string[], delta: { x: number; y: number }): SignalGraph => {
  return moveGraphNodes(graph, getGraphGroupNodeIds(graph, groupIds), delta);
};

export const removeGraphGroups = (graph: SignalGraph, groupIds: string[]): SignalGraph => {
  const treeIds = new Set(getGraphGroupTreeIds(graph, groupIds));
  const nodeIds = getGraphGroupNodeIds(graph, groupIds);
  return removeGraphNodes({ ...graph, groups: compactGroups(graph.groups, new Set(), treeIds) }, nodeIds);
};

export const duplicateGraphGroups = (graph: SignalGraph, groupIds: string[]): SignalGraph => {
  const treeIds = new Set(getGraphGroupTreeIds(graph, groupIds));
  const selectedGroups = graph.groups?.filter((group) => treeIds.has(group.id)) ?? [];
  if (selectedGroups.length === 0) return graph;
  const sourceNodeIds = new Set(getGraphGroupNodeIds(graph, groupIds));
  const idMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();
  const copies = graph.nodes
    .filter((node) => sourceNodeIds.has(node.id))
    .map((node) => {
      const copyId = `${node.id}-copy-${graph.nodes.filter((item) => item.id.startsWith(`${node.id}-copy`)).length + idMap.size + 1}`;
      idMap.set(node.id, copyId);
      const copy = {
        ...node,
        id: copyId,
        name: `${node.name} Copy`,
        position: { x: node.position.x + 42, y: node.position.y + 42 },
        params: { ...node.params }
      } as SignalNode;
      if (copy.type === "source" && isRandomSourceKind(copy.kind)) copy.seed = createRandomSeed();
      return copy;
    });
  const copiedEdges = graph.edges
    .filter((edge) => idMap.has(edge.from) && idMap.has(edge.to))
    .map((edge) => {
      const from = idMap.get(edge.from) as string;
      const to = idMap.get(edge.to) as string;
      return { id: edgeId(from, to), from, to };
    });
  const existingGroups = graph.groups ?? [];
  selectedGroups.forEach((group, index) => {
    groupIdMap.set(group.id, `${group.id}-copy-${existingGroups.filter((item) => item.id.startsWith(`${group.id}-copy`)).length + index + 1}`);
  });
  const copiedGroups = selectedGroups.map((group) => ({
    ...group,
    id: groupIdMap.get(group.id) as string,
    name: `${group.name} Copy`,
    nodeIds: group.nodeIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id)),
    childGroupIds: group.childGroupIds?.map((id) => groupIdMap.get(id)).filter((id): id is string => Boolean(id))
  }));
  return {
    ...graph,
    nodes: [...graph.nodes, ...copies],
    edges: [...graph.edges, ...copiedEdges],
    groups: [...existingGroups, ...copiedGroups],
    selectedNodeId: copies[copies.length - 1]?.id ?? graph.selectedNodeId
  };
};

const autoLayoutLegacyGraph = (graph: SignalGraph): SignalGraph => {
  const columnGap = 270;
  const rowGap = 132;
  const componentGap = 72;
  const nodeHeight = 112;
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
  const connectedPositions = new Map<string, { x: number; y: number }>();
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const originalOrder = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const neighbors = new Map<string, string[]>();
  graph.nodes.forEach((node) => {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
    neighbors.set(node.id, []);
  });
  graph.edges.forEach((edge) => {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
    neighbors.get(edge.from)?.push(edge.to);
    neighbors.get(edge.to)?.push(edge.from);
  });

  const components: SignalNode[][] = [];
  const visited = new Set<string>();
  graph.nodes
    .filter((node) => connectedIds.has(node.id))
    .forEach((node) => {
      if (visited.has(node.id)) return;
      const component: SignalNode[] = [];
      const queue = [node.id];
      visited.add(node.id);
      while (queue.length > 0) {
        const id = queue.shift() as string;
        const item = nodeById.get(id);
        if (item) component.push(item);
        (neighbors.get(id) ?? []).forEach((neighborId) => {
          if (visited.has(neighborId)) return;
          visited.add(neighborId);
          queue.push(neighborId);
        });
      }
      components.push(component);
    });

  let componentStartY = origin.y;
  let maxConnectedY = origin.y - rowGap;
  components.forEach((component) => {
    const layers = new Map<number, SignalNode[]>();
    component.forEach((node) => {
      const layer = depth.get(node.id) ?? 0;
      layers.set(layer, [...(layers.get(layer) ?? []), node]);
    });
    const layerIndexes = [...layers.keys()].sort((left, right) => left - right);
    const orderMap = () => {
      const order = new Map<string, number>();
      layerIndexes.forEach((layer) => {
        (layers.get(layer) ?? []).forEach((node, index) => order.set(node.id, index));
      });
      return order;
    };
    const sortLayer = (layer: number, related: Map<string, string[]>) => {
      const nodes = layers.get(layer);
      if (!nodes || nodes.length < 2) return;
      const order = orderMap();
      const score = (node: SignalNode) => {
        const indexes = (related.get(node.id) ?? [])
          .map((id) => order.get(id))
          .filter((index): index is number => index !== undefined);
        return indexes.length > 0 ? indexes.reduce((sum, index) => sum + index, 0) / indexes.length : undefined;
      };
      nodes.sort((left, right) => {
        const leftScore = score(left);
        const rightScore = score(right);
        if (leftScore !== undefined && rightScore !== undefined && leftScore !== rightScore) return leftScore - rightScore;
        if (leftScore !== undefined && rightScore === undefined) return -1;
        if (leftScore === undefined && rightScore !== undefined) return 1;
        return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
      });
    };

    for (let pass = 0; pass < 4; pass += 1) {
      layerIndexes.slice(1).forEach((layer) => sortLayer(layer, incoming));
      layerIndexes.slice(0, -1).reverse().forEach((layer) => sortLayer(layer, outgoing));
    }

    const maxRows = Math.max(1, ...layerIndexes.map((layer) => layers.get(layer)?.length ?? 0));
    layerIndexes.forEach((layer) => {
      const nodes = layers.get(layer) ?? [];
      const centeredOffset = ((maxRows - nodes.length) * rowGap) / 2;
      nodes.forEach((node, lane) => {
        const position = {
          x: origin.x + layer * columnGap,
          y: componentStartY + centeredOffset + lane * rowGap
        };
        connectedPositions.set(node.id, position);
        maxConnectedY = Math.max(maxConnectedY, position.y);
      });
    });
    componentStartY += Math.max(nodeHeight, (maxRows - 1) * rowGap + nodeHeight) + componentGap;
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

export const autoLayoutGraph = (graph: SignalGraph): SignalGraph => {
  if (graph.nodes.length === 0) return graph;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodeOrder = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const childGroupIds = new Set((graph.groups ?? []).flatMap((group) => group.childGroupIds ?? []));
  const rootGroups = (graph.groups ?? []).filter((group) => !childGroupIds.has(group.id));
  const nodeToBlock = new Map<string, string>();

  type LayoutBlock = {
    id: string;
    nodeIds: string[];
    relative: Map<string, { x: number; y: number }>;
    width: number;
    height: number;
  };

  const compactNodes = (nodeIds: string[]) => {
    const ids = new Set(nodeIds);
    const internalEdges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
    const relative = new Map<string, { x: number; y: number }>();
    if (internalEdges.length === 0) {
      const columns = Math.max(1, Math.ceil(Math.sqrt(nodeIds.length)));
      nodeIds.forEach((id, index) => relative.set(id, { x: (index % columns) * 214, y: Math.floor(index / columns) * 126 }));
    } else {
      const depth = new Map(nodeIds.map((id) => [id, 0]));
      for (let pass = 0; pass < nodeIds.length; pass += 1) {
        internalEdges.forEach((edge) => depth.set(edge.to, Math.max(depth.get(edge.to) ?? 0, (depth.get(edge.from) ?? 0) + 1)));
      }
      const layers = new Map<number, string[]>();
      nodeIds.forEach((id) => {
        const layer = depth.get(id) ?? 0;
        layers.set(layer, [...(layers.get(layer) ?? []), id]);
      });
      const maxRows = Math.max(...[...layers.values()].map((layerIds) => layerIds.length), 1);
      [...layers.entries()].forEach(([layer, layerIds]) => {
        const offsetY = ((maxRows - layerIds.length) * 126) / 2;
        layerIds
          .sort((left, right) => (nodeOrder.get(left) ?? 0) - (nodeOrder.get(right) ?? 0))
          .forEach((id, row) => relative.set(id, { x: layer * 224, y: offsetY + row * 126 }));
      });
    }
    const width = Math.max(...[...relative.values()].map((position) => position.x + 176), 176);
    const height = Math.max(...[...relative.values()].map((position) => position.y + 112), 112);
    return { relative, width, height };
  };

  const blocks: LayoutBlock[] = [];
  rootGroups.forEach((group) => {
    const nodeIds = getGraphGroupNodeIds(graph, [group.id]).filter((id) => nodeById.has(id) && !nodeToBlock.has(id));
    if (nodeIds.length === 0) return;
    nodeIds.forEach((id) => nodeToBlock.set(id, `group:${group.id}`));
    blocks.push({ id: `group:${group.id}`, nodeIds, ...compactNodes(nodeIds) });
  });
  graph.nodes.forEach((node) => {
    if (nodeToBlock.has(node.id)) return;
    const id = `node:${node.id}`;
    nodeToBlock.set(node.id, id);
    blocks.push({ id, nodeIds: [node.id], relative: new Map([[node.id, { x: 0, y: 0 }]]), width: 176, height: 112 });
  });

  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const blockEdges = new Map<string, Set<string>>();
  const incomingBlocks = new Map<string, Set<string>>();
  const blockNeighbors = new Map<string, Set<string>>();
  blocks.forEach((block) => {
    blockEdges.set(block.id, new Set());
    incomingBlocks.set(block.id, new Set());
    blockNeighbors.set(block.id, new Set());
  });
  graph.edges.forEach((edge) => {
    const from = nodeToBlock.get(edge.from);
    const to = nodeToBlock.get(edge.to);
    if (!from || !to || from === to) return;
    blockEdges.get(from)?.add(to);
    incomingBlocks.get(to)?.add(from);
    blockNeighbors.get(from)?.add(to);
    blockNeighbors.get(to)?.add(from);
  });

  const workflows: LayoutBlock[][] = [];
  const visitedBlocks = new Set<string>();
  blocks.forEach((block) => {
    if (visitedBlocks.has(block.id)) return;
    const workflow: LayoutBlock[] = [];
    const queue = [block.id];
    visitedBlocks.add(block.id);
    while (queue.length > 0) {
      const id = queue.shift() as string;
      const item = blockById.get(id);
      if (item) workflow.push(item);
      blockNeighbors.get(id)?.forEach((neighbor) => {
        if (visitedBlocks.has(neighbor)) return;
        visitedBlocks.add(neighbor);
        queue.push(neighbor);
      });
    }
    workflows.push(workflow);
  });

  const workflowLayouts = workflows.map((workflow) => {
    const workflowIds = new Set(workflow.map((block) => block.id));
    const depth = new Map(workflow.map((block) => [block.id, 0]));
    for (let pass = 0; pass < workflow.length; pass += 1) {
      workflow.forEach((block) => {
        blockEdges.get(block.id)?.forEach((to) => {
          if (workflowIds.has(to)) depth.set(to, Math.max(depth.get(to) ?? 0, (depth.get(block.id) ?? 0) + 1));
        });
      });
    }
    const layers = new Map<number, LayoutBlock[]>();
    workflow.forEach((block) => {
      const layer = depth.get(block.id) ?? 0;
      layers.set(layer, [...(layers.get(layer) ?? []), block]);
    });
    const positions = new Map<string, { x: number; y: number }>();
    const layerHeights = new Map(
      [...layers.entries()].map(([layer, layerBlocks]) => [
        layer,
        Math.max(0, layerBlocks.reduce((sum, block) => sum + block.height + 64, 0) - 64)
      ])
    );
    const maxLayerHeight = Math.max(...layerHeights.values(), 112);
    let x = 0;
    let workflowHeight = 0;
    [...layers.keys()].sort((left, right) => left - right).forEach((layer) => {
      const layerBlocks = layers.get(layer) ?? [];
      const layerWidth = Math.max(...layerBlocks.map((block) => block.width), 176);
      let y = (maxLayerHeight - (layerHeights.get(layer) ?? 0)) / 2;
      layerBlocks.forEach((block) => {
        positions.set(block.id, { x, y });
        y += block.height + 64;
      });
      workflowHeight = Math.max(workflowHeight, Math.max(0, y - 64));
      x += layerWidth + 104;
    });
    return {
      positions,
      width: Math.max(176, x - 104),
      height: Math.max(112, workflowHeight)
    };
  });

  const matrixColumns = Math.max(1, Math.ceil(Math.sqrt(workflowLayouts.length)));
  const matrixRows = Math.ceil(workflowLayouts.length / matrixColumns);
  const columnWidths = Array.from({ length: matrixColumns }, (_, column) =>
    Math.max(...workflowLayouts.filter((_, index) => index % matrixColumns === column).map((layout) => layout.width), 176)
  );
  const rowHeights = Array.from({ length: matrixRows }, (_, row) =>
    Math.max(...workflowLayouts.slice(row * matrixColumns, (row + 1) * matrixColumns).map((layout) => layout.height), 112)
  );
  const columnOffsets = columnWidths.map((_, index) => columnWidths.slice(0, index).reduce((sum, width) => sum + width + 120, 0));
  const rowOffsets = rowHeights.map((_, index) => rowHeights.slice(0, index).reduce((sum, height) => sum + height + 100, 0));
  const finalPositions = new Map<string, { x: number; y: number }>();

  workflowLayouts.forEach((layout, workflowIndex) => {
    const column = workflowIndex % matrixColumns;
    const row = Math.floor(workflowIndex / matrixColumns);
    const workflow = workflows[workflowIndex];
    workflow.forEach((block) => {
      const blockPosition = layout.positions.get(block.id) ?? { x: 0, y: 0 };
      block.nodeIds.forEach((nodeId) => {
        const relative = block.relative.get(nodeId) ?? { x: 0, y: 0 };
        finalPositions.set(nodeId, {
          x: 76 + columnOffsets[column] + blockPosition.x + relative.x,
          y: 84 + rowOffsets[row] + blockPosition.y + relative.y
        });
      });
    });
  });

  if (finalPositions.size !== graph.nodes.length) return autoLayoutLegacyGraph(graph);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, position: finalPositions.get(node.id) ?? node.position }))
  };
};
