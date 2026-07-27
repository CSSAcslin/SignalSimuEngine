import ELK from "elkjs/lib/elk-api.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";
import type { GraphGroup, SignalGraph } from "./types";

export type LayoutPoint = { x: number; y: number };
export type SignalGraphLayout = {
  positions: Record<string, LayoutPoint>;
};

type LayoutBlock = {
  id: string;
  nodeIds: string[];
  width: number;
  height: number;
  positions: Record<string, LayoutPoint>;
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 112;
const GROUP_PADDING = 24;
const elk = new ELK({
  workerFactory: () => new ElkWorker()
});

const layoutItems = async (
  id: string,
  items: LayoutBlock[],
  edges: ElkExtendedEdge[],
  algorithm: "stress" | "rectpacking"
): Promise<LayoutBlock> => {
  if (items.length === 1) return items[0];
  const graph: ElkNode = {
    id,
    layoutOptions: {
      "elk.algorithm": algorithm,
      "elk.padding": `[top=${GROUP_PADDING},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
      "elk.spacing.nodeNode": "38",
      "elk.aspectRatio": "2.4",
      "elk.stress.desiredEdgeLength": "220",
      "elk.stress.iterationLimit": "350",
      "elk.stress.dimension": "XY"
    },
    children: items.map((item) => ({
      id: item.id,
      width: item.width,
      height: item.height
    })),
    edges
  };
  const result = await elk.layout(graph);
  const placements = (result.children ?? []).map((child) => ({
    id: child.id,
    x: child.x ?? GROUP_PADDING,
    y: child.y ?? GROUP_PADDING,
    width: child.width ?? NODE_WIDTH,
    height: child.height ?? NODE_HEIGHT
  }));
  if (algorithm === "stress" && edges.length > 0) {
    const rank = new Map(items.map((item) => [item.id, 0]));
    for (let pass = 0; pass < items.length; pass += 1) {
      let changed = false;
      edges.forEach((edge) => {
        const source = edge.sources?.[0];
        const target = edge.targets?.[0];
        if (!source || !target) return;
        const next = (rank.get(source) ?? 0) + 1;
        if (next <= (rank.get(target) ?? 0)) return;
        rank.set(target, next);
        changed = true;
      });
      if (!changed) break;
    }
    const minStressX = Math.min(...placements.map((placement) => placement.x), 0);
    const minStressY = Math.min(...placements.map((placement) => placement.y), 0);
    const rankStep = Math.max(...placements.map((placement) => placement.width), NODE_WIDTH) + 72;
    placements.forEach((placement) => {
      placement.x = (rank.get(placement.id) ?? 0) * rankStep + (placement.x - minStressX) * 0.18;
      placement.y = (placement.y - minStressY) * 0.55;
    });
  }
  const collisionGap = 30;
  for (let pass = 0; pass < 120; pass += 1) {
    let adjusted = false;
    for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
        const left = placements[leftIndex];
        const right = placements[rightIndex];
        const overlapX = Math.min(left.x + left.width + collisionGap, right.x + right.width + collisionGap) - Math.max(left.x, right.x);
        const overlapY = Math.min(left.y + left.height + collisionGap, right.y + right.height + collisionGap) - Math.max(left.y, right.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        adjusted = true;
        if (overlapX < overlapY) {
          const shift = overlapX / 2 + 1;
          if (left.x + left.width / 2 <= right.x + right.width / 2) {
            left.x -= shift;
            right.x += shift;
          } else {
            left.x += shift;
            right.x -= shift;
          }
        } else {
          const shift = overlapY / 2 + 1;
          if (left.y + left.height / 2 <= right.y + right.height / 2) {
            left.y -= shift;
            right.y += shift;
          } else {
            left.y += shift;
            right.y -= shift;
          }
        }
      }
    }
    if (!adjusted) break;
  }
  const placementMinX = Math.min(...placements.map((placement) => placement.x), 0);
  const placementMinY = Math.min(...placements.map((placement) => placement.y), 0);
  placements.forEach((placement) => {
    placement.x += GROUP_PADDING - placementMinX;
    placement.y += GROUP_PADDING - placementMinY;
  });
  const positions: Record<string, LayoutPoint> = {};
  placements.forEach((placement) => {
    const item = items.find((candidate) => candidate.id === placement.id);
    if (!item) return;
    const itemMinX = Math.min(...item.nodeIds.map((nodeId) => item.positions[nodeId]?.x ?? 0));
    const itemMinY = Math.min(...item.nodeIds.map((nodeId) => item.positions[nodeId]?.y ?? 0));
    item.nodeIds.forEach((nodeId) => {
      const point = item.positions[nodeId];
      positions[nodeId] = {
        x: placement.x + point.x - itemMinX,
        y: placement.y + point.y - itemMinY
      };
    });
  });
  return {
    id,
    nodeIds: items.flatMap((item) => item.nodeIds),
    width: Math.max(...placements.map((placement) => placement.x + placement.width), NODE_WIDTH) + GROUP_PADDING,
    height: Math.max(...placements.map((placement) => placement.y + placement.height), NODE_HEIGHT) + GROUP_PADDING,
    positions
  };
};

const blockEdges = (graph: SignalGraph, items: LayoutBlock[]): ElkExtendedEdge[] => {
  const owner = new Map<string, string>();
  items.forEach((item) => item.nodeIds.forEach((nodeId) => owner.set(nodeId, item.id)));
  const seen = new Set<string>();
  return graph.edges.flatMap((edge) => {
    const from = owner.get(edge.from);
    const to = owner.get(edge.to);
    if (!from || !to || from === to || seen.has(`${from}:${to}`)) return [];
    seen.add(`${from}:${to}`);
    return [{ id: `layout-${from}-${to}`, sources: [from], targets: [to] }];
  });
};

const nodeBlock = (graph: SignalGraph, nodeId: string): LayoutBlock => {
  const node = graph.nodes.find((item) => item.id === nodeId);
  return {
    id: `node:${nodeId}`,
    nodeIds: [nodeId],
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    positions: { [nodeId]: node?.position ?? { x: 0, y: 0 } }
  };
};

const buildGroupBlock = async (
  graph: SignalGraph,
  group: GraphGroup,
  groupMap: Map<string, GraphGroup>
): Promise<LayoutBlock> => {
  const childBlocks = await Promise.all(
    (group.childGroupIds ?? []).map((id) => groupMap.get(id)).filter((child): child is GraphGroup => Boolean(child)).map((child) => buildGroupBlock(graph, child, groupMap))
  );
  const covered = new Set(childBlocks.flatMap((block) => block.nodeIds));
  const directBlocks = group.nodeIds.filter((id) => !covered.has(id)).map((id) => nodeBlock(graph, id));
  const items = [...childBlocks, ...directBlocks];
  const edges = blockEdges(graph, items);
  const algorithm = edges.length > 0 ? "stress" : "rectpacking";
  const block = await layoutItems(`group:${group.id}`, items, edges, algorithm);
  return { ...block, width: block.width + GROUP_PADDING, height: block.height + GROUP_PADDING };
};

const connectedComponents = (ids: string[], edges: Array<{ from: string; to: string }>) => {
  const neighbors = new Map(ids.map((id) => [id, new Set<string>()]));
  edges.forEach(({ from, to }) => {
    neighbors.get(from)?.add(to);
    neighbors.get(to)?.add(from);
  });
  const visited = new Set<string>();
  const components: string[][] = [];
  ids.forEach((id) => {
    if (visited.has(id)) return;
    const component: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length > 0) {
      const current = queue.shift() as string;
      component.push(current);
      neighbors.get(current)?.forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }
    components.push(component);
  });
  return components;
};

export const computeSignalGraphLayout = async (graph: SignalGraph): Promise<SignalGraphLayout> => {
  const groupMap = new Map((graph.groups ?? []).map((group) => [group.id, group]));
  const childGroupIds = new Set((graph.groups ?? []).flatMap((group) => group.childGroupIds ?? []));
  const rootGroups = (graph.groups ?? []).filter((group) => !childGroupIds.has(group.id));
  const rootBlocks = await Promise.all(rootGroups.map((group) => buildGroupBlock(graph, group, groupMap)));
  const groupedNodeIds = new Set(rootBlocks.flatMap((block) => block.nodeIds));
  const ungroupedIds = graph.nodes.filter((node) => !groupedNodeIds.has(node.id)).map((node) => node.id);
  const ungroupedSet = new Set(ungroupedIds);
  const ungroupedEdges = graph.edges.filter((edge) => ungroupedSet.has(edge.from) && ungroupedSet.has(edge.to));
  const looseComponents = connectedComponents(ungroupedIds, ungroupedEdges);
  const looseBlocks = await Promise.all(
    looseComponents.map(async (component, index) => {
      const items = component.map((id) => nodeBlock(graph, id));
      const edges = blockEdges(graph, items);
      return layoutItems(`implicit:${index}`, items, edges, edges.length > 0 ? "stress" : "rectpacking");
    })
  );
  const atomicBlocks = [...rootBlocks, ...looseBlocks];
  const owner = new Map<string, string>();
  atomicBlocks.forEach((block) => block.nodeIds.forEach((id) => owner.set(id, block.id)));
  const quotientEdges = graph.edges.flatMap((edge) => {
    const from = owner.get(edge.from);
    const to = owner.get(edge.to);
    return from && to && from !== to ? [{ from, to }] : [];
  });
  const workflowIds = connectedComponents(atomicBlocks.map((block) => block.id), quotientEdges);
  const workflows = await Promise.all(
    workflowIds.map(async (ids, index) => {
      const idSet = new Set(ids);
      const items = atomicBlocks.filter((block) => idSet.has(block.id));
      const edges = blockEdges(graph, items);
      return layoutItems(`workflow:${index}`, items, edges, edges.length > 0 ? "stress" : "rectpacking");
    })
  );
  const packed = await layoutItems("root", workflows, [], "rectpacking");
  const minX = Math.min(...Object.values(packed.positions).map((point) => point.x), 0);
  const minY = Math.min(...Object.values(packed.positions).map((point) => point.y), 0);
  const positions = Object.fromEntries(
    Object.entries(packed.positions).map(([id, point]) => [id, { x: point.x - minX + 76, y: point.y - minY + 84 }])
  );
  return { positions };
};
