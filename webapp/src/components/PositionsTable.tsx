import { CalculatedPosition, STATUS_LABELS } from "../types";

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

export function PositionsTable({
  positions,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  return (
    <table className="positions-table">
      <thead>
        <tr>
          <th>Тикер</th>
          <th>Название</th>
          <th>Вес в индексе</th>
          <th>Цена</th>
          <th>Лотность</th>
          <th>Сектор</th>
          <th>Дивиденд</th>
          <th>Статус</th>
          <th>Коэф-т</th>
          <th>Куплено</th>
          <th>Цель</th>
          <th>Факт. доля</th>
          <th>Соответствие</th>
          <th>Стоимость</th>
          <th>Доход</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <tr key={p.ticker}>
            <td>{p.ticker}</td>
            <td>{p.shortName}</td>
            <td>{formatNumber(p.indexWeight)}</td>
            <td>{formatNumber(p.price)}</td>
            <td>{p.lotSize ?? "—"}</td>
            <td>{p.sector}</td>
            <td>{formatNumber(p.dividendPerShare)}</td>
            <td>{STATUS_LABELS[p.status]}</td>
            <td>
              <input
                type="number"
                step="0.01"
                value={p.coefficient}
                onChange={(e) => onChangeCoefficient(p.ticker, Number(e.target.value))}
              />
            </td>
            <td>
              <input
                type="number"
                step="1"
                value={p.sharesOwned}
                onChange={(e) => onChangeSharesOwned(p.ticker, Number(e.target.value))}
              />
            </td>
            <td>{formatNumber(p.targetAllocation)}</td>
            <td>{formatNumber(p.actualShare)}</td>
            <td>{formatNumber(p.compliance)}</td>
            <td>{formatNumber(p.positionValue)}</td>
            <td>{formatNumber(p.income)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
