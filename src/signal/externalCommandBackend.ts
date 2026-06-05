import type { OperationNode, ParamValue, Signal } from "./types";

export type ExternalCommandInput = {
  id: string;
  name: string;
  sampleRate: number;
  unit: string;
  time: number[];
  values: number[];
};

export type ExternalCommandRequest = {
  nodeId: string;
  name: string;
  executablePath: string;
  arguments: string;
  timeoutMs: number;
  sampleRate: number;
  inputs: ExternalCommandInput[];
  params: Record<string, ParamValue>;
};

export type ExternalCommandSignalResult = {
  type: "signal";
  values: number[];
  unit?: string;
  warnings?: string[];
  metadata?: Record<string, unknown>;
};

export type ExternalCommandErrorResult = {
  type: "external-command-error";
  status: "error";
  id: string;
  name: string;
  message: string;
  params: Record<string, ParamValue>;
};

type TauriWindow = Window &
  typeof globalThis & {
    __TAURI__?: {
      core?: {
        invoke?: <T>(command: string, args: Record<string, unknown>) => Promise<T>;
      };
    };
  };

const textParam = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
const numberParam = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const publicParams = (params: Record<string, ParamValue>) => {
  const { executablePath, arguments: commandArguments, timeoutMs, ...rest } = params;
  void executablePath;
  void commandArguments;
  void timeoutMs;
  return rest;
};

export const createExternalCommandRequest = (node: OperationNode, inputs: Signal[]): ExternalCommandRequest => ({
  nodeId: node.id,
  name: node.name,
  executablePath: textParam(node.params.executablePath, ""),
  arguments: textParam(node.params.arguments, "--input {input} --output {output}"),
  timeoutMs: Math.max(1000, Math.floor(numberParam(node.params.timeoutMs, 30000))),
  sampleRate: inputs[0]?.sampleRate ?? 1,
  inputs: inputs.map((signal) => ({
    id: signal.id,
    name: signal.name,
    sampleRate: signal.sampleRate,
    unit: signal.unit,
    time: signal.time,
    values: signal.values
  })),
  params: publicParams(node.params)
});

export const runExternalCommandBackend = async (request: ExternalCommandRequest): Promise<ExternalCommandSignalResult | ExternalCommandErrorResult> => {
  const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
  if (!invoke) {
    return {
      type: "external-command-error",
      status: "error",
      id: request.nodeId,
      name: request.name,
      message: "Executable modules cannot run directly in the browser workspace. Use the desktop shell or a local backend runner.",
      params: request.params
    };
  }

  try {
    return await invoke<ExternalCommandSignalResult>("run_external_command_module", { request });
  } catch (error) {
    return {
      type: "external-command-error",
      status: "error",
      id: request.nodeId,
      name: request.name,
      message: error instanceof Error ? error.message : String(error),
      params: request.params
    };
  }
};
