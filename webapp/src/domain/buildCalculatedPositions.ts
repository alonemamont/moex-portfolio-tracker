import { Position, LiveData, CalculatedPosition } from "../types";
import {
  computeTargetAllocation,
  computePositionValue,
  computeIncome,
  computeActualShare,
  computeCompliance,
  computeDividendYield,
} from "./calculations";

export function buildCalculatedPositions(
  positions: Position[],
  liveByTicker: Map<string, LiveData>,
  resolveSector: (ticker: string) => string
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

  return withLive.map(({ position, live, positionValue }) => {
    const targetAllocation = computeTargetAllocation(live.indexWeight, position.coefficient, live.status);
    const actualShare = computeActualShare(positionValue, portfolioValue);
    const compliance = computeCompliance(actualShare, targetAllocation);
    const income = computeIncome(live.dividendPerShare, position.sharesOwned);
    const dividendYield = computeDividendYield(live.dividendPerShare, live.price);

    return {
      ...position,
      ...live,
      ticker: position.ticker,
      sector: resolveSector(position.ticker),
      targetAllocation,
      actualShare,
      compliance,
      positionValue,
      income,
      dividendYield,
    };
  });
}
