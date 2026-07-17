import { isTauriRuntime } from "../runtime/isTauriRuntime";
import { getBrokerAdapter } from "../brokers/registry";

export const WINDOWS_RELEASE_URL = "https://github.com/alonemamont/moex-portfolio-tracker/releases/latest";

export function isBrokerSyncAvailable(brokerId: string): boolean {
  const adapter = getBrokerAdapter(brokerId);
  return !adapter?.requiresDesktopRuntime || isTauriRuntime();
}
