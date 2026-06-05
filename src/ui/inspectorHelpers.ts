import type { Signal, SignalGraph } from "../signal";

export type CustomExpressionInputRow = {
  variable: string;
  nodeName: string;
  detail: string;
  available: boolean;
};

export const isEditableEventTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable || target.getAttribute("contenteditable") === "true";
};

export const createCustomExpressionInputRows = (graph: SignalGraph, nodeId: string, signals: Map<string, Signal>): CustomExpressionInputRow[] => {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => edge.to === nodeId)
    .map((edge, index) => {
      const node = nodesById.get(edge.from);
      const signal = signals.get(edge.from);
      return {
        variable: `x${index}`,
        nodeName: node?.name ?? edge.from,
        detail: signal ? `${signal.sampleRate.toLocaleString()} Hz · ${signal.values.length.toLocaleString()} samples` : "unavailable",
        available: Boolean(signal)
      };
    });
};
