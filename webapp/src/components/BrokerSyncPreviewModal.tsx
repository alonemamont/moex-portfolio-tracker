import { SyncDiffRow, SyncDiffRowStatus } from "../brokers/syncDiff";

const STATUS_LABELS: Record<SyncDiffRowStatus, string> = {
  existing: "обновление",
  new: "новая позиция",
  unresolved: "тикер не найден — пропущен",
};

export function BrokerSyncPreviewModal({
  connectionLabel,
  rows,
  onConfirm,
  onClose,
}: {
  connectionLabel: string;
  rows: SyncDiffRow[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hasChanges = rows.some((row) => row.status !== "unresolved" && row.previousShares !== row.newShares);

  return (
    <div className="modal-backdrop" role="dialog" aria-label={`Синхронизация: ${connectionLabel}`}>
      <div className="modal">
        <h2>Синхронизация: {connectionLabel}</h2>
        <table>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{STATUS_LABELS[row.status]}</td>
                <td>{row.status === "unresolved" ? "—" : `${row.previousShares} → ${row.newShares}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal__actions">
          <button type="button" onClick={onConfirm} disabled={!hasChanges}>
            Подтвердить
          </button>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
