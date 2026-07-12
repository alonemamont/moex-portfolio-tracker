import { CalculatedPosition, STATUS_LABELS } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";

function formatNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function headerWithHint(label: string, hint: string) {
  return (
    <>
      {label}
      <span className="th-hint" data-tooltip={hint} tabIndex={0}>
        ?
      </span>
    </>
  );
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
    <div className="table-scroll">
      <table className="positions-table">
        <thead>
          <tr>
            <th>Тикер</th>
            <th>Название</th>
            <th className="num">Вес в индексе</th>
            <th className="num">Цена</th>
            <th className="num">Лотность</th>
            <th>Сектор</th>
            <th className="num">Дивиденд</th>
            <th>Статус</th>
            <th className="num">{headerWithHint("Коэф-т", "Множитель к весу в индексе при расчёте целевой доли")}</th>
            <th className="num">Куплено</th>
            <th className="num">{headerWithHint("Цель", "Целевая доля = вес в индексе × коэффициент")}</th>
            <th className="num">{headerWithHint("Факт. доля", "Текущая доля позиции в стоимости портфеля, %")}</th>
            <th className="num">{headerWithHint("Соответствие", "Факт. доля ÷ Цель (1.0 = точное совпадение)")}</th>
            <th className="num">Стоимость</th>
            <th className="num">{headerWithHint("Доход", "Дивиденд на акцию × количество акций")}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.ticker}>
              <td>{p.ticker}</td>
              <td>{p.shortName}</td>
              <td className="num">{formatNumber(p.indexWeight)}</td>
              <td className="num">{formatNumber(p.price)}</td>
              <td className="num">{p.lotSize ?? "—"}</td>
              <td>{p.sector}</td>
              <td className="num">{formatNumber(p.dividendPerShare)}</td>
              <td>
                <span className={`status-dot${p.status === "in_index" ? " status-dot--in" : ""}`}>
                  {STATUS_LABELS[p.status]}
                </span>
              </td>
              <td className="num">
                <input
                  type="number"
                  step="0.01"
                  value={p.coefficient}
                  onChange={(e) => onChangeCoefficient(p.ticker, Number(e.target.value))}
                />
              </td>
              <td className="num">
                <input
                  type="number"
                  step="1"
                  value={p.sharesOwned}
                  onChange={(e) => onChangeSharesOwned(p.ticker, Number(e.target.value))}
                />
              </td>
              <td className="num">{formatNumber(p.targetAllocation)}</td>
              <td className="num">{formatNumber(p.actualShare)}</td>
              <td className="num">
                <ComplianceGauge value={p.compliance} />
              </td>
              <td className="num">{formatNumber(p.positionValue)}</td>
              <td className="num">{formatNumber(p.income)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
