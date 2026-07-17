import { useMemo, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { HistoryLineChart } from "./HistoryLineChart";

export function ChartsTab() {
  const { file } = usePortfolio();
  const history = useMemo(() => file?.history ?? [], [file]);

  const allTickers = useMemo(() => {
    const set = new Set<string>();
    history.forEach((h) => h.snapshot.forEach((row) => set.add(row.ticker)));
    return Array.from(set).sort();
  }, [history]);

  const [selectedTicker, setSelectedTicker] = useState<string>("");

  const effectiveTicker =
    selectedTicker && allTickers.includes(selectedTicker) ? selectedTicker : allTickers[0] ?? "";

  const priceData = useMemo(
    () =>
      history.map((h) => ({
        x: h.timestamp,
        y: h.snapshot.find((row) => row.ticker === effectiveTicker)?.price ?? null,
      })),
    [history, effectiveTicker]
  );
  const valueData = useMemo(
    () => history.map((h) => ({ x: h.timestamp, y: h.portfolioValue })),
    [history]
  );
  const complianceData = useMemo(
    () => history.map((h) => ({ x: h.timestamp, y: h.avgCompliance ?? 0 })),
    [history]
  );

  if (history.length === 0) {
    return <p className="empty-state">История пуста — данные появятся после первого обновления.</p>;
  }

  return (
    <div className="charts-tab">
      <div className="charts-tab__controls">
        <label htmlFor="ticker-select">Тикер:</label>
        <select
          id="ticker-select"
          value={effectiveTicker}
          onChange={(e) => setSelectedTicker(e.target.value)}
        >
          {allTickers.map((ticker) => (
            <option key={ticker} value={ticker}>
              {ticker}
            </option>
          ))}
        </select>
      </div>
      <HistoryLineChart data={priceData} label={`Цена ${effectiveTicker}`} />
      <HistoryLineChart data={valueData} label="Стоимость портфеля" />
      <HistoryLineChart data={complianceData} label="Среднее соответствие индексу" />
    </div>
  );
}
