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

export interface SecurityInfo {
  shortName: string;
  price: number | null;
  lotSize: number | null;
}

export async function fetchSecurities(tickers: string[]): Promise<Map<string, SecurityInfo>> {
  if (tickers.length === 0) return new Map();

  const url = `${ISS_BASE}/engines/stock/markets/shares/boards/TQBR/securities.xml?securities=${tickers.join(
    ","
  )}&limit=100`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ISS securities request failed: ${response.status}`);
  }
  const text = await response.text();

  const securitiesRows = parseIssDataBlock(text, "securities");
  const marketdataRows = parseIssDataBlock(text, "marketdata");

  const result = new Map<string, SecurityInfo>();
  const prevPriceBySecid = new Map<string, number>();

  for (const row of securitiesRows) {
    const price = row.PREVPRICE ? Number(row.PREVPRICE) : null;
    result.set(row.SECID, {
      shortName: row.SHORTNAME,
      price,
      lotSize: row.LOTSIZE ? Number(row.LOTSIZE) : null,
    });
    if (price !== null) prevPriceBySecid.set(row.SECID, price);
  }

  for (const row of marketdataRows) {
    const existing = result.get(row.SECID);
    if (!existing) continue;
    const last = row.LAST && row.LAST !== "" ? Number(row.LAST) : null;
    existing.price = last ?? prevPriceBySecid.get(row.SECID) ?? null;
  }

  return result;
}
