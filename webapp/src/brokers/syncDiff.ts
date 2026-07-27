import { Position, PortfolioFile, BrokerHolding } from "../types";

export interface BrokerHoldingInput {
  ticker: string;
  shares: number;
}

export type SyncDiffRowStatus = "existing" | "new" | "unresolved";

export interface SyncDiffRow {
  ticker: string;
  status: SyncDiffRowStatus;
  previousShares: number;
  newShares: number;
}

function findConnectionShares(position: Position, connectionId: string): number {
  const holding = (position.brokerHoldings ?? []).find((h) => h.connectionId === connectionId);
  return holding ? holding.shares : 0;
}

export function buildSyncDiff(
  connectionId: string,
  brokerHoldings: BrokerHoldingInput[],
  existingPositions: Position[],
  isTradeable: (ticker: string) => boolean
): SyncDiffRow[] {
  const holdingsByTicker = new Map(brokerHoldings.map((h) => [h.ticker.toUpperCase(), h.shares]));
  const positionsByTicker = new Map(existingPositions.map((p) => [p.ticker.toUpperCase(), p]));

  const previouslySyncedTickers = existingPositions
    .filter((p) => (p.brokerHoldings ?? []).some((h) => h.connectionId === connectionId))
    .map((p) => p.ticker.toUpperCase());

  const allTickers = new Set<string>([...holdingsByTicker.keys(), ...previouslySyncedTickers]);

  const rows: SyncDiffRow[] = [];
  for (const ticker of allTickers) {
    const existingPosition = positionsByTicker.get(ticker);
    const previousShares = existingPosition ? findConnectionShares(existingPosition, connectionId) : 0;
    const newSharesRaw = holdingsByTicker.get(ticker) ?? 0;

    if (existingPosition) {
      rows.push({ ticker, status: "existing", previousShares, newShares: newSharesRaw });
    } else if (isTradeable(ticker)) {
      rows.push({ ticker, status: "new", previousShares: 0, newShares: newSharesRaw });
    } else {
      rows.push({ ticker, status: "unresolved", previousShares: 0, newShares: 0 });
    }
  }

  return rows;
}

export function applySyncDiff(
  file: PortfolioFile,
  connectionId: string,
  rows: SyncDiffRow[],
  syncedAt: string
): PortfolioFile {
  const rowsByTicker = new Map(rows.map((r) => [r.ticker, r]));

  const updatedPositions: Position[] = file.positions.map((position) => {
    const row = rowsByTicker.get(position.ticker.toUpperCase());
    if (!row || row.status === "unresolved") return position;

    const otherHoldings = (position.brokerHoldings ?? []).filter((h) => h.connectionId !== connectionId);
    const newHoldings: BrokerHolding[] =
      row.newShares > 0
        ? [...otherHoldings, { connectionId, shares: row.newShares, syncedAt }]
        : otherHoldings;

    return { ...position, brokerHoldings: newHoldings };
  });

  const existingTickers = new Set(file.positions.map((p) => p.ticker.toUpperCase()));
  const newPositions: Position[] = rows
    .filter((r) => r.status === "new" && r.newShares > 0 && !existingTickers.has(r.ticker))
    .map((r) => ({
      ticker: r.ticker,
      coefficient: 1,
      sharesOwned: 0,
      brokerHoldings: [{ connectionId, shares: r.newShares, syncedAt }],
    }));

  return {
    ...file,
    positions: [...updatedPositions, ...newPositions],
  };
}
