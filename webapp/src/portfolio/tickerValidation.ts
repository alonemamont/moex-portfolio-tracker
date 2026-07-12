import { Position } from "../types";
import { SecurityInfo } from "../iss/client";

export type TickerValidationState =
  | { kind: "idle" }
  | { kind: "found"; shortName: string }
  | { kind: "not_found" }
  | { kind: "duplicate" };

export async function validateTicker(
  ticker: string,
  existingPositions: Position[],
  fetchSecurities: (tickers: string[]) => Promise<Map<string, SecurityInfo>>
): Promise<TickerValidationState> {
  const trimmed = ticker.trim().toUpperCase();
  if (!trimmed) return { kind: "idle" };

  const isDuplicate = existingPositions.some((p) => p.ticker.toUpperCase() === trimmed);
  if (isDuplicate) return { kind: "duplicate" };

  const result = await fetchSecurities([trimmed]);
  const info = result.get(trimmed);
  return info ? { kind: "found", shortName: info.shortName } : { kind: "not_found" };
}
