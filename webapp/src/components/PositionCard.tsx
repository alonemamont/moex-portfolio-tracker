import { useState } from "react";
import { CalculatedPosition } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { buildExpandedFields, formatNumber } from "./formatPosition";

export function PositionCard({
  position,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  position: CalculatedPosition;
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fields = buildExpandedFields(position);

  return (
    <div className="position-card">
      <button
        type="button"
        className="position-card__summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={`status-dot${position.status === "in_index" ? " status-dot--in" : ""}`} />
        <span className="position-card__ticker">{position.ticker}</span>
        <span className="position-card__name">{position.shortName}</span>
        <span className="position-card__price">{formatNumber(position.price)}</span>
        <ComplianceGauge value={position.compliance} />
      </button>
      {expanded && (
        <div className="position-card__details">
          {fields.map((field) => {
            if (field.kind === "coefficient") {
              return (
                <div className="position-card__row" key="coefficient">
                  <span className="position-card__label">Коэф-т</span>
                  <input
                    type="number"
                    step="0.01"
                    value={position.coefficient}
                    onChange={(e) => onChangeCoefficient(position.ticker, Number(e.target.value))}
                  />
                </div>
              );
            }
            if (field.kind === "sharesOwned") {
              return (
                <div className="position-card__row" key="sharesOwned">
                  <span className="position-card__label">Куплено</span>
                  <input
                    type="number"
                    step="1"
                    value={position.sharesOwned}
                    onChange={(e) => onChangeSharesOwned(position.ticker, Number(e.target.value))}
                  />
                </div>
              );
            }
            return (
              <div className="position-card__row" key={field.key}>
                <span className="position-card__label">{field.label}</span>
                <span className="position-card__value">{field.value}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
