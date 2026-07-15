import { isTauriRuntime } from "../runtime/isTauriRuntime";

export const WINDOWS_RELEASE_URL = "https://github.com/alonemamont/moex-portfolio-tracker/releases/latest";

export function isBrokerSyncAvailable(brokerId: string): boolean {
  return brokerId !== "tbank" || isTauriRuntime();
}
