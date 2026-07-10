import { useState } from "react";
import { Position } from "../types";

export function SectorOverrideModal({
  positions,
  currentOverrides,
  resolveSector,
  onSave,
  onClose,
}: {
  positions: Position[];
  currentOverrides: Record<string, string>;
  resolveSector: (ticker: string) => string;
  onSave: (overrides: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of positions) {
      initial[p.ticker] = currentOverrides[p.ticker] ?? resolveSector(p.ticker);
    }
    return initial;
  });

  return (
    <div className="modal-backdrop" role="dialog" aria-label="Изменить сектора">
      <div className="modal">
        <h2>Изменить сектора</h2>
        <table>
          <tbody>
            {positions.map((p) => (
              <tr key={p.ticker}>
                <td>{p.ticker}</td>
                <td>
                  <input
                    type="text"
                    value={draft[p.ticker] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [p.ticker]: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal__actions">
          <button type="button" onClick={() => onSave(draft)}>
            Сохранить
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
