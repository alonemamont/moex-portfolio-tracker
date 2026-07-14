import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PositionsCardList } from "./PositionsCardList";
import { CalculatedPosition } from "../types";

function makePosition(overrides: Partial<CalculatedPosition> & { ticker: string }): CalculatedPosition {
  return {
    coefficient: 1,
    sharesOwned: 0,
    manualSharesOwned: 0,
    shortName: overrides.ticker,
    indexWeight: 0,
    price: null,
    lotSize: null,
    dividendPerShare: 0,
    status: "in_index",
    sector: "—",
    targetAllocation: null,
    actualShare: null,
    compliance: null,
    positionValue: 0,
    income: 0,
    dividendYield: null,
    sharesToBuy: null,
    buyAmountRub: null,
    ...overrides,
  };
}

describe("PositionsCardList", () => {
  it("renders one PositionCard per position", () => {
    const positions = [makePosition({ ticker: "GAZP" }), makePosition({ ticker: "SBER" })];
    render(
      <PositionsCardList
        positions={positions}
        brokerConnectionsById={new Map()}
        onChangeCoefficient={vi.fn()}
        onChangeSharesOwned={vi.fn()}
      />
    );

    // Each fixture leaves shortName defaulted to the ticker, so PositionCard's
    // ticker span and name span both render the same text (2 matches per position).
    expect(screen.getAllByText("GAZP")).toHaveLength(2);
    expect(screen.getAllByText("SBER")).toHaveLength(2);
  });
});
