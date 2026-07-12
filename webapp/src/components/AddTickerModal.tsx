import { useEffect, useState } from "react";
import { Position } from "../types";
import { fetchSecurities } from "../iss/client";
import { validateTicker, TickerValidationState } from "../portfolio/tickerValidation";

const DEBOUNCE_MS = 400;

export function AddTickerModal({
  existingPositions,
  onConfirm,
  onClose,
}: {
  existingPositions: Position[];
  onConfirm: (ticker: string, sharesOwned: number) => void;
  onClose: () => void;
}) {
  const [ticker, setTicker] = useState("");
  const [sharesOwnedInput, setSharesOwnedInput] = useState("");
  const [asyncResult, setAsyncResult] = useState<{ ticker: string; state: TickerValidationState } | null>(
    null
  );

  const trimmedTicker = ticker.trim();

  useEffect(() => {
    if (!trimmedTicker) return;
    const timer = setTimeout(() => {
      validateTicker(trimmedTicker, existingPositions, fetchSecurities)
        .then((state) => setAsyncResult({ ticker: trimmedTicker, state }))
        .catch(() => setAsyncResult({ ticker: trimmedTicker, state: { kind: "not_found" } }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedTicker, existingPositions]);

  const validation: TickerValidationState =
    trimmedTicker && asyncResult?.ticker === trimmedTicker ? asyncResult.state : { kind: "idle" };
  const checking = trimmedTicker !== "" && asyncResult?.ticker !== trimmedTicker;

  const sharesOwned = Number(sharesOwnedInput);
  const canConfirm =
    validation.kind === "found" &&
    sharesOwnedInput !== "" &&
    !Number.isNaN(sharesOwned) &&
    sharesOwned >= 0;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(ticker.trim().toUpperCase(), sharesOwned);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Добавить тикер">
      <div className="modal">
        <h2>Добавить тикер</h2>
        <div className="add-ticker__field">
          <input
            type="text"
            placeholder="Тикер"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            autoFocus
          />
          <span className="add-ticker__status">
            {checking && "проверка…"}
            {!checking && validation.kind === "found" && `найден «${validation.shortName}»`}
            {!checking && validation.kind === "not_found" && "тикер не найден"}
            {!checking && validation.kind === "duplicate" && "тикер уже в портфеле"}
          </span>
        </div>
        <input
          type="number"
          placeholder="Количество"
          min={0}
          value={sharesOwnedInput}
          onChange={(e) => setSharesOwnedInput(e.target.value)}
        />
        <div className="modal__actions">
          <button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            Ок
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
