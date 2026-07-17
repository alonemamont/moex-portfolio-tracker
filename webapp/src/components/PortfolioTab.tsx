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

const SOURCE = "update";

type ResetSource = { type: "manual" } | { type: "broker"; connectionId: string } | { type: "orphaned" };
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

  const brokerConnectionsById = useMemo(
    () => new Map((file?.brokerConnections ?? []).map((c) => [c.id, c.label])),
    [file?.brokerConnections]
  );

  const affectedManual = filteredPositions.filter((p) => p.manualSharesOwned !== 0);

  const affectedByConnection = new Map(
    (file?.brokerConnections ?? []).map((c) => [
      c.id,
      filteredPositions.filter((p) =>
        (p.brokerHoldings ?? []).some((h) => h.connectionId === c.id && h.shares !== 0)
      ),
    ])
  );

  const activeConnectionIds = new Set((file?.brokerConnections ?? []).map((connection) => connection.id));
  const affectedOrphaned = filteredPositions.filter((position) =>
    (position.brokerHoldings ?? []).some(
      (holding) => !activeConnectionIds.has(holding.connectionId) && holding.shares !== 0
    )
  );

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

  const confirmTitle =
    confirmSource === null
      ? ""
      : confirmSource.type === "manual"
      ? "Обнулить вручную введённое количество"
      : confirmSource.type === "orphaned"
      ? "Обнулить holdings удалённых брокеров"
      : `Обнулить холдинги брокера «${brokerConnectionsById.get(confirmSource.connectionId) ?? ""}»`;

  const confirmPositions =
    confirmSource === null
      ? []
      : confirmSource.type === "manual"
      ? affectedManual.map((p) => ({ ticker: p.ticker, shortName: p.shortName, currentValue: p.manualSharesOwned }))
      : confirmSource.type === "orphaned"
      ? affectedOrphaned.map((p) => ({
          ticker: p.ticker,
          shortName: p.shortName,
          currentValue: (p.brokerHoldings ?? [])
            .filter((holding) => !activeConnectionIds.has(holding.connectionId))
            .reduce((sum, holding) => sum + holding.shares, 0),
        }))
      : (affectedByConnection.get(confirmSource.connectionId) ?? []).map((p) => ({
          ticker: p.ticker,
          shortName: p.shortName,
          currentValue:
            (p.brokerHoldings ?? []).find((h) => h.connectionId === confirmSource.connectionId)?.shares ?? 0,
        }));

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
            setResetFlow({
              step: "confirm",
              source:
                key === "manual"
                  ? { type: "manual" }
                  : key === "orphaned"
                  ? { type: "orphaned" }
                  : { type: "broker", connectionId: key },
            })
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
            const source = resetFlow.source;
            if (source.type === "manual") {
              const tickers = new Set(affectedManual.map((p) => p.ticker));
              setFile({
                ...file,
                positions: file.positions.map((p) =>
                  tickers.has(p.ticker) ? { ...p, sharesOwned: 0 } : p
                ),
              });
            } else if (source.type === "orphaned") {
              setFile({
                ...file,
                positions: file.positions.map((position) => ({
                  ...position,
                  brokerHoldings: (position.brokerHoldings ?? []).filter((holding) =>
                    activeConnectionIds.has(holding.connectionId)
                  ),
                })),
              });
            } else {
              const affected = affectedByConnection.get(source.connectionId) ?? [];
              const tickers = new Set(affected.map((p) => p.ticker));
              setFile({
                ...file,
                positions: file.positions.map((p) =>
                  tickers.has(p.ticker)
                    ? {
                        ...p,
                        brokerHoldings: (p.brokerHoldings ?? []).filter(
                          (h) => h.connectionId !== source.connectionId
                        ),
                      }
                    : p
                ),
              });
            }
            setResetFlow(null);
          }}
          onBack={() => setResetFlow({ step: "source" })}
          onClose={() => setResetFlow(null)}
        />
      )}
    </div>
  );
}
