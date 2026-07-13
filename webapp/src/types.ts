export type IndexStatus = "in_index" | "out_of_index";

export const STATUS_LABELS: Record<IndexStatus, string> = {
  in_index: "в индексе",
  out_of_index: "вне индекса",
};

/** Ручные поля пользователя — никогда не перезаписываются обновлением рынка. */
export interface Position {
  ticker: string;
  coefficient: number;
  sharesOwned: number;
}

/** Live-данные с ISS, пересчитываются заново при каждой загрузке/обновлении. */
export interface LiveData {
  ticker: string;
  shortName: string;
  indexWeight: number;
  price: number | null;
  lotSize: number | null;
  dividendPerShare: number;
  status: IndexStatus;
}

/** Позиция со всеми вычисленными полями — то, что рендерит таблица портфеля. */
export interface CalculatedPosition extends Position, LiveData {
  sector: string;
  targetAllocation: number | null;
  actualShare: number | null;
  compliance: number | null;
  positionValue: number;
  income: number;
  dividendYield: number | null;
  sharesToBuy: number | null;
  buyAmountRub: number | null;
}

export interface HistorySnapshotRow {
  ticker: string;
  price: number | null;
  weight: number;
  status: IndexStatus;
}

export interface HistorySnapshot {
  timestamp: string;
  portfolioValue: number;
  avgCompliance: number | null;
  snapshot: HistorySnapshotRow[];
}

export interface Pair {
  tickers: string[];
  coefficient: number;
}

export interface PortfolioFile {
  version: 1;
  positions: Position[];
  sectors: Record<string, string>;
  history: HistorySnapshot[];
  pairs: Pair[];
}
