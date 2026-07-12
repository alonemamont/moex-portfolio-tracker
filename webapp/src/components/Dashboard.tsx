import { usePortfolio } from "../portfolio/usePortfolio";
import { useCalculatedPositions } from "../portfolio/useCalculatedPositions";

export function Dashboard() {
  const { file } = usePortfolio();
  const { portfolioValue, avgCompliance } = useCalculatedPositions();

  if (!file) return null;

  return (
    <div className="dashboard">
      <span data-label="Общая стоимость">{portfolioValue.toFixed(2)}</span>
      <span data-label="Среднее соответствие">
        {avgCompliance === null ? "—" : avgCompliance.toFixed(2)}
      </span>
    </div>
  );
}
