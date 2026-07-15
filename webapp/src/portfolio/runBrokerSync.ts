import { PortfolioFile, BrokerConnection } from "../types";
import { getBrokerAdapter } from "../brokers/registry";
import { buildSyncDiff, SyncDiffRow } from "../brokers/syncDiff";
import { fetchSecurities } from "../iss/client";
import { logBrokerSyncError, logBrokerSyncInfo } from "../brokers/diagnostics";

export async function fetchBrokerSyncPreview(
  file: PortfolioFile,
  connection: BrokerConnection,
  token: string
): Promise<SyncDiffRow[]> {
  const adapter = getBrokerAdapter(connection.brokerId);
  if (!adapter) {
    throw new Error(`Неизвестный брокер: ${connection.brokerId}`);
  }

  logBrokerSyncInfo("sync.preview.start", {
    connectionId: connection.id,
    brokerId: connection.brokerId,
    accountId: connection.accountId,
    existingPositions: file.positions.length,
  });

  const holdings = await adapter.fetchHoldings(token, connection.accountId);
  logBrokerSyncInfo("sync.preview.holdingsLoaded", {
    connectionId: connection.id,
    holdings: holdings.length,
  });

  const existingTickers = new Set(file.positions.map((p) => p.ticker.toUpperCase()));
  const candidateTickers = holdings
    .map((h) => h.ticker.toUpperCase())
    .filter((ticker) => !existingTickers.has(ticker));

  logBrokerSyncInfo("sync.preview.issLookup.start", {
    connectionId: connection.id,
    candidateTickers,
  });

  let securities;
  try {
    securities = await fetchSecurities(candidateTickers);
  } catch (error) {
    logBrokerSyncError("sync.preview.issLookup.failed", error, {
      connectionId: connection.id,
      candidateTickers,
    });
    throw new Error(`Не удалось проверить тикеры через MOEX ISS: ${(error as Error).message}`);
  }

  logBrokerSyncInfo("sync.preview.issLookup.loaded", {
    connectionId: connection.id,
    resolvedTickers: Array.from(securities.keys()),
  });

  const isTradeable = (ticker: string) => securities.has(ticker.toUpperCase());
  const rows = buildSyncDiff(connection.id, holdings, file.positions, isTradeable);

  logBrokerSyncInfo("sync.preview.diffBuilt", {
    connectionId: connection.id,
    rows: rows.length,
  });

  return rows;
}
