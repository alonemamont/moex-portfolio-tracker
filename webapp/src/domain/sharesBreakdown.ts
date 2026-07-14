import { CalculatedPosition } from "../types";

export function buildSharesBreakdownTooltip(
  position: Pick<CalculatedPosition, "manualSharesOwned" | "brokerHoldings" | "sharesOwned">,
  labelByConnectionId: Map<string, string>
): string {
  const brokerParts = (position.brokerHoldings ?? []).map(
    (holding) => `${labelByConnectionId.get(holding.connectionId) ?? holding.connectionId}: ${holding.shares}`
  );
  const manualPart = `Вручную: ${position.manualSharesOwned}`;
  return [...brokerParts, manualPart].join(", ") + ` = ${position.sharesOwned}`;
}
