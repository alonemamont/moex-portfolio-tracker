import { DividendEvent, Position } from "../types";
import { isValidTransactionDate } from "./cashFlowValidation";
import { computeTotalSharesOwned } from "./calculations";

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function parseDividendHistoryRows(
  ticker: string,
  rows: Array<Record<string, string>>
): DividendEvent[] {
  const normalized = normalizeTicker(ticker);
  const seen = new Set<string>();
  const events: DividendEvent[] = [];

  for (const row of rows) {
    const dateRaw = (row.registryclosedate ?? "").trim();
    if (!isValidTransactionDate(dateRaw)) continue;

    const valuePerShare = Number(row.value);
    if (!Number.isFinite(valuePerShare) || valuePerShare <= 0) continue;

    const key = `${dateRaw}|${valuePerShare}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      ticker: normalized,
      registryCloseDate: dateRaw,
      valuePerShare,
    });
  }

  events.sort((a, b) => {
    if (a.registryCloseDate !== b.registryCloseDate) {
      return a.registryCloseDate < b.registryCloseDate ? -1 : 1;
    }
    return a.valuePerShare - b.valuePerShare;
  });

  return events;
}

export function ownedTickersWithShares(positions: Position[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const position of positions) {
    if (computeTotalSharesOwned(position) <= 0) continue;
    const ticker = normalizeTicker(position.ticker);
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}

export function mergeDividendSnapshot(input: {
  previous: DividendEvent[];
  ownedNow: string[];
  eventsByTicker: Map<string, DividendEvent[]>;
  succeededTickers: string[];
}): DividendEvent[] {
  const owned = new Set(input.ownedNow.map(normalizeTicker));
  const succeeded = new Set(input.succeededTickers.map(normalizeTicker));
  const previousByTicker = new Map<string, DividendEvent[]>();

  for (const event of input.previous) {
    const ticker = normalizeTicker(event.ticker);
    const list = previousByTicker.get(ticker) ?? [];
    list.push(event);
    previousByTicker.set(ticker, list);
  }

  const next: DividendEvent[] = [];
  for (const ticker of owned) {
    if (succeeded.has(ticker)) {
      next.push(...(input.eventsByTicker.get(ticker) ?? []));
    } else {
      next.push(...(previousByTicker.get(ticker) ?? []));
    }
  }

  next.sort((a, b) => {
    if (a.registryCloseDate !== b.registryCloseDate) {
      return a.registryCloseDate < b.registryCloseDate ? -1 : 1;
    }
    if (a.ticker !== b.ticker) return a.ticker < b.ticker ? -1 : 1;
    return a.valuePerShare - b.valuePerShare;
  });

  return next;
}

export interface UpcomingDividendRow {
  ticker: string;
  registryCloseDate: string;
  valuePerShare: number;
  sharesOwned: number;
  expectedIncome: number;
  eventYieldPct: number | null;
}

export function buildUpcomingDividendRows(input: {
  events: DividendEvent[];
  positions: { ticker: string; sharesOwned: number; price: number | null }[];
  today: string;
}): UpcomingDividendRow[] {
  const byTicker = new Map(
    input.positions.map((p) => [
      normalizeTicker(p.ticker),
      { sharesOwned: p.sharesOwned, price: p.price },
    ])
  );

  const rows: UpcomingDividendRow[] = [];
  for (const event of input.events) {
    if (event.registryCloseDate < input.today) continue;
    const pos = byTicker.get(normalizeTicker(event.ticker));
    if (!pos || pos.sharesOwned <= 0) continue;

    const eventYieldPct =
      pos.price !== null && Number.isFinite(pos.price) && pos.price > 0
        ? (event.valuePerShare / pos.price) * 100
        : null;

    rows.push({
      ticker: normalizeTicker(event.ticker),
      registryCloseDate: event.registryCloseDate,
      valuePerShare: event.valuePerShare,
      sharesOwned: pos.sharesOwned,
      expectedIncome: event.valuePerShare * pos.sharesOwned,
      eventYieldPct,
    });
  }

  rows.sort((a, b) => {
    if (a.registryCloseDate !== b.registryCloseDate) {
      return a.registryCloseDate < b.registryCloseDate ? -1 : 1;
    }
    return a.ticker < b.ticker ? -1 : 1;
  });

  return rows;
}

export function sumExpectedIncome(rows: UpcomingDividendRow[]): number {
  return rows.reduce((sum, row) => sum + row.expectedIncome, 0);
}

export type DividendEmptyReason = "no_positions" | "never_fetched" | "no_upcoming";

export function resolveDividendEmptyReason(input: {
  hasOwnedShares: boolean;
  dividendsFetchedAt: string | null;
  upcomingCount: number;
}): DividendEmptyReason | null {
  if (!input.hasOwnedShares) return "no_positions";
  if (input.dividendsFetchedAt === null) return "never_fetched";
  if (input.upcomingCount === 0) return "no_upcoming";
  return null;
}

export function localTodayISO(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

