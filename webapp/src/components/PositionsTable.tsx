import { CalculatedPosition, Pair } from "../types";
import { ComplianceGauge } from "./ComplianceGauge";
import { buildSharesBreakdownTooltip } from "../domain/sharesBreakdown";
import { formatNumber } from "./formatPosition";

function formatMoney(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatMoneyTruncated(value: number): string {
  return Math.trunc(value).toLocaleString("ru-RU");
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

function pairRowClass(
  ticker: string,
  index: number,
  positions: CalculatedPosition[],
  pairedTickers: Map<string, Pair>
): string {
  const pair = pairedTickers.get(ticker);
  if (!pair) return "";

  const prevTicker = index > 0 ? positions[index - 1].ticker : undefined;
  const nextTicker = index < positions.length - 1 ? positions[index + 1].ticker : undefined;
  const isFirst = prevTicker === undefined || pairedTickers.get(prevTicker) !== pair;
  const isLast = nextTicker === undefined || pairedTickers.get(nextTicker) !== pair;

  let className = "paired-row";
  if (isFirst) className += " paired-row--first";
  if (isLast) className += " paired-row--last";
  return className;
}

export function PositionsTable({
  positions,
  pairs,
  brokerConnectionsById,
  onChangeCoefficient,
  onChangeSharesOwned,
}: {
  positions: CalculatedPosition[];
  pairs: Pair[];
  brokerConnectionsById: Map<string, string>;
  onChangeCoefficient: (ticker: string, value: number) => void;
  onChangeSharesOwned: (ticker: string, value: number) => void;
}) {
  const pairedTickers = new Map<string, Pair>();
  for (const pair of pairs) {
    for (const ticker of pair.tickers) pairedTickers.set(ticker, pair);
  }

  return (
    <div className="table-scroll">
      <table className="positions-table">
        <thead>
          <tr>
            <th rowSpan={2}></th>
            <th rowSpan={2}>Тикер</th>
            <th rowSpan={2}>Название</th>
            <th colSpan={2} className="num th-group">Вес %</th>
            <th rowSpan={2} className="num">Цена</th>
            <th rowSpan={2} className="num">Лотность</th>
            <th rowSpan={2} className="num">
              {headerWithHint("Коэф-т", "Множитель к весу в индексе при расчёте целевой доли")}
            </th>
            <th colSpan={2} className="num th-group">Куплено</th>
            <th colSpan={2} className="num th-group">Купить</th>
            <th rowSpan={2} className="num">
              {headerWithHint("Цель", "Целевая доля = вес в индексе × коэффициент")}
            </th>
            <th rowSpan={2} className="num">
              {headerWithHint("Соответствие", "Факт. доля ÷ Цель (1.0 = точное совпадение)")}
            </th>
            <th colSpan={3} className="num th-group">Дивиденды</th>
            <th rowSpan={2}>Сектор</th>
          </tr>
          <tr>
            <th className="num th-group-start">в индексе</th>
            <th className="num th-group-end">
              {headerWithHint("фактический", "Текущая доля позиции в стоимости портфеля, %")}
            </th>
            <th className="num th-group-start">Штук</th>
            <th className="num th-group-end">Стоимость</th>
            <th className="num th-group-start">Штук</th>
            <th className="num th-group-end">На сумму</th>
            <th className="num th-group-start">Размер ₽</th>
            <th className="num">Доходность %</th>
            <th className="num th-group-end">
              {headerWithHint("Доход ₽", "Дивиденд на акцию × количество акций")}
            </th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, index) => (
            <tr key={p.ticker} className={pairRowClass(p.ticker, index, positions, pairedTickers)}>
              <td>
                <span className={`status-dot${p.status === "in_index" ? " status-dot--in" : ""}`} />
              </td>
              <td>{p.ticker}</td>
              <td>{p.shortName}</td>
              <td className="num">{formatNumber(p.indexWeight)}</td>
              <td className="num">{formatNumber(p.actualShare)}</td>
              <td className="num">{formatMoney(p.price)}</td>
              <td className="num">{p.lotSize ?? "—"}</td>
              <td className="num td-editable">
                <input
                  type="number"
                  step="0.01"
                  value={p.coefficient}
                  onChange={(e) => onChangeCoefficient(p.ticker, Number(e.target.value))}
                />
              </td>
              <td className="num td-editable">
                <input
                  type="number"
                  step="1"
                  value={p.manualSharesOwned}
                  onChange={(e) => onChangeSharesOwned(p.ticker, Number(e.target.value))}
                />
                {p.brokerHoldings && p.brokerHoldings.length > 0 && (
                  <span
                    className="th-hint"
                    data-tooltip={buildSharesBreakdownTooltip(p, brokerConnectionsById)}
                    tabIndex={0}
                  >
                    Σ{p.sharesOwned}
                  </span>
                )}
              </td>
              <td className="num">{formatMoneyTruncated(p.positionValue)}</td>
              <td className="num">{formatNumber(p.sharesToBuy, 0)}</td>
              <td className="num">{formatMoney(p.buyAmountRub)}</td>
              <td className="num">{formatNumber(p.targetAllocation)}</td>
              <td className="num">
                <ComplianceGauge value={p.compliance} />
              </td>
              <td className="num">{formatMoney(p.dividendPerShare)}</td>
              <td className="num">{formatNumber(p.dividendYield)}</td>
              <td className="num">{formatMoney(p.income)}</td>
              <td>{p.sector}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
