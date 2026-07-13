import { useState } from "react";
import { Pair, Position } from "../types";

export function PairPositionsModal({
  existingPositions,
  pairs,
  onSave,
  onClose,
}: {
  existingPositions: Position[];
  pairs: Pair[];
  onSave: (pairs: Pair[]) => void;
  onClose: () => void;
}) {
  const [draftPairs, setDraftPairs] = useState<Pair[]>(pairs);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
  const [newCoefficientInput, setNewCoefficientInput] = useState("1");

  const pairedTickers = new Set(draftPairs.flatMap((p) => p.tickers));
  const availableTickers = existingPositions.filter((p) => !pairedTickers.has(p.ticker));

  const newCoefficient = Number(newCoefficientInput);
  const canAddPair =
    selectedTickers.size >= 2 && newCoefficientInput !== "" && !Number.isNaN(newCoefficient);

  function toggleTicker(ticker: string) {
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  function handleRemovePair(index: number) {
    setDraftPairs((prev) => prev.filter((_, i) => i !== index));
  }

  function handleChangeCoefficient(index: number, value: number) {
    setDraftPairs((prev) => prev.map((p, i) => (i === index ? { ...p, coefficient: value } : p)));
  }

  function handleAddPair() {
    if (!canAddPair) return;
    setDraftPairs((prev) => [...prev, { tickers: [...selectedTickers], coefficient: newCoefficient }]);
    setSelectedTickers(new Set());
    setNewCoefficientInput("1");
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Парные позиции">
      <div className="modal">
        <h2>Парные позиции</h2>
        <div className="modal__actions">
          <button type="button" onClick={() => onSave(draftPairs)}>
            Сохранить
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
        <table>
          <tbody>
            {draftPairs.map((pair, index) => (
              <tr key={pair.tickers.join("+")}>
                <td>{pair.tickers.join(" + ")}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={pair.coefficient}
                    onChange={(e) => handleChangeCoefficient(index, Number(e.target.value))}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => handleRemovePair(index)}>
                    Удалить пару
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="modal__divider" />
        <div className="add-ticker__field">
          <input
            type="number"
            step="0.01"
            placeholder="Коэффициент"
            value={newCoefficientInput}
            onChange={(e) => setNewCoefficientInput(e.target.value)}
          />
          <button type="button" onClick={handleAddPair} disabled={!canAddPair}>
            Добавить
          </button>
        </div>
        <div className="add-ticker__field">
          {availableTickers.map((p) => (
            <label key={p.ticker}>
              <input
                type="checkbox"
                checked={selectedTickers.has(p.ticker)}
                onChange={() => toggleTicker(p.ticker)}
              />
              {p.ticker}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
