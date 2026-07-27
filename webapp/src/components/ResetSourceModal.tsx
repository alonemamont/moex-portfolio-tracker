export function ResetSourceModal({
  options,
  onSelect,
  onClose,
}: {
  options: { key: string; label: string; count: number }[];
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-label="Сбросить позиции">
      <div className="modal">
        <h2>Сбросить позиции</h2>
        {options.map((option) => (
          <div key={option.key}>
            <button type="button" disabled={option.count === 0} onClick={() => onSelect(option.key)}>
              {`${option.label} (${option.count})`}
            </button>
          </div>
        ))}
        <div className="modal__actions">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
