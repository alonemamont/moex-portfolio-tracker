import { useMemo, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useErrors } from "../errors/useErrors";
import { fetchDividendHistoriesForTickers } from "../iss/client";
import { computeTotalSharesOwned } from "../domain/calculations";
import {
  buildUpcomingDividendRows,
  localTodayISO,
  mergeDividendSnapshot,
  ownedTickersWithShares,
  resolveDividendEmptyReason,
  sumExpectedIncome,
} from "../domain/dividendCalendar";
import { formatNumber } from "./formatPosition";

const SOURCE = "dividends";

const EMPTY_COPY = {
  no_positions: "Нет позиций с акциями",
  never_fetched: "Нажмите Обновить",
  no_upcoming: "Ближайших отсечек в ISS нет",
} as const;

export function DividendsTab() {
  const { file, setFile, liveByTicker } = usePortfolio();
  const { addError, clearBySource } = useErrors();
  const [isDividendsUpdating, setIsDividendsUpdating] = useState(false);

  const ownedTickers = useMemo(
    () => (file ? ownedTickersWithShares(file.positions) : []),
    [file]
  );

  const positionInputs = useMemo(() => {
    if (!file) return [];
    return file.positions.map((p) => {
      const ticker = p.ticker.trim().toUpperCase();
      const live = liveByTicker.get(ticker);
      return {
        ticker,
        sharesOwned: computeTotalSharesOwned(p),
        price: live?.price ?? null,
      };
    });
  }, [file, liveByTicker]);

  const rows = useMemo(() => {
    if (!file) return [];
    return buildUpcomingDividendRows({
      events: file.dividendEvents,
      positions: positionInputs,
      today: localTodayISO(),
    });
  }, [file, positionInputs]);

  const emptyReason = useMemo(() => {
    if (!file) return "no_positions" as const;
    return resolveDividendEmptyReason({
      hasOwnedShares: ownedTickers.length > 0,
      dividendsFetchedAt: file.dividendsFetchedAt,
      upcomingCount: rows.length,
    });
  }, [file, ownedTickers.length, rows.length]);

  if (!file) return null;

  async function handleUpdate() {
    if (ownedTickers.length === 0) return;
    setIsDividendsUpdating(true);
    clearBySource(SOURCE);
    try {
      const result = await fetchDividendHistoriesForTickers(ownedTickers);
      if (result.succeededTickers.length === 0) {
        addError(SOURCE, "Не удалось обновить дивиденды");
        return;
      }
      setFile((current) => {
        if (!current) return current;
        const ownedNow = ownedTickersWithShares(current.positions);
        const nextEvents = mergeDividendSnapshot({
          previous: current.dividendEvents,
          ownedNow,
          eventsByTicker: result.eventsByTicker,
          succeededTickers: result.succeededTickers,
        });
        return {
          ...current,
          dividendEvents: nextEvents,
          dividendsFetchedAt: new Date().toISOString(),
        };
      });
      if (result.failedTickers.length > 0) {
        addError(
          SOURCE,
          `Не удалось обновить дивиденды для: ${result.failedTickers.join(", ")}`
        );
      }
    } catch (error) {
      addError(
        SOURCE,
        `Не удалось обновить дивиденды: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsDividendsUpdating(false);
    }
  }

  const fetchedLabel = file.dividendsFetchedAt
    ? new Date(file.dividendsFetchedAt).toLocaleString("ru-RU")
    : "—";

  return (
    <section className="dividends-tab">
      <div className="dividends-toolbar">
        <button
          type="button"
          onClick={() => void handleUpdate()}
          disabled={isDividendsUpdating || ownedTickers.length === 0}
        >
          {isDividendsUpdating ? "Обновление…" : "Обновить дивиденды"}
        </button>
        <span className="dividends-fetched">Обновлено: {fetchedLabel}</span>
        <span className="dividends-save-hint">Сохранить портфель — чтобы записать на диск</span>
      </div>

      <p className="dividends-disclaimer">
        Ожидаемый доход ориентировочный: считается по <strong>текущему</strong> числу акций.
        Право на дивиденд зависит от владения на дату отсечки; налоги и факт выплаты не учитываются.
      </p>

      {emptyReason ? (
        <div className="empty-state dividends-empty">{EMPTY_COPY[emptyReason]}</div>
      ) : (
        <>
          <table className="dividends-table">
            <thead>
              <tr>
                <th>Тикер</th>
                <th>Отсечка</th>
                <th className="num">₽/акция</th>
                <th className="num">Акций</th>
                <th className="num">Ожид. доход ₽</th>
                <th className="num">Дох. события %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.ticker}|${row.registryCloseDate}|${row.valuePerShare}`}>
                  <td>{row.ticker}</td>
                  <td>{row.registryCloseDate}</td>
                  <td className="num">{formatNumber(row.valuePerShare)}</td>
                  <td className="num">{formatNumber(row.sharesOwned, 0)}</td>
                  <td className="num">{formatNumber(row.expectedIncome)}</td>
                  <td className="num">{formatNumber(row.eventYieldPct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Итого ожид. доход</td>
                <td className="num">{formatNumber(sumExpectedIncome(rows))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </section>
  );
}
