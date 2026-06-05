import { describe, expect, it } from "vitest";
import {
  autoLayoutGraph,
  canConnectGraphNodes,
  clearGraphCanvas,
  connectGraphNodes,
  duplicateGraphNode,
  duplicateGraphNodes,
  moveGraphNodes,
  removeGraphEdge,
  removeGraphNode,
  removeGraphNodes,
  sampleGraph,
  setDisplayNode,
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

  it("auto-layouts unconnected nodes into source operation and analysis zones", () => {
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
    const node = (id: string) => laidOut.nodes.find((item) => item.id === id);

    expect(node("s1")?.position.x).toBeLessThan(node("op1")?.position.x ?? 0);
    expect(node("op1")?.position.x).toBeLessThan(node("a1")?.position.x ?? 0);
    expect(node("s3")?.position.x).toBe(node("s1")?.position.x);
    expect(node("op4")?.position.x).toBe(node("op1")?.position.x);
    expect(node("a4")?.position.x).toBe(node("a1")?.position.x);
    expect(node("s3")?.position.y).toBeGreaterThan(node("s1")?.position.y ?? 0);
    expect(node("op4")?.position.y).toBeGreaterThan(node("op1")?.position.y ?? 0);
    expect(node("a4")?.position.y).toBeGreaterThan(node("a1")?.position.y ?? 0);
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
