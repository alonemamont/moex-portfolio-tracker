import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResetPositionsModal } from "./ResetPositionsModal";

const positions = [
  { ticker: "GAZP", shortName: "Газпром", currentValue: 5 },
  { ticker: "SBER", shortName: "Сбербанк", currentValue: 3 },
];

describe("ResetPositionsModal", () => {
  it("renders the given title and the count of affected positions, details collapsed by default", () => {
    render(
      <ResetPositionsModal
        title="Обнулить вручную введённое количество"
        positions={positions}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Обнулить вручную введённое количество")).toBeInTheDocument();
    expect(screen.getByText("Будет обнулено позиций: 2")).toBeInTheDocument();
    expect(screen.queryByText("GAZP")).not.toBeInTheDocument();
  });

  it("reveals the affected positions table on Детали, and hides it again on a second click", () => {
    render(
      <ResetPositionsModal
        title="Обнулить холдинги брокера «Т-Банк»"
        positions={positions}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Детали" }));
    expect(screen.getByText("GAZP")).toBeInTheDocument();
    expect(screen.getByText("5 → 0")).toBeInTheDocument();
    expect(screen.getByText("SBER")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Скрыть детали" }));
    expect(screen.queryByText("GAZP")).not.toBeInTheDocument();
  });

  it("calls onConfirm when Обнулить is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ResetPositionsModal
        title="t"
        positions={positions}
        onConfirm={onConfirm}
        onBack={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Обнулить" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onBack, not onConfirm or onClose, when Назад is clicked", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <ResetPositionsModal
        title="t"
        positions={positions}
        onConfirm={onConfirm}
        onBack={onBack}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose and not onConfirm or onBack when Отмена is clicked", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <ResetPositionsModal
        title="t"
        positions={positions}
        onConfirm={onConfirm}
        onBack={onBack}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});
