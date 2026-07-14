import { BrokerAdapter } from "./types";

export function describeBrokerConnectionError(adapter: BrokerAdapter | undefined, error: unknown): string {
  const err = error as Error;
  const base = `Не удалось подключиться, возможно ограничение брокера: ${err.message}`;
  if (err instanceof TypeError && adapter?.networkErrorHint) {
    return `${base} ${adapter.networkErrorHint}`;
  }
  return base;
}
