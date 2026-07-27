import { useMemo, useEffect, useRef, useState } from "react";
import { usePortfolio } from "../portfolio/usePortfolio";
import { useErrors } from "../errors/useErrors";
import { mergeCompletedMarketUpdate, runMarketUpdate } from "../portfolio/runMarketUpdate";
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
import { PositionsCardList } from "./PositionsCardList";
import { AddTickerModal } from "./AddTickerModal";
import { PairPositionsModal } from "./PairPositionsModal";
import { ResetSourceModal } from "./ResetSourceModal";
import { ResetPositionsModal } from "./ResetPositionsModal";
import { PortfolioFile } from "../types";
import { useIsMobile } from "../portfolio/useIsMobile";
import {
  ResetSource,
  resetSourceFromKey,
  groupAffectedPositions,
  buildResetConfirmation,
  applyPositionsReset,
} from "../domain/resetPositions";
import { describeDiagnosticError } from "../brokers/diagnostics";

const SOURCE = "update";

type ResetFlow = { step: "source" } | { step: "confirm"; source: ResetSource } | null;

export function PortfolioTab({ autoUpdateSignal }: { autoUpdateSignal: number }) {
  const { file, setFile, liveByTicker, setLiveByTicker, selectedIndex, isUpdating, setIsUpdating } =
    usePortfolio();
  const { addError, clearBySource } = useErrors();
  const isMobile = useIsMobile();
  const lastAutoSignal = useRef(0);

  const [search, setSearch] = useState(() => loadSearchPref());
  const [hideEmpty, setHideEmpty] = useState(() => loadHideEmptyPref());
  const [onlyInIndex, setOnlyInIndex] = useState(() => loadOnlyInIndexPref());
  const [showAddTicker, setShowAddTicker] = useState(false);
  const [showPairPositions, setShowPairPositions] = useState(false);
  const [resetFlow, setResetFlow] = useState<ResetFlow>(null);

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
      setFile((current) => current ? mergeCompletedMarketUpdate(current, updated) : current);
      setLiveByTicker(newLiveByTicker);
    } catch (error) {
      addError(SOURCE, `Не удалось обновить рыночные данные: ${describeDiagnosticError(error)}`);
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

  const brokerConnectionsById = useMemo(
    () => new Map((file?.brokerConnections ?? []).map((c) => [c.id, c.label])),
    [file?.brokerConnections]
  );

  const activeConnectionIds = useMemo(
    () => new Set(brokerConnectionsById.keys()),
    [brokerConnectionsById]
  );

  const affected = useMemo(
    () => groupAffectedPositions(filteredPositions, file?.brokerConnections ?? [], activeConnectionIds),
    [filteredPositions, file?.brokerConnections, activeConnectionIds]
  );
  const { affectedManual, affectedByConnection, affectedOrphaned } = affected;

  const resetSourceOptions = [
    { key: "manual", label: "Ручные позиции", count: affectedManual.length },
    ...(file?.brokerConnections ?? []).map((c) => ({
      key: c.id,
      label: c.label,
      count: affectedByConnection.get(c.id)?.length ?? 0,
    })),
    { key: "orphaned", label: "Удалённые holdings", count: affectedOrphaned.length },
  ];

  const resetHasAnyAffected =
    affectedManual.length > 0 ||
    affectedOrphaned.length > 0 ||
    Array.from(affectedByConnection.values()).some((list) => list.length > 0);

  const confirmSource = resetFlow?.step === "confirm" ? resetFlow.source : null;
  const { title: confirmTitle, positions: confirmPositions } = confirmSource
    ? buildResetConfirmation(confirmSource, affected, activeConnectionIds, brokerConnectionsById)
    : { title: "", positions: [] };

  if (!file) return null;

  function updateField(ticker: string, field: "coefficient" | "sharesOwned", value: number) {
    if (!file) return;
    if (field === "coefficient") {
      const pairIndex = file.pairs.findIndex((pair) => pair.tickers.includes(ticker));
      if (pairIndex !== -1) {
        setFile({
          ...file,
          pairs: file.pairs.map((pair, i) =>
            i === pairIndex
              ? { ...pair, coefficients: { ...pair.coefficients, [ticker]: value } }
              : pair
          ),
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
        <button
          type="button"
          onClick={() => setResetFlow({ step: "source" })}
          disabled={isUpdating || !resetHasAnyAffected}
        >
          Сбросить позиции
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
      {isMobile ? (
        <PositionsCardList
          positions={filteredPositions}
          brokerConnectionsById={brokerConnectionsById}
          onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
          onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
        />
      ) : (
        <PositionsTable
          positions={filteredPositions}
          pairs={file.pairs}
          brokerConnectionsById={brokerConnectionsById}
          onChangeCoefficient={(ticker, value) => updateField(ticker, "coefficient", value)}
          onChangeSharesOwned={(ticker, value) => updateField(ticker, "sharesOwned", value)}
        />
      )}
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
      {resetFlow?.step === "source" && (
        <ResetSourceModal
          options={resetSourceOptions}
          onSelect={(key) =>
            setResetFlow({ step: "confirm", source: resetSourceFromKey(key) })
          }
          onClose={() => setResetFlow(null)}
        />
      )}
      {resetFlow?.step === "confirm" && (
        <ResetPositionsModal
          title={confirmTitle}
          positions={confirmPositions}
          onConfirm={() => {
            if (!file) return;
            setFile({
              ...file,
              positions: applyPositionsReset(file.positions, resetFlow.source, affected, activeConnectionIds),
            });
            setResetFlow(null);
          }}
          onBack={() => setResetFlow({ step: "source" })}
          onClose={() => setResetFlow(null)}
        />
      )}
    </div>
  );
}
