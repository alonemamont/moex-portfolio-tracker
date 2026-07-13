import { usePortfolio } from "../portfolio/usePortfolio";
import { useCalculatedPositions } from "../portfolio/useCalculatedPositions";
import { DeviationEntry } from "../domain/calculations";

function formatDeviationEntry(entry: DeviationEntry | null): string {
  if (entry === null) return "—";
  const sign = entry.deviationRub >= 0 ? "+" : "-";
  const amount = Math.round(Math.abs(entry.deviationRub)).toLocaleString("ru-RU");
  return `${entry.ticker} ${sign}₽${amount}`;
}

export function Dashboard() {
  const { file } = usePortfolio();
  const { portfolioValue, avgCompliance, largestSurplus, largestShortfall } = useCalculatedPositions();

  if (!file) return null;

  return (
    <div className="dashboard">
      <span data-label="Общая стоимость">{portfolioValue.toFixed(2)}</span>
      <span data-label="Среднее соответствие">
        {avgCompliance === null ? "—" : avgCompliance.toFixed(2)}
      </span>
      <span data-label="Наибольший избыток">{formatDeviationEntry(largestSurplus)}</span>
      <span data-label="Наибольшая недостача">{formatDeviationEntry(largestShortfall)}</span>
    </div>
  );
}
