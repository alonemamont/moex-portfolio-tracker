import { Position, LiveData, CalculatedPosition, Pair } from "../types";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computeActualShare,
  computeCompliance,
  computeDividendYield,
  computeTargetShares,
  computeSharesToBuy,
  computeBuyAmountRub,
  computeCombinedIndexWeight,
  computePairedTargets,
  computePairMemberTargetShares,
  PairedTargets,
} from "./calculations";

export function buildCalculatedPositions(
  positions: Position[],
  liveByTicker: Map<string, LiveData>,
  resolveSector: (ticker: string) => string,
  pairs: Pair[] = []
): CalculatedPosition[] {
  const withLive = positions.map((position) => {
    const live = liveByTicker.get(position.ticker.toUpperCase());
    const fallbackLive: LiveData = {
      ticker: position.ticker,
      shortName: position.ticker,
      indexWeight: 0,
      price: null,
      lotSize: null,
      dividendPerShare: 0,
      status: "out_of_index",
    };
    const resolvedLive = live ?? fallbackLive;
    const positionValue = computePositionValue(resolvedLive.price, position.sharesOwned);
    return { position, live: resolvedLive, positionValue };
  });

  const portfolioValue = withLive.reduce((sum, { positionValue }) => sum + positionValue, 0);

  const pairByTicker = new Map<string, Pair>();
  for (const pair of pairs) {
    for (const ticker of pair.tickers) pairByTicker.set(ticker, pair);
  }

  const memberInputs = withLive.map(({ position, live }) => ({
    ticker: position.ticker,
    indexWeight: live.indexWeight,
    status: live.status,
    price: live.price,
    sharesOwned: position.sharesOwned,
  }));

  const pairedTargetsByPair = new Map<Pair, PairedTargets>();
  for (const pair of pairs) {
    pairedTargetsByPair.set(pair, computePairedTargets(pair, memberInputs, portfolioValue));
  }

  return withLive.map(({ position, live, positionValue }) => {
    const pair = pairByTicker.get(position.ticker);

    let coefficient: number;
    let targetAllocation: number | null;
    let actualShare: number | null;
    let compliance: number | null;
    let sharesToBuy: number | null;
    let buyAmountRub: number | null;

    if (pair) {
      const pairedTargets = pairedTargetsByPair.get(pair)!;
      coefficient = pair.coefficient;
      targetAllocation = pairedTargets.targetAllocation;
      actualShare = pairedTargets.actualShare;
      compliance = pairedTargets.compliance;

      const combinedIndexWeight = computeCombinedIndexWeight(
        memberInputs.filter((m) => pair.tickers.includes(m.ticker))
      );
      const targetShares = computePairMemberTargetShares(
        targetAllocation,
        combinedIndexWeight,
        live.indexWeight,
        portfolioValue,
        live.price
      );
      sharesToBuy = computeSharesToBuy(targetShares, position.sharesOwned);
      buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);
    } else {
      coefficient = position.coefficient;
      targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
      actualShare = computeActualShare(positionValue, portfolioValue);
      compliance = computeCompliance(actualShare, targetAllocation);
      const targetShares = computeTargetShares(targetAllocation, portfolioValue, live.price);
      sharesToBuy = computeSharesToBuy(targetShares, position.sharesOwned);
      buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price);
    }

    const income = computeIncome(live.dividendPerShare, position.sharesOwned);
    const dividendYield = computeDividendYield(live.dividendPerShare, live.price);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
      coefficient,
      sector: resolveSector(position.ticker),
      targetAllocation,
      actualShare,
      compliance,
      positionValue,
      income,
      dividendYield,
      sharesToBuy,
      buyAmountRub,
      manualSharesOwned: position.sharesOwned,
    };
  });
}
