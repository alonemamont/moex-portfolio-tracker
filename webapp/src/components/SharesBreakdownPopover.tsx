import { useEffect, useRef, useState } from "react";
import { SharesBreakdownRow } from "../domain/sharesBreakdown";

export function SharesBreakdownPopover({
  rows,
  total,
}: {
  rows: SharesBreakdownRow[];
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <span className="shares-popover" ref={containerRef}>
      <button
        type="button"
        className="shares-popover__trigger"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Σ{total}
      </button>
      {open && (
        <div className="shares-popover__panel" role="dialog">
          {rows.map((row) => (
            <div className="shares-popover__row" key={row.label}>
              <span>{row.label}</span>
              <span>{row.shares}</span>
            </div>
          ))}
          <div className="shares-popover__row shares-popover__row--total">
            <span>Итого</span>
            <span>{total}</span>
          </div>
        </div>
      )}
    </span>
  );
}
