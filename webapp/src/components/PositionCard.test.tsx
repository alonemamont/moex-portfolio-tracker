import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PositionCard } from "./PositionCard";
import { CalculatedPosition } from "../types";

const position: CalculatedPosition = {
  ticker: "GAZP",
  coefficient: 1.5,
  sharesOwned: 10,
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
      <PositionCard position={position} onChangeCoefficient={vi.fn()} onChangeSharesOwned={vi.fn()} />
    );

    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("Газпром")).toBeInTheDocument();
    expect(screen.getByText("150.50")).toBeInTheDocument();
    expect(screen.getByText("1.09")).toBeInTheDocument();
    expect(screen.queryByText("Сектор")).not.toBeInTheDocument();
  });

  it("reveals the expanded fields on tap, and hides them again on a second tap", () => {
    render(
      <PositionCard position={position} onChangeCoefficient={vi.fn()} onChangeSharesOwned={vi.fn()} />
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

  it("calls onChangeCoefficient and onChangeSharesOwned from the expanded inputs", () => {
    const onChangeCoefficient = vi.fn();
    const onChangeSharesOwned = vi.fn();
    render(
      <PositionCard
        position={position}
        onChangeCoefficient={onChangeCoefficient}
        onChangeSharesOwned={onChangeSharesOwned}
      />
    );

    fireEvent.click(screen.getByRole("button"));
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: "2" } });
    expect(onChangeCoefficient).toHaveBeenCalledWith("GAZP", 2);

    fireEvent.change(inputs[1], { target: { value: "12" } });
    expect(onChangeSharesOwned).toHaveBeenCalledWith("GAZP", 12);
  });
});
