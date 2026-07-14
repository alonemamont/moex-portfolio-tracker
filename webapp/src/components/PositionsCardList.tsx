import { CalculatedPosition } from "../types";
import { PositionCard } from "./PositionCard";

export function PositionsCardList({
  positions,
  brokerConnectionsById,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  brokerConnectionsById: Map<string, string>;
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  return (
    <div className="position-card-list">
      {positions.map((p) => (
        <PositionCard
          key={p.ticker}
          position={p}
          brokerConnectionsById={brokerConnectionsById}
          onChangeCoefficient={onChangeCoefficient}
          onChangeSharesOwned={onChangeSharesOwned}
        />
      ))}
    </div>
  );
}
