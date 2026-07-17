import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PositionCard } from "./PositionCard";
import { CalculatedPosition } from "../types";

const position: CalculatedPosition = {
  ticker: "GAZP",
  coefficient: 1.5,
  sharesOwned: 10,
  manualSharesOwned: 10,
  shortName: "Газпром",
  indexWeight: 12.3456,
  price: 150.5,
  lotSize: 10,
  dividendPerShare: 5.2,
  status: "in_index",
  sector: "Энергетика",
  targetAllocation: 18.5,
  actualShare: 20.1,
  compliance: 1.09,
  positionValue: 1505,
  income: 52,
  dividendYield: 3.45,
  sharesToBuy: 5,
  buyAmountRub: 752.5,
};

describe("PositionCard", () => {
  it("shows ticker, short name, price and compliance while collapsed, and hides expanded fields", () => {
    render(
      <PositionCard
        position={position}
        brokerConnectionsById={new Map()}
        onChangeCoefficient={vi.fn()}
        onChangeSharesOwned={vi.fn()}
      />
    );

    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("Газпром")).toBeInTheDocument();
    expect(screen.getByText("150.50")).toBeInTheDocument();
    expect(screen.getByText("1.09")).toBeInTheDocument();
    expect(screen.queryByText("Сектор")).not.toBeInTheDocument();
  });

  it("reveals the expanded fields on tap, and hides them again on a second tap", () => {
    render(
      <PositionCard
        position={position}
        brokerConnectionsById={new Map()}
        onChangeCoefficient={vi.fn()}
        onChangeSharesOwned={vi.fn()}
      />
    );

    const summary = screen.getByRole("button");
    fireEvent.click(summary);
    expect(screen.getByText("Сектор")).toBeInTheDocument();
    expect(screen.getByText("Энергетика")).toBeInTheDocument();
    expect(screen.getByText("Стоимость")).toBeInTheDocument();
    expect(screen.getByText("1505.00")).toBeInTheDocument();

    fireEvent.click(summary);
    expect(screen.queryByText("Сектор")).not.toBeInTheDocument();
  });

  it("calls onChangeCoefficient from the coefficient input, and onChangeSharesOwned after clicking into the shares cell", () => {
    const onChangeCoefficient = vi.fn();
    const onChangeSharesOwned = vi.fn();
    render(
      <PositionCard
        position={position}
        brokerConnectionsById={new Map()}
        onChangeCoefficient={onChangeCoefficient}
        onChangeSharesOwned={onChangeSharesOwned}
      />
    );

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    expect(onChangeCoefficient).toHaveBeenCalledWith("GAZP", 2);

    fireEvent.click(screen.getByRole("button", { name: "10" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Куплено вручную" }), {
      target: { value: "12" },
    });
    expect(onChangeSharesOwned).toHaveBeenCalledWith("GAZP", 12);
  });

  it("shows a shares breakdown popover trigger when broker holdings exist, and opens it on click", () => {
    const positionWithHoldings: CalculatedPosition = {
      ...position,
      manualSharesOwned: 2,
      sharesOwned: 12,
      brokerHoldings: [{ connectionId: "conn-1", shares: 10, syncedAt: "2026-01-01" }],
    };
    render(
      <PositionCard
        position={positionWithHoldings}
        brokerConnectionsById={new Map([["conn-1", "Т-Банк"]])}
        onChangeCoefficient={vi.fn()}
        onChangeSharesOwned={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByRole("button")[0]);
    const trigger = screen.getByRole("button", { name: "Σ12" });
    fireEvent.click(trigger);

    expect(screen.getByText("Т-Банк")).toBeInTheDocument();
    expect(screen.getByText("Вручную")).toBeInTheDocument();
  });
});
