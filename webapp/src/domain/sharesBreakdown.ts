import { BrokerHolding, CalculatedPosition, Position } from "../types";

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

export function isOrphanedHolding(connectionId: string, activeConnectionIds: ReadonlySet<string>): boolean {
  return !activeConnectionIds.has(connectionId);
}

export function removeHoldingsForConnection<T extends Pick<Position, "brokerHoldings">>(
  positions: T[],
  connectionId: string
): T[] {
  return positions.map((position) => ({
    ...position,
    brokerHoldings: (position.brokerHoldings ?? []).filter(
      (holding: BrokerHolding) => holding.connectionId !== connectionId
    ),
  }));
}
