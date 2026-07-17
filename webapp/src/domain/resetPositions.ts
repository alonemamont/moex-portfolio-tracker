import { BrokerConnection, CalculatedPosition, Position } from "../types";
import { isOrphanedHolding } from "./sharesBreakdown";

export type ResetSource =
  | { type: "manual" }
  | { type: "broker"; connectionId: string }
  | { type: "orphaned" };

export function resetSourceFromKey(key: string): ResetSource {
  if (key === "manual") return { type: "manual" };
  if (key === "orphaned") return { type: "orphaned" };
  return { type: "broker", connectionId: key };
}

export interface AffectedPositions {
  affectedManual: CalculatedPosition[];
  affectedByConnection: Map<string, CalculatedPosition[]>;
  affectedOrphaned: CalculatedPosition[];
}

export function groupAffectedPositions(
  positions: CalculatedPosition[],
  brokerConnections: BrokerConnection[],
  activeConnectionIds: ReadonlySet<string>
): AffectedPositions {
  const affectedManual = positions.filter((p) => p.manualSharesOwned !== 0);

  const affectedByConnection = new Map(
    brokerConnections.map((c) => [
      c.id,
      positions.filter((p) =>
        (p.brokerHoldings ?? []).some((h) => h.connectionId === c.id && h.shares !== 0)
      ),
    ])
  );

  const affectedOrphaned = positions.filter((p) =>
    (p.brokerHoldings ?? []).some(
      (h) => isOrphanedHolding(h.connectionId, activeConnectionIds) && h.shares !== 0
    )
  );

  return { affectedManual, affectedByConnection, affectedOrphaned };
}

export interface ResetConfirmPosition {
  ticker: string;
  shortName: string;
  currentValue: number;
}

export function buildResetConfirmation(
  source: ResetSource,
  affected: AffectedPositions,
  activeConnectionIds: ReadonlySet<string>,
  brokerConnectionsById: Map<string, string>
): { title: string; positions: ResetConfirmPosition[] } {
  switch (source.type) {
    case "manual":
      return {
        title: "Обнулить вручную введённое количество",
        positions: affected.affectedManual.map((p) => ({
          ticker: p.ticker,
          shortName: p.shortName,
          currentValue: p.manualSharesOwned,
        })),
      };
    case "orphaned":
      return {
        title: "Обнулить holdings удалённых брокеров",
        positions: affected.affectedOrphaned.map((p) => ({
          ticker: p.ticker,
          shortName: p.shortName,
          currentValue: (p.brokerHoldings ?? [])
            .filter((h) => isOrphanedHolding(h.connectionId, activeConnectionIds))
            .reduce((sum, h) => sum + h.shares, 0),
        })),
      };
    case "broker":
      return {
        title: `Обнулить холдинги брокера «${brokerConnectionsById.get(source.connectionId) ?? ""}»`,
        positions: (affected.affectedByConnection.get(source.connectionId) ?? []).map((p) => ({
          ticker: p.ticker,
          shortName: p.shortName,
          currentValue:
            (p.brokerHoldings ?? []).find((h) => h.connectionId === source.connectionId)?.shares ?? 0,
        })),
      };
  }
}

export function applyPositionsReset(
  positions: Position[],
  source: ResetSource,
  affected: AffectedPositions,
  activeConnectionIds: ReadonlySet<string>
): Position[] {
  if (source.type === "manual") {
    const tickers = new Set(affected.affectedManual.map((p) => p.ticker));
    return positions.map((p) => (tickers.has(p.ticker) ? { ...p, sharesOwned: 0 } : p));
  }

  if (source.type === "orphaned") {
    const tickers = new Set(affected.affectedOrphaned.map((p) => p.ticker));
    return positions.map((p) =>
      tickers.has(p.ticker)
        ? {
            ...p,
            brokerHoldings: (p.brokerHoldings ?? []).filter(
              (h) => !isOrphanedHolding(h.connectionId, activeConnectionIds)
            ),
          }
        : p
    );
  }

  const affectedList = affected.affectedByConnection.get(source.connectionId) ?? [];
  const tickers = new Set(affectedList.map((p) => p.ticker));
  return positions.map((p) =>
    tickers.has(p.ticker)
      ? { ...p, brokerHoldings: (p.brokerHoldings ?? []).filter((h) => h.connectionId !== source.connectionId) }
      : p
  );
}
