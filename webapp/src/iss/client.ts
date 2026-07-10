import { parseIssDataBlock } from "./xml";

const ISS_BASE = "https://iss.moex.com/iss";

export interface IndexCompositionEntry {
  ticker: string;
  shortName: string;
  weight: number;
}

export async function fetchIndexComposition(): Promise<IndexCompositionEntry[]> {
  const url = `${ISS_BASE}/statistics/engines/stock/markets/index/analytics/IMOEX.xml?limit=100`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ISS composition request failed: ${response.status}`);
  }
  const text = await response.text();
  const rows = parseIssDataBlock(text, "analytics");
  return rows.map((row) => ({
    ticker: row.ticker,
    shortName: row.shortnames,
    weight: Number(row.weight),
  }));
}
