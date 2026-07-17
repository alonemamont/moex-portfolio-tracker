import { CalculatedPosition } from "../types";

export interface SharesBreakdownRow {
  label: string;
  shares: number;
}

export function buildSharesBreakdownRows(
  position: Pick<CalculatedPosition, "manualSharesOwned" | "brokerHoldings">,
  labelByConnectionId: Map<string, string>
): SharesBreakdownRow[] {
  const brokerRows = (position.brokerHoldings ?? []).map((holding) => ({
    label: labelByConnectionId.get(holding.connectionId) ?? holding.connectionId,
    shares: holding.shares,
  }));
  return [...brokerRows, { label: "Вручную", shares: position.manualSharesOwned }];
}
