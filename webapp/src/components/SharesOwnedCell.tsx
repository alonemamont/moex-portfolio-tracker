import { useEffect, useRef, useState } from "react";

export function SharesOwnedCell({
  manualSharesOwned,
  total,
  onChange,
}: {
  manualSharesOwned: number;
  total: number;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="1"
        aria-label="Куплено вручную"
        value={manualSharesOwned}
        onChange={(e) => onChange(Number(e.target.value))}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") inputRef.current?.blur();
        }}
      />
    );
  }

  return (
    <button type="button" className="shares-owned-cell__display" onClick={() => setEditing(true)}>
      {total}
    </button>
  );
}
