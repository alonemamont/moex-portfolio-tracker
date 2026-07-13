import { useMemo, useEffect, useRef, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useErrors } from "../errors/useErrors";
import { runMarketUpdate } from "../portfolio/runMarketUpdate";
import { useCalculatedPositions } from "../portfolio/useCalculatedPositions";
import { filterPositions } from "../portfolio/filterPositions";
import {
  loadSearchPref,
  saveSearchPref,
  loadHideEmptyPref,
  saveHideEmptyPref,
  loadOnlyInIndexPref,
  saveOnlyInIndexPref,
} from "../portfolio/tablePrefs";
import { PositionsTable } from "./PositionsTable";
import { AddTickerModal } from "./AddTickerModal";
import { PairPositionsModal } from "./PairPositionsModal";
import { PortfolioFile } from "../types";

const SOURCE = "update";

export function PortfolioTab({ autoUpdateSignal }: { autoUpdateSignal: number }) {
  const { file, setFile, liveByTicker, setLiveByTicker, selectedIndex, isUpdating, setIsUpdating } =
    usePortfolio();
  const { addError, clearBySource } = useErrors();
  const lastAutoSignal = useRef(0);

  const [search, setSearch] = useState(() => loadSearchPref());
  const [hideEmpty, setHideEmpty] = useState(() => loadHideEmptyPref());
  const [onlyInIndex, setOnlyInIndex] = useState(() => loadOnlyInIndexPref());
  const [showAddTicker, setShowAddTicker] = useState(false);
  const [showPairPositions, setShowPairPositions] = useState(false);

  useEffect(() => {
    saveSearchPref(search);
  }, [search]);

  useEffect(() => {
    saveHideEmptyPref(hideEmpty);
  }, [hideEmpty]);

  useEffect(() => {
    saveOnlyInIndexPref(onlyInIndex);
  }, [onlyInIndex]);

  async function handleUpdate(fileOverride?: PortfolioFile) {
    const target = fileOverride ?? file;
    if (!target) return;
    setIsUpdating(true);
    clearBySource(SOURCE);
    try {
      const { file: updated, liveByTicker: newLiveByTicker } = await runMarketUpdate(
        target,
        liveByTicker,
        selectedIndex
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
        void handleUpdate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUpdateSignal]);

  const { calculated } = useCalculatedPositions();

  const filteredPositions = useMemo(
    () => filterPositions(calculated, file?.pairs ?? [], search, hideEmpty, onlyInIndex),
    [calculated, file, search, hideEmpty, onlyInIndex]
  );

  if (!file) return null;

  function updateField(ticker: string, field: "coefficient" | "sharesOwned", value: number) {
    if (!file) return;
    if (field === "coefficient") {
      const pairIndex = file.pairs.findIndex((pair) => pair.tickers.includes(ticker));
      if (pairIndex !== -1) {
        setFile({
          ...file,
          pairs: file.pairs.map((pair, i) => (i === pairIndex ? { ...pair, coefficient: value } : pair)),
        });
        return;
      }
    }
    setFile({
      ...file,
      positions: file.positions.map((p) =>
        p.ticker === ticker ? { ...p, [field]: value } : p
      ),
    });
  }

  function handleAddTicker(ticker: string, sharesOwned: number) {
    if (!file) return;
    const updated: PortfolioFile = {
      ...file,
      positions: [...file.positions, { ticker, coefficient: 1, sharesOwned }],
    };
    setFile(updated);
    setShowAddTicker(false);
    void handleUpdate(updated);
  }

  return (
    <div className="portfolio-tab">
      <div className="action-row">
        <button type="button" onClick={() => handleUpdate()} disabled={isUpdating}>
          {isUpdating ? "Обновление…" : "Обновить"}
        </button>
        <button type="button" onClick={() => setShowAddTicker(true)} disabled={isUpdating}>
          + Тикер
        </button>
        <button type="button" onClick={() => setShowPairPositions(true)} disabled={isUpdating}>
          Парные позиции
        </button>
      </div>
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
        <label>
          <input
            type="checkbox"
            checked={onlyInIndex}
            onChange={(e) => setOnlyInIndex(e.target.checked)}
          />
          Только в индексе
        </label>
      </div>
      <PositionsTable
        positions={filteredPositions}
        pairs={file.pairs}
        onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
        onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
      />
      {showAddTicker && (
        <AddTickerModal
          existingPositions={file.positions}
          onConfirm={handleAddTicker}
          onClose={() => setShowAddTicker(false)}
        />
      )}
      {showPairPositions && (
        <PairPositionsModal
          existingPositions={file.positions}
          pairs={file.pairs}
          onSave={(pairs) => {
            setFile({ ...file, pairs });
            setShowPairPositions(false);
          }}
          onClose={() => setShowPairPositions(false)}
        />
      )}
    </div>
  );
}
