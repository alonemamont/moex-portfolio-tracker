import { useMemo, useEffect, useRef, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useErrors } from "../errors/useErrors";
import { runMarketUpdate } from "../portfolio/runMarketUpdate";
import { buildCalculatedPositions } from "../domain/buildCalculatedPositions";
import { createSectorResolver } from "../domain/sectors";
import { SECTORS_DEFAULT } from "../data/sectorsDefault";
import { filterPositions } from "../portfolio/filterPositions";
import {
  loadSearchPref,
  saveSearchPref,
  loadHideEmptyPref,
  saveHideEmptyPref,
} from "../portfolio/tablePrefs";
import { PositionsTable } from "./PositionsTable";

const SOURCE = "update";

export function PortfolioTab({ autoUpdateSignal }: { autoUpdateSignal: number }) {
  const { file, setFile, liveByTicker, setLiveByTicker } = usePortfolio();
  const { addError, clearBySource } = useErrors();
  const [isUpdating, setIsUpdating] = useState(false);
  const lastAutoSignal = useRef(0);

  const [search, setSearch] = useState(() => loadSearchPref());
  const [hideEmpty, setHideEmpty] = useState(() => loadHideEmptyPref());

  useEffect(() => {
    saveSearchPref(search);
  }, [search]);

  useEffect(() => {
    saveHideEmptyPref(hideEmpty);
  }, [hideEmpty]);

  async function handleUpdate() {
    if (!file) return;
    setIsUpdating(true);
    clearBySource(SOURCE);
    try {
      const { file: updated, liveByTicker: newLiveByTicker } = await runMarketUpdate(
        file,
        liveByTicker
      );
      setFile(updated);
      setLiveByTicker(newLiveByTicker);
    } catch (error) {
      addError(SOURCE, `Не удалось обновить рыночные данные: ${(error as Error).message}`);
    } finally {
      setIsUpdating(false);
    }
  }

  useEffect(() => {
    if (autoUpdateSignal !== lastAutoSignal.current) {
      lastAutoSignal.current = autoUpdateSignal;
      if (autoUpdateSignal > 0) {
        // Defer to a macrotask so handleUpdate's setState calls don't run
        // synchronously within this effect (avoids cascading renders).
        const timer = setTimeout(() => void handleUpdate(), 0);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUpdateSignal]);

  const calculated = useMemo(() => {
    if (!file) return [];
    // liveByTicker starts empty (before the first update); buildCalculatedPositions
    // already falls back to sensible defaults (out_of_index/null price) per-ticker
    // when an entry is missing, so no separate empty-merge step is needed here.
    // After an update, this is the real merged data (see handleUpdate above), kept
    // in PortfolioContext so it survives re-renders and feeds the next update's
    // previousLiveByTicker fallback (Task 10).
    const resolveSector = createSectorResolver(SECTORS_DEFAULT, file.sectors);
    return buildCalculatedPositions(file.positions, liveByTicker, resolveSector);
  }, [file, liveByTicker]);

  const filteredPositions = useMemo(
    () => filterPositions(calculated, search, hideEmpty),
    [calculated, search, hideEmpty]
  );

  if (!file) return null;

  const portfolioValue = calculated.reduce((sum, p) => sum + p.positionValue, 0);
  const avgCompliance =
    file.history.length > 0 ? file.history[file.history.length - 1].avgCompliance : null;

  function updateField(ticker: string, field: "coefficient" | "sharesOwned", value: number) {
    if (!file) return;
    setFile({
      ...file,
      positions: file.positions.map((p) =>
        p.ticker === ticker ? { ...p, [field]: value } : p
      ),
    });
  }

  return (
    <div className="portfolio-tab">
      <button type="button" onClick={handleUpdate} disabled={isUpdating}>
        {isUpdating ? "Обновление…" : "Обновить"}
      </button>
      <div className="controls-row">
        <input
          type="text"
          placeholder="Поиск по тикеру или названию"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
          />
          Скрывать пустые позиции
        </label>
      </div>
      <PositionsTable
        positions={filteredPositions}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
      <div className="portfolio-summary">
        <span>Общая стоимость: {portfolioValue.toFixed(2)}</span>
        <span>Среднее соответствие: {avgCompliance === null ? "—" : avgCompliance.toFixed(2)}</span>
      </div>
    </div>
  );
}
