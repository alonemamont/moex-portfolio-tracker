import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RebalancePanel, RebalanceTab } from "./RebalanceTab";
import { RebalancePlan } from "../domain/rebalancePlan";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useCalculatedPositions } from "../portfolio/useCalculatedPositions";

vi.mock("../portfolio/usePortfolio", () => ({ usePortfolio: vi.fn() }));
vi.mock("../portfolio/useCalculatedPositions", () => ({ useCalculatedPositions: vi.fn() }));

const emptyPlan = (over: Partial<RebalancePlan> = {}): RebalancePlan => ({
  mode: "budget",
  budgetRub: 0,
  lines: [],
  spentTotal: 0,
  leftoverRub: 0,
  avgComplianceBefore: null,
  avgComplianceAfter: null,
  tradeCount: 0,
  emptyReason: "no_budget",
  shortfallRubAfterByUnitId: {},
  ...over,
});

describe("RebalancePanel", () => {
  it("shows index badge and no-budget empty copy", () => {
    render(
      <RebalancePanel
        selectedIndex="IMOEX"
        mode="budget"
        budgetInput=""
        thresholdInput="0.01"
        plan={emptyPlan()}
        onModeChange={vi.fn()}
        onBudgetChange={vi.fn()}
        onThresholdChange={vi.fn()}
        onCopyTsv={vi.fn()}
        onDownloadCsv={vi.fn()}
      />
    );
    expect(screen.getByText(/Индекс:\s*IMOEX/)).toBeInTheDocument();
    expect(screen.getByText("Укажите сумму бюджета")).toBeInTheDocument();
    expect(screen.getByText(/портфель не меняется/i)).toBeInTheDocument();
  });

  it("calls onModeChange when selecting free cash", () => {
    const onModeChange = vi.fn();
    render(
      <RebalancePanel
        selectedIndex="MOEXBC"
        mode="budget"
        budgetInput="1000"
        thresholdInput="0.01"
        plan={emptyPlan({ emptyReason: "no_shortfall", budgetRub: 1000 })}
        onModeChange={onModeChange}
        onBudgetChange={vi.fn()}
        onThresholdChange={vi.fn()}
        onCopyTsv={vi.fn()}
        onDownloadCsv={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Свободный кэш" }));
    expect(onModeChange).toHaveBeenCalledWith("free_cash");
  });

  it("disables export actions when there are no lines", () => {
    render(
      <RebalancePanel
        selectedIndex="IMOEX"
        mode="budget"
        budgetInput="1000"
        thresholdInput="0.01"
        plan={emptyPlan({ emptyReason: "no_shortfall", budgetRub: 1000 })}
        onModeChange={vi.fn()}
        onBudgetChange={vi.fn()}
        onThresholdChange={vi.fn()}
        onCopyTsv={vi.fn()}
        onDownloadCsv={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Копировать TSV" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Скачать CSV" })).toBeDisabled();
  });
});

describe("RebalanceTab", () => {
  beforeEach(() => {
    vi.mocked(usePortfolio).mockReturnValue({
      file: { pairs: [] },
      selectedIndex: "IMOEX",
    } as unknown as ReturnType<typeof usePortfolio>);
    vi.mocked(useCalculatedPositions).mockReturnValue({
      calculated: [
        {
          ticker: "TST",
          coefficient: 1,
          sharesOwned: 0,
          shortName: "Test",
          indexWeight: 100,
          price: 100,
          lotSize: 1,
          dividendPerShare: 0,
          status: "in_index",
          sector: "",
          targetAllocation: 100,
          actualShare: 0,
          compliance: 0,
          positionValue: 0,
          income: 0,
          dividendYield: null,
          sharesToBuy: null,
          buyAmountRub: null,
          manualSharesOwned: 0,
        },
      ],
      portfolioValue: 100_000,
      avgCompliance: 0,
      largestSurplus: null,
      largestShortfall: null,
    });
  });

  it("keeps zero threshold and shows an affordable min-trades purchase", () => {
    render(<RebalanceTab />);

    fireEvent.click(screen.getByRole("button", { name: "Мин. сделок" }));
    fireEvent.change(screen.getByLabelText("Сумма, ₽"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Порог прироста"), { target: { value: "0" } });

    expect(screen.getAllByText("TST")).toHaveLength(2);
  });
});
