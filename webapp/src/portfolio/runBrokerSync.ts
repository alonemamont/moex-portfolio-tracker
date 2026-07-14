import { PortfolioFile, BrokerConnection } from "../types";
import { getBrokerAdapter } from "../brokers/registry";
import { buildSyncDiff, SyncDiffRow } from "../brokers/syncDiff";
import { fetchSecurities } from "../iss/client";

export async function fetchBrokerSyncPreview(
  file: PortfolioFile,
  connection: BrokerConnection,
  token: string
): Promise<SyncDiffRow[]> {
  const adapter = getBrokerAdapter(connection.brokerId);
  if (!adapter) {
    throw new Error(`Неизвестный брокер: ${connection.brokerId}`);
  }

  const holdings = await adapter.fetchHoldings(token, connection.accountId);

  const existingTickers = new Set(file.positions.map((p) => p.ticker.toUpperCase()));
  const candidateTickers = holdings
    .map((h) => h.ticker.toUpperCase())
    .filter((ticker) => !existingTickers.has(ticker));
  const securities = await fetchSecurities(candidateTickers);
  const isTradeable = (ticker: string) => securities.has(ticker.toUpperCase());

  return buildSyncDiff(connection.id, holdings, file.positions, isTradeable);
}
