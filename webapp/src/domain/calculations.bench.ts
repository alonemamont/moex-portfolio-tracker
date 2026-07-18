import { bench, describe } from "vitest";
import { buildCalculatedPositions } from "./buildCalculatedPositions";
import { Position, LiveData } from "../types";

const POSITION_COUNT = 1500;

function makePositions(count: number): Position[] {
  return Array.from({ length: count }, (_, i) => ({
    ticker: `TICK${i}`,
    coefficient: 1,
    sharesOwned: 10 + (i % 50),
  }));
}

function makeLiveByTicker(positions: Position[]): Map<string, LiveData> {
  const map = new Map<string, LiveData>();
  positions.forEach((p, i) => {
    map.set(p.ticker.toUpperCase(), {
      ticker: p.ticker,
      shortName: `${p.ticker} Name`,
      indexWeight: (i % 20) / 100,
      price: 100 + (i % 500),
      lotSize: 1,
      dividendPerShare: i % 10,
      status: i % 7 === 0 ? "out_of_index" : "in_index",
    });
  });
  return map;
}

const positions = makePositions(POSITION_COUNT);
const liveByTicker = makeLiveByTicker(positions);
const resolveSector = (ticker: string) => `Sector-${ticker.length % 5}`;

describe("buildCalculatedPositions perf", () => {
  bench(`computes ${POSITION_COUNT} positions without pairs`, () => {
    buildCalculatedPositions(positions, liveByTicker, resolveSector, []);
  });

  bench(`computes ${POSITION_COUNT} positions with 100 paired tickers`, () => {
    const pairs = Array.from({ length: 50 }, (_, i) => ({
      tickers: [`TICK${i * 2}`, `TICK${i * 2 + 1}`],
      coefficients: { [`TICK${i * 2}`]: 1, [`TICK${i * 2 + 1}`]: 1 },
    }));
    buildCalculatedPositions(positions, liveByTicker, resolveSector, pairs);
  });
});
