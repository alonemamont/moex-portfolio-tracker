import { PortfolioFile, LiveData, Position, CalculatedPosition } from "../types";
import { fetchMarketData } from "../iss/marketData";
import { mergeMarketData } from "../domain/merge";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { createHistorySnapshot } from "../domain/createHistorySnapshot";
import { DEFAULT_INDEX_ID } from "../domain/indices";

interface MarketSnapshot {
  positions: Position[];
  liveByTicker: Map<string, LiveData>;
  calculated: CalculatedPosition[];
  portfolioValue: number;
}

export function mergeCompletedMarketUpdate(
  latestFile: PortfolioFile,
  completedMarketUpdate: PortfolioFile
): PortfolioFile {
  return {
    ...completedMarketUpdate,
    brokerConnections: latestFile.brokerConnections,
    brokerAccounts: latestFile.brokerAccounts,
    transactions: latestFile.transactions,
  };
}

async function computeMarketSnapshot(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData>,
  indexId: string
): Promise<MarketSnapshot> {
  const existingTickers = currentFile.positions.map((p) => p.ticker);
  const marketData = await fetchMarketData(existingTickers, indexId);

  const { positions, liveByTicker } = mergeMarketData(
    currentFile.positions,
    marketData.composition,
    marketData.securities,
    marketData.dividends,
    previousLiveByTicker
  );

  const resolveSector = createSectorResolver(SECTORS_DEFAULT, currentFile.sectors);
  const calculated = buildCalculatedPositions(positions, liveByTicker, resolveSector, currentFile.pairs);
  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);

  return { positions, liveByTicker, calculated, portfolioValue };
}

export async function runMarketUpdate(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData> = new Map(),
  indexId: string = DEFAULT_INDEX_ID
): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }> {
  const { positions, liveByTicker, calculated, portfolioValue } = await computeMarketSnapshot(
    currentFile,
    previousLiveByTicker,
    indexId
  );
  const snapshot = createHistorySnapshot(calculated, portfolioValue);

  return {
    file: {
      ...currentFile,
      positions,
      history: [...currentFile.history, snapshot],
    },
    liveByTicker,
  };
}

export async function switchIndex(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData>,
  indexId: string
): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }> {
  const { positions, liveByTicker } = await computeMarketSnapshot(
    currentFile,
    previousLiveByTicker,
    indexId
  );

  return {
    file: { ...currentFile, positions },
    liveByTicker,
  };
}
