import { useState } from "react";

export function ResetManualSharesModal({
  positions,
  onConfirm,
  onClose,
}: {
  positions: { ticker: string; shortName: string; manualSharesOwned: number }[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Обнулить вручную введённое количество">
      <div className="modal">
        <h2>Обнулить вручную введённое количество</h2>
        <p>{`Будет обнулено позиций: ${positions.length}`}</p>
        <button type="button" onClick={() => setShowDetails((prev) => !prev)}>
          {showDetails ? "Скрыть детали" : "Детали"}
        </button>
        {showDetails && (
          <table>
            <tbody>
              {positions.map((p) => (
                <tr key={p.ticker}>
                  <td>{p.ticker}</td>
                  <td>{p.shortName}</td>
                  <td>{`${p.manualSharesOwned} → 0`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="modal__actions">
          <button type="button" onClick={onConfirm}>
            Обнулить
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
