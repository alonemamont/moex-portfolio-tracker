import { isTauriRuntime } from "../runtime/isTauriRuntime";

type DiagnosticLevel = "info" | "warn" | "error";

export function describeDiagnosticError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

export function buildBrokerSyncLogLine(
  level: DiagnosticLevel,
  stage: string,
  details: Record<string, unknown>
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    source: "broker-sync",
    level,
    stage,
    details,
  });
}

function mirrorBrokerSyncLogToDesktop(level: DiagnosticLevel, stage: string, details: Record<string, unknown>): void {
  if (!isTauriRuntime()) {
    return;
  }

  const line = buildBrokerSyncLogLine(level, stage, details);
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("append_broker_sync_log", { line }))
    .catch(() => {
      // Avoid recursive logging if desktop diagnostics pipeline itself fails.
    });
}

export function logBrokerSyncInfo(stage: string, details: Record<string, unknown>): void {
  console.info(`[broker-sync] ${stage}`, details);
  mirrorBrokerSyncLogToDesktop("info", stage, details);
}

export function logBrokerSyncWarn(stage: string, details: Record<string, unknown>): void {
  console.warn(`[broker-sync] ${stage}`, details);
  mirrorBrokerSyncLogToDesktop("warn", stage, details);
}

export function logBrokerSyncError(stage: string, error: unknown, details: Record<string, unknown> = {}): void {
  const payload = {
    ...details,
    error: describeDiagnosticError(error),
  };
  console.error(`[broker-sync] ${stage}`, payload);
  mirrorBrokerSyncLogToDesktop("error", stage, payload);
}
