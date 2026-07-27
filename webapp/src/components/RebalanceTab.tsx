import { useMemo, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useCalculatedPositions } from "../portfolio/useCalculatedPositions";
import {
  buildRebalancePlan,
  planToCsv,
  planToTsv,
  RebalanceEmptyReason,
  RebalanceMode,
  RebalancePlan,
  RebalancePlanLine,
} from "../domain/rebalancePlan";
import { formatNumber } from "./formatPosition";

const EMPTY_REASON_COPY: Record<RebalanceEmptyReason, string> = {
  no_budget: "Укажите сумму бюджета",
  no_shortfall: "Нечего докупать — нет недостачи",
  budget_too_small: "Бюджет слишком мал для одного лота",
  threshold_not_met: "Порог прироста соответствия не достигнут",
};

const MODE_OPTIONS: { mode: RebalanceMode; label: string }[] = [
  { mode: "budget", label: "На сумму" },
  { mode: "free_cash", label: "Свободный кэш" },
  { mode: "min_trades", label: "Мин. сделок" },
];

function formatRub(value: number): string {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function parseInputNumber(value: string): number {
  if (value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseThresholdInput(value: string): number {
  if (value === "") return 0.01;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0.01;
}

function budgetFieldLabel(mode: RebalanceMode): string {
  return mode === "free_cash" ? "Свободный кэш, ₽" : "Сумма, ₽";
}

function groupLinesByUnit(lines: RebalancePlanLine[]): RebalancePlanLine[][] {
  const groups: RebalancePlanLine[][] = [];
  let current: RebalancePlanLine[] = [];
  for (const line of lines) {
    if (current.length === 0 || current[0].unitId === line.unitId) {
      current.push(line);
    } else {
      groups.push(current);
      current = [line];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export interface RebalancePanelProps {
  selectedIndex: string;
  mode: RebalanceMode;
  budgetInput: string;
  thresholdInput: string;
  plan: RebalancePlan;
  onModeChange: (mode: RebalanceMode) => void;
  onBudgetChange: (value: string) => void;
  onThresholdChange: (value: string) => void;
  onCopyTsv: () => void;
  onDownloadCsv: () => void;
}

export function RebalancePanel({
  selectedIndex,
  mode,
  budgetInput,
  thresholdInput,
  plan,
  onModeChange,
  onBudgetChange,
  onThresholdChange,
  onCopyTsv,
  onDownloadCsv,
}: RebalancePanelProps) {
  const exportDisabled = plan.lines.length === 0;
  const lineGroups = groupLinesByUnit(plan.lines);

  return (
    <section className="rebalance-tab">
      <div className="rebalance-toolbar">
        <div className="rebalance-toolbar__modes">
          {MODE_OPTIONS.map(({ mode: optionMode, label }) => (
            <button
              key={optionMode}
              type="button"
              className={mode === optionMode ? "rebalance-mode--active" : undefined}
              aria-pressed={mode === optionMode}
              onClick={() => onModeChange(optionMode)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="rebalance-toolbar__budget">
          {budgetFieldLabel(mode)}
          <input
            type="number"
            min={0}
            step={1}
            value={budgetInput}
            onChange={(event) => onBudgetChange(event.target.value)}
          />
        </label>
        {mode === "min_trades" && (
          <label className="rebalance-toolbar__threshold">
            Порог прироста
            <input
              type="number"
              min={0}
              step={0.001}
              value={thresholdInput}
              onChange={(event) => onThresholdChange(event.target.value)}
            />
          </label>
        )}
        <span className="rebalance-index-badge">Индекс: {selectedIndex}</span>
      </div>

      <p className="rebalance-hint">Рекомендации, портфель не меняется</p>

      {plan.emptyReason !== null && (
        <p className="rebalance-empty">{EMPTY_REASON_COPY[plan.emptyReason]}</p>
      )}

      {plan.lines.length > 0 && (
        <div className="table-scroll">
          <table className="rebalance-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Тикер</th>
                <th className="num">Лоты</th>
                <th className="num">Акции</th>
                <th className="num">Сумма ₽</th>
                <th className="num">Shortfall до</th>
                <th className="num">Shortfall после (sim)</th>
              </tr>
            </thead>
            <tbody>
              {lineGroups.flatMap((group) =>
                group.map((line, index) => (
                  <tr key={`${line.unitId}-${line.ticker}`}>
                    <td>{index === 0 ? line.unitId : ""}</td>
                    <td>{line.ticker}</td>
                    <td className="num">{line.lots}</td>
                    <td className="num">{line.shares}</td>
                    <td className="num">{formatRub(line.spendRub)}</td>
                    <td className="num">{formatRub(line.shortfallRubBefore)}</td>
                    <td className="num">
                      {formatRub(plan.shortfallRubAfterByUnitId[line.unitId] ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="rebalance-summary">
        <span>Потрачено: {formatRub(plan.spentTotal)} ₽</span>
        <span>Остаток: {formatRub(plan.leftoverRub)} ₽</span>
        <span>
          Соответствие: {formatNumber(plan.avgComplianceBefore)} →{" "}
          {formatNumber(plan.avgComplianceAfter)}
        </span>
        <span>Сделок: {plan.tradeCount}</span>
      </div>

      <div className="rebalance-actions">
        <button type="button" disabled={exportDisabled} onClick={onCopyTsv}>
          Копировать TSV
        </button>
        <button type="button" disabled={exportDisabled} onClick={onDownloadCsv}>
          Скачать CSV
        </button>
      </div>
    </section>
  );
}

export function RebalanceTab() {
  const { file, selectedIndex } = usePortfolio();
  const { calculated, portfolioValue } = useCalculatedPositions();
  const [mode, setMode] = useState<RebalanceMode>("budget");
  const [budgetInput, setBudgetInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("0.01");

  const budgetRub = parseInputNumber(budgetInput);
  const complianceGainThreshold = parseThresholdInput(thresholdInput);

  const plan = useMemo(
    () =>
      buildRebalancePlan({
        calculated,
        pairs: file?.pairs ?? [],
        portfolioValue,
        budgetRub,
        mode,
        complianceGainThreshold: mode === "min_trades" ? complianceGainThreshold : undefined,
      }),
    [calculated, file?.pairs, portfolioValue, budgetRub, mode, complianceGainThreshold]
  );

  if (!file) return null;

  function handleDownloadCsv() {
    const blob = new Blob([planToCsv(plan)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "rebalance-plan.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <RebalancePanel
      selectedIndex={selectedIndex}
      mode={mode}
      budgetInput={budgetInput}
      thresholdInput={thresholdInput}
      plan={plan}
      onModeChange={setMode}
      onBudgetChange={setBudgetInput}
      onThresholdChange={setThresholdInput}
      onCopyTsv={() => void navigator.clipboard.writeText(planToTsv(plan))}
      onDownloadCsv={handleDownloadCsv}
    />
  );
}
