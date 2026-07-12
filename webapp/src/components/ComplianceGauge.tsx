const GAUGE_MIN = 0.5;
const GAUGE_MAX = 1.5;

function complianceColor(value: number): string {
  const diff = Math.abs(value - 1);
  if (diff <= 0.05) return "var(--up)";
  if (diff <= 0.15) return "var(--warn)";
  return "var(--down)";
}

export function ComplianceGauge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="gauge">
        <span className="gauge__value">—</span>
      </span>
    );
  }

  const clamped = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, value));
  const pct = ((clamped - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100;
  const color = complianceColor(value);

  return (
    <span className="gauge">
      <span className="gauge__value">{value.toFixed(2)}</span>
      <span className="gauge__track">
        <span className="gauge__tick" />
        <span className="gauge__dot" style={{ left: `${pct}%`, background: color }} />
      </span>
    </span>
  );
}
