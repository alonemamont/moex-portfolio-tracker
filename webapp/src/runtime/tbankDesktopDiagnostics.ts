import { isTauriRuntime } from "./isTauriRuntime";

export async function diagnoseTbankPortfolioRequest(token: string, accountId: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("diagnose_tbank_portfolio_request", {
      token,
      accountId,
    });
  } catch {
    return null;
  }
}
