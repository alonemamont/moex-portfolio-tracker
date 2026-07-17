import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResetManualSharesModal } from "./ResetManualSharesModal";

const positions = [
  { ticker: "GAZP", shortName: "Газпром", manualSharesOwned: 5 },
  { ticker: "SBER", shortName: "Сбербанк", manualSharesOwned: 3 },
];

describe("ResetManualSharesModal", () => {
  it("shows the count of affected positions and keeps details collapsed by default", () => {
    render(<ResetManualSharesModal positions={positions} onConfirm={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("Будет обнулено позиций: 2")).toBeInTheDocument();
    expect(screen.queryByText("GAZP")).not.toBeInTheDocument();
  });

  it("reveals the affected positions table on Детали, and hides it again on a second click", () => {
    render(<ResetManualSharesModal positions={positions} onConfirm={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Детали" }));
    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("5 → 0")).toBeInTheDocument();
    expect(screen.getByText("SBER")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Скрыть детали" }));
    expect(screen.queryByText("GAZP")).not.toBeInTheDocument();
  });

  it("calls onConfirm when Обнулить is clicked", () => {
    const onConfirm = vi.fn();
    render(<ResetManualSharesModal positions={positions} onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onClose and not onConfirm when Отмена is clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ResetManualSharesModal positions={positions} onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
