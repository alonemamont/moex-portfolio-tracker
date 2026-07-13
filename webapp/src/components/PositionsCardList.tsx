import { CalculatedPosition } from "../types";
import { PositionCard } from "./PositionCard";

export function PositionsCardList({
  positions,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  return (
    <div className="position-card-list">
      {positions.map((p) => (
        <PositionCard
          key={p.ticker}
          position={p}
          onChangeCoefficient={onChangeCoefficient}
          onChangeSharesOwned={onChangeSharesOwned}
        />
      ))}
    </div>
  );
}
