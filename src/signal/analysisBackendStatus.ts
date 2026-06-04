const LOCAL_ANALYSIS_BACKEND_URL = "http://127.0.0.1:8765";

export type AnalysisBackendStatus = {
  status: "online" | "offline";
  message: string;
};

export const checkAnalysisBackendStatus = async (): Promise<AnalysisBackendStatus> => {
  try {
    const response = await fetch(`${LOCAL_ANALYSIS_BACKEND_URL}/health`);
    if (!response.ok) throw new Error(await response.text());
    return { status: "online", message: "Local analysis backend online" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: "offline",
      message: `Local analysis backend offline. Run pnpm backend:dev or pnpm web:full. ${detail}`
    };
  }
};
