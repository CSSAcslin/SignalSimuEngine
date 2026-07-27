import { describe, expect, it } from "vitest";
import {
  autoLayoutGraph,
  canConnectGraphNodes,
  clearGraphCanvas,
  connectGraphNodes,
  duplicateGraphNode,
  duplicateGraphNodes,
  duplicateGraphGroups,
  getGraphGroupNodeIds,
  groupGraphNodes,
  moveGraphGroups,
  moveGraphNodes,
  removeGraphGroups,
  removeGraphEdge,
  removeGraphNode,
  removeGraphNodes,
  sampleGraph,
  setDisplayNode,
  ungroupGraphGroups,
  wouldCreateCycle,
  type SignalGraph
} from "../src/signal";

const graph: SignalGraph = {
  nodes: [
    {
      id: "a",
      type: "source",
      kind: "constant",
      name: "A",
      position: { x: 0, y: 0 },
      timelineOffset: 0,
      sampleRate: 10,
      length: 3,
      params: { value: 1 }
    },
    {
      id: "b",
      type: "operation",
      kind: "scale",
      name: "B",
      position: { x: 100, y: 0 },
      timelineOffset: 0,
      params: { gain: 2 }
    },
    {
      id: "c",
      type: "operation",
      kind: "normalize",
      name: "C",
      position: { x: 200, y: 0 },
      timelineOffset: 0,
      params: {}
    }
  ],
  edges: [{ id: "a-b", from: "a", to: "b" }]
};

describe("graph editing helpers", () => {
  it("detects connections that would create a cycle", () => {
    const connected = connectGraphNodes(graph, "b", "c");

    expect(wouldCreateCycle(connected, "c", "a")).toBe(true);
    expect(wouldCreateCycle(connected, "a", "c")).toBe(false);
  });

  it("connects nodes once and rejects duplicate/self/cyclic edges", () => {
    const once = connectGraphNodes(graph, "a", "b");
    const self = connectGraphNodes(graph, "a", "a");
    const cyclic = connectGraphNodes(connectGraphNodes(graph, "b", "c"), "c", "a");

    expect(once.edges).toHaveLength(1);
    expect(self.edges).toHaveLength(1);
    expect(cyclic.edges.map((edge) => `${edge.from}-${edge.to}`)).toEqual(["a-b", "b-c"]);
  });

  it("removes one selected edge without touching other graph data", () => {
    const connected = connectGraphNodes(graph, "b", "c");
    const edited = removeGraphEdge(connected, "a-b");

    expect(edited.edges).toEqual([{ id: "edge-b-c", from: "b", to: "c" }]);
    expect(edited.nodes).toHaveLength(3);
  });

  it("duplicates a node with a new id, offset position, and no copied edges", () => {
    const duplicated = duplicateGraphNode(graph, "a");
    const copy = duplicated.nodes.find((node) => node.id.startsWith("a-copy"));

    expect(copy?.name).toBe("A Copy");
    expect(copy?.position).toEqual({ x: 32, y: 32 });
    expect(duplicated.edges).toEqual(graph.edges);
  });

  it("auto-layouts the sample graph from left to right by dependency depth", () => {
    const laidOut = autoLayoutGraph(sampleGraph);
    const carrier = laidOut.nodes.find((node) => node.id === "carrier");
    const multiply = laidOut.nodes.find((node) => node.id === "multiply-mod");
    const output = laidOut.nodes.find((node) => node.id === "normalize-output");

    expect(carrier?.position.x).toBeLessThan(multiply?.position.x ?? 0);
    expect(multiply?.position.x).toBeLessThan(output?.position.x ?? 0);
  });

  it("centers merge nodes between their inputs instead of top-aligning every layer", () => {
    const laidOut = autoLayoutGraph({
      nodes: [
        { id: "s1", type: "source", kind: "sine", name: "S1", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 1, length: 1, params: {} },
        { id: "s2", type: "source", kind: "noise", name: "S2", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 1, length: 1, params: {} },
        { id: "s3", type: "source", kind: "constant", name: "S3", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 1, length: 1, params: {} },
        { id: "merge", type: "operation", kind: "add", name: "Merge", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} }
      ],
      edges: [
        { id: "s1-merge", from: "s1", to: "merge" },
        { id: "s2-merge", from: "s2", to: "merge" },
        { id: "s3-merge", from: "s3", to: "merge" }
      ]
    });
    const y = (id: string) => laidOut.nodes.find((node) => node.id === id)?.position.y ?? 0;

    expect(y("merge")).toBeGreaterThan(y("s1"));
    expect(y("merge")).toBeLessThan(y("s3"));
    expect(y("merge")).toBe(y("s2"));
  });

  it("auto-layouts independent nodes as a compact matrix instead of a vertical list", () => {
    const laidOut = autoLayoutGraph({
      nodes: [
        { id: "s1", type: "source", kind: "sine", name: "S1", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 1, length: 1, params: {} },
        { id: "s2", type: "source", kind: "noise", name: "S2", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 1, length: 1, params: {} },
        { id: "s3", type: "source", kind: "constant", name: "S3", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 1, length: 1, params: {} },
        { id: "op1", type: "operation", kind: "scale", name: "OP1", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "op2", type: "operation", kind: "customExpression", name: "OP2", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "op3", type: "operation", kind: "externalCommand", name: "OP3", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "op4", type: "operation", kind: "normalize", name: "OP4", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "a1", type: "operation", kind: "fft", name: "A1", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "a2", type: "operation", kind: "stft", name: "A2", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "a3", type: "operation", kind: "quantiles", name: "A3", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "a4", type: "operation", kind: "distribution", name: "A4", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} }
      ],
      edges: []
    });
    const xValues = new Set(laidOut.nodes.map((node) => node.position.x));
    const yValues = new Set(laidOut.nodes.map((node) => node.position.y));
    const positions = new Set(laidOut.nodes.map((node) => `${node.position.x}:${node.position.y}`));

    expect(xValues.size).toBeGreaterThan(2);
    expect(yValues.size).toBeGreaterThan(1);
    expect(positions.size).toBe(laidOut.nodes.length);
  });

  it("keeps connected nodes in one workflow while arranging independent workflows without overlap", () => {
    const laidOut = autoLayoutGraph({
      nodes: [
        { id: "s1", type: "source", kind: "sine", name: "S1", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 1, length: 1, params: {} },
        { id: "op1", type: "operation", kind: "multiply", name: "OP1", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "out1", type: "operation", kind: "normalize", name: "OUT1", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "loose-source", type: "source", kind: "constant", name: "Loose Source", position: { x: 0, y: 0 }, timelineOffset: 0, sampleRate: 1, length: 1, params: {} },
        { id: "loose-op", type: "operation", kind: "scale", name: "Loose OP", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} },
        { id: "loose-analysis", type: "operation", kind: "fft", name: "Loose FFT", position: { x: 0, y: 0 }, timelineOffset: 0, params: {} }
      ],
      edges: [
        { id: "edge-s1-op1", from: "s1", to: "op1" },
        { id: "edge-op1-out1", from: "op1", to: "out1" }
      ]
    });
    const node = (id: string) => laidOut.nodes.find((item) => item.id === id);
    expect(node("s1")?.position.x).toBeLessThan(node("op1")?.position.x ?? 0);
    expect(node("op1")?.position.x).toBeLessThan(node("out1")?.position.x ?? 0);
    expect(new Set(laidOut.nodes.map((item) => `${item.position.x}:${item.position.y}`)).size).toBe(laidOut.nodes.length);
  });

  it("keeps nodes inside an explicit group compact during auto layout", () => {
    const grouped = groupGraphNodes(graph, ["a", "b"]);
    const laidOut = autoLayoutGraph(grouped);
    const a = laidOut.nodes.find((node) => node.id === "a");
    const b = laidOut.nodes.find((node) => node.id === "b");

    expect(Math.abs((b?.position.x ?? 0) - (a?.position.x ?? 0))).toBeLessThanOrEqual(224);
    expect(Math.abs((b?.position.y ?? 0) - (a?.position.y ?? 0))).toBeLessThanOrEqual(126);
  });

  it("pins a display target independently from selected node", () => {
    const pinned = setDisplayNode({ ...graph, selectedNodeId: "a" }, "c");

    expect(pinned.selectedNodeId).toBe("a");
    expect(pinned.displayNodeId).toBe("c");
  });

  it("clears pinned display target when that node is removed", () => {
    const pinned = setDisplayNode(graph, "b");
    const edited = removeGraphNode(pinned, "b");

    expect(edited.displayNodeId).toBeUndefined();
    expect(edited.edges).toEqual([]);
  });

  it("moves multiple nodes by the same delta", () => {
    const moved = moveGraphNodes(graph, ["a", "b"], { x: 20, y: 15 });

    expect(moved.nodes.find((node) => node.id === "a")?.position).toEqual({ x: 20, y: 15 });
    expect(moved.nodes.find((node) => node.id === "b")?.position).toEqual({ x: 120, y: 15 });
    expect(moved.nodes.find((node) => node.id === "c")?.position).toEqual({ x: 200, y: 0 });
  });

  it("duplicates multiple nodes with internal copied edges", () => {
    const duplicated = duplicateGraphNodes(graph, ["a", "b"]);
    const copyA = duplicated.nodes.find((node) => node.id.startsWith("a-copy"));
    const copyB = duplicated.nodes.find((node) => node.id.startsWith("b-copy"));

    expect(copyA?.params).toEqual({ value: 1 });
    expect(copyB?.params).toEqual({ gain: 2 });
    expect(duplicated.edges).toContainEqual({ id: `edge-${copyA?.id}-${copyB?.id}`, from: copyA?.id, to: copyB?.id });
  });

  it("removes multiple nodes and related edges", () => {
    const edited = removeGraphNodes(connectGraphNodes(graph, "b", "c"), ["a", "b"]);

    expect(edited.nodes.map((node) => node.id)).toEqual(["c"]);
    expect(edited.edges).toEqual([]);
  });

  it("groups, moves, and ungroups nodes without changing graph connectivity", () => {
    const grouped = groupGraphNodes(graph, ["a", "b"]);
    const groupId = grouped.groups?.[0]?.id as string;
    const moved = moveGraphGroups(grouped, [groupId], { x: 25, y: 30 });
    const ungrouped = ungroupGraphGroups(moved, [groupId]);

    expect(grouped.groups?.[0]?.nodeIds).toEqual(["a", "b"]);
    expect(moved.nodes.find((node) => node.id === "a")?.position).toEqual({ x: 25, y: 30 });
    expect(moved.nodes.find((node) => node.id === "b")?.position).toEqual({ x: 125, y: 30 });
    expect(ungrouped.groups).toEqual([]);
    expect(ungrouped.edges).toEqual(graph.edges);
  });

  it("duplicates a group with its nodes and internal edges", () => {
    const grouped = groupGraphNodes(graph, ["a", "b"]);
    const duplicated = duplicateGraphGroups(grouped, [grouped.groups?.[0]?.id as string]);
    const copiedGroup = duplicated.groups?.[1];

    expect(copiedGroup?.nodeIds).toHaveLength(2);
    expect(duplicated.nodes).toHaveLength(5);
    expect(duplicated.edges.some((edge) => copiedGroup?.nodeIds.includes(edge.from) && copiedGroup.nodeIds.includes(edge.to))).toBe(true);
  });

  it("supports nested groups and resolves all descendant nodes", () => {
    const child = groupGraphNodes(graph, ["a", "b"]);
    const childId = child.groups?.[0]?.id as string;
    const nested = groupGraphNodes(child, ["c"], [childId]);
    const parent = nested.groups?.[nested.groups.length - 1];
    const moved = moveGraphGroups(nested, [parent?.id as string], { x: 20, y: 20 });

    expect(parent?.childGroupIds).toEqual([childId]);
    expect(getGraphGroupNodeIds(nested, [parent?.id as string]).sort()).toEqual(["a", "b", "c"]);
    expect(moved.nodes.map((node) => node.position)).toEqual([
      { x: 20, y: 20 },
      { x: 120, y: 20 },
      { x: 220, y: 20 }
    ]);
  });

  it("ungroups a parent while preserving its nested child group", () => {
    const child = groupGraphNodes(graph, ["a", "b"]);
    const childId = child.groups?.[0]?.id as string;
    const nested = groupGraphNodes(child, ["c"], [childId]);
    const parentId = nested.groups?.[nested.groups.length - 1]?.id as string;
    const ungrouped = ungroupGraphGroups(nested, [parentId]);

    expect(ungrouped.groups?.map((group) => group.id)).toEqual([childId]);
    expect(ungrouped.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  it("duplicates and deletes complete nested group trees", () => {
    const child = groupGraphNodes(graph, ["a", "b"]);
    const childId = child.groups?.[0]?.id as string;
    const nested = groupGraphNodes(child, ["c"], [childId]);
    const parentId = nested.groups?.[nested.groups.length - 1]?.id as string;
    const duplicated = duplicateGraphGroups(nested, [parentId]);
    const copiedParent = duplicated.groups?.find((group) => group.id.startsWith(`${parentId}-copy`));
    const removed = removeGraphGroups(nested, [parentId]);

    expect(copiedParent?.childGroupIds).toHaveLength(1);
    expect(getGraphGroupNodeIds(duplicated, [copiedParent?.id as string])).toHaveLength(3);
    expect(removed.nodes).toEqual([]);
    expect(removed.groups).toEqual([]);
  });

  it("deletes grouped nodes and their connected edges", () => {
    const grouped = groupGraphNodes(graph, ["a", "b"]);
    const edited = removeGraphGroups(grouped, [grouped.groups?.[0]?.id as string]);

    expect(edited.nodes.map((node) => node.id)).toEqual(["c"]);
    expect(edited.edges).toEqual([]);
    expect(edited.groups).toEqual([]);
  });

  it("returns explicit connection rejection reasons", () => {
    const connected = connectGraphNodes(graph, "b", "c");

    expect(canConnectGraphNodes(graph, "a", "a")).toEqual({ ok: false, reason: "Cannot connect a node to itself." });
    expect(canConnectGraphNodes(graph, "a", "b")).toEqual({ ok: false, reason: "Connection already exists." });
    expect(canConnectGraphNodes(connected, "c", "a")).toEqual({ ok: false, reason: "Connection would create a cycle." });
    expect(canConnectGraphNodes(connected, "a", "c")).toEqual({ ok: false, reason: "Normalize accepts 1 input." });
    expect(canConnectGraphNodes(graph, "b", "c")).toEqual({ ok: true });
  });

  it("clears the canvas while preserving global sampling settings", () => {
    const cleared = clearGraphCanvas({ ...graph, sampleRate: 48000, samples: 1024, selectedNodeId: "a", displayNodeId: "b", disabledNodeIds: ["c"] });

    expect(cleared).toMatchObject({ sampleRate: 48000, samples: 1024, nodes: [], edges: [] });
    expect(cleared.selectedNodeId).toBeUndefined();
    expect(cleared.displayNodeId).toBeUndefined();
    expect(cleared.disabledNodeIds).toEqual([]);
  });
});
