# Доработки модалки пар, таблицы позиций и фильтров

Дата: 2026-07-13

> Девять точечных UI-правок поверх уже реализованных парных позиций
> (`2026-07-12-paired-positions-design.md`) и таблицы/дашборда
> (`2026-07-12-table-dashboard-cleanup-design.md`): порядок элементов в
> модалке пар, группировка/выделение пар в общей таблице,
> переупорядочивание и двухуровневые заголовки колонок, форматирование
> денежных сумм и новый фильтр «Только в индексе».

## 1. Модалка «Парные позиции» (`PairPositionsModal.tsx`)

Новый порядок элементов сверху вниз:

1. `<h2>Парные позиции</h2>`
2. `.modal__actions` (кнопки «Сохранить» / «Отмена») — переносится из
   низа модалки под заголовок.
3. Таблица существующих пар (`draftPairs`) — без изменений в
   содержимом.
4. `<hr class="modal__divider">` — новый элемент.
5. Блок добавления пары: `<input>` веса (`newCoefficientInput`) +
   кнопка «Добавить» — выносятся из общего `.add-ticker__field` в
   отдельный `div` перед списком тикеров.
6. Список чекбоксов тикеров (`availableTickers`).

Внутренняя логика (`draftPairs`, `selectedTickers`,
`newCoefficientInput`, `handleAddPair`, `handleRemovePair`,
`handleChangeCoefficient`) не меняется — меняется только JSX-порядок и
разбивка `.add-ticker__field` на два блока.

`styles.css`: новый класс `.modal__divider` (простая горизонтальная
линия, `border-top` + вертикальные отступы, без анимаций).

## 2. Группировка и выделение пар в общей таблице

### 2.1 Группировка строк

Новая чистая функция `groupPairedPositions` в
`webapp/src/domain/groupPairedPositions.ts`:

```ts
function groupPairedPositions<T extends { ticker: string }>(
  positions: T[],
  pairs: Pair[]
): T[]
```

Правило: пара встаёт на место **первого по исходному порядку** своего
члена; остальные члены пары подтягиваются сразу за ним, в порядке
`pair.tickers`. Позиции вне пар не двигаются относительно друг друга.

Пример: `A, B, C(пара с E), D, E` → `A, B, C, E, D`.

Вызывается в `useCalculatedPositions.ts` сразу после
`buildCalculatedPositions`, перед вычислением `portfolioValue` и
остальных производных — то есть `calculated` уже приходит в
сгруппированном порядке во все потребители (таблица, дашборд).

### 2.2 Визуальное выделение пары

`PositionsTable.tsx`: для каждой строки вычисляется, является ли она
частью пары, и если да — первая/последняя ли она в группе (соседние
строки после группировки §2.1, поэтому достаточно сравнить принадлежность
пары текущей и соседних строк по `file.pairs`).

Классы на `<tr>`:
- `paired-row` — любая строка-член пары (общий чуть более тёмный фон).
- `paired-row--first` — верхняя строка группы (верхняя+левая рамка).
- `paired-row--last` — нижняя строка группы (нижняя+левая рамка).

Реализация в `styles.css`: `.paired-row` — фон; `.paired-row td:first-child`
получает `border-left` (акцентный цвет), `paired-row--first` добавляет
`border-top` на первую ячейку, `paired-row--last` — `border-bottom`,
создавая эффект скобки слева вдоль всей группы. Должно визуально
сочетаться, а не конфликтовать с существующей zebra-полоской
(`tbody tr:nth-child(even)`) — `paired-row` фон переопределяет zebra
через больший specificity/порядок правил.

### 2.3 Поведение фильтров с парами

`filterPositions.ts` получает новый параметр `pairs: Pair[]`:

```ts
function filterPositions(
  positions: CalculatedPosition[],
  pairs: Pair[],
  search: string,
  hideEmpty: boolean,
  onlyInIndex: boolean
): CalculatedPosition[]
```

Алгоритм:
1. Для каждой позиции вычислить `passesOwnFilters` — та же логика, что
   сейчас (поиск по тикеру/названию, `hideEmpty`), плюс новое условие
   `onlyInIndex` (см. §4).
2. Построить `Set<string>` тикеров, которые проходят индивидуально.
3. Для каждой пары: если хотя бы один тикер из `pair.tickers`
   присутствует в этом сете — добавить в сет **все** тикеры пары.
4. Итоговый результат — позиции (в уже сгруппированном порядке из
   §2.1), чей тикер входит в финальный сет.

`PortfolioTab.tsx` передаёт `file.pairs` в `filterPositions`.

## 3. Переупорядочивание колонок и двухуровневый заголовок

Итоговый порядок колонок таблицы (`PositionsTable.tsx`):

```
статус | Тикер | Название | Вес в индексе, % | Факт. вес, % | Цена |
Лотность | Коэф-т | Куплено{штук, стоимость} | Купить{штук, на сумму} |
Цель | Соответствие | Дивиденд | Див доходность, % | Доход | Сектор
```

Изменения относительно текущего порядка:
- «Факт. доля» → переименована в «Факт. вес, %», перемещена сразу
  после «Вес в индексе, %» (было — после «Цель»). Тултип
  (`headerWithHint`, текст «Текущая доля позиции в стоимости портфеля, %»)
  переезжает вместе с колонкой.
- «Стоимость» перемещена сразу после «Куплено» (было — почти в конце,
  перед «Доход»).
- «Дивиденд», «Див доходность, %», «Доход» — перемещены рядом друг с
  другом на предпоследнюю позицию (перед «Сектор»); были — в начале
  таблицы («Дивиденд», «Див доходность») и в конце («Доход»).

### Двухуровневый заголовок

`<thead>` — два `<tr>`:

Верхняя строка: пустые `<th>` с `rowSpan={2}` для всех обычных колонок,
и два `<th colSpan={2}>` — «Куплено» (над sharesOwned+positionValue) и
«Купить» (над sharesToBuy+buyAmountRub).

Нижняя строка: только под группированными парами — `<th>Штук</th>`
`<th>Стоимость</th>` для «Куплено», `<th>Штук</th>` `<th>На сумму</th>`
для «Купить».

Остальные заголовки (статус, Тикер, Название, ..., Сектор) — обычные
`<th rowSpan={2}>` в верхней строке, во второй строке для них ячеек
нет (естественное поведение rowSpan в HTML-таблице).

`styles.css`: `.positions-table th` уже стилизован общим правилом —
добавить точечные правила для группирующих заголовков (`text-align:
center` для верхней строки группы, чтобы «Куплено»/«Купить» были
по центру над двумя колонками).

## 4. Фильтр «Только в индексе»

Новый чекбокс в `.controls-row` (`PortfolioTab.tsx`), рядом со
«Скрывать пустые позиции»:

```tsx
<label>
  <input type="checkbox" checked={onlyInIndex} onChange={...} />
  Только в индексе
</label>
```

Состояние `onlyInIndex`, персистентность через `tablePrefs.ts` —
`loadOnlyInIndexPref`/`saveOnlyInIndexPref`, тот же паттерн
(localStorage), что `hideEmpty`.

Условие в `filterPositions` (§2.3, шаг 1): позиция проходит, если
`!onlyInIndex || p.status === "in_index"` — комбинируется по AND с
`hideEmpty` и текстовым поиском, дальше действует общее правило «пара
целиком, если хоть один член проходит» (§2.3, шаги 2-4).

## 5. Форматирование денежных колонок

`PositionsTable.tsx`: новая функция `formatMoney(value, digits = 2)`
рядом с существующей `formatNumber`:

```ts
function formatMoney(value: number | null, digits = 2): string {
  if (value === null) return "—";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
```

Применяется вместо `formatNumber` к колонкам: Цена, Купить на сумму,
Доход, Дивиденд (2 знака после запятой, разряды разделены
неразрывным пробелом за счёт `ru-RU` локали).

Колонка «Стоимость» — отдельная формула, без общих копеек:

```ts
function formatMoneyTruncated(value: number): string {
  return Math.trunc(value).toLocaleString("ru-RU");
}
```

0 знаков после запятой, значение **всегда** округляется вниз
(`Math.trunc`), не по правилам обычного округления.

Остальные числовые колонки (Вес в индексе, Факт. вес, Лотность,
Коэф-т, Акций купить, Цель, Соответствие, Див доходность) — без
изменений, используют текущий `formatNumber`.

## Затрагиваемые файлы

- `webapp/src/components/PairPositionsModal.tsx` — переупорядочивание
  JSX (§1).
- `webapp/src/styles.css` — `.modal__divider`, `.paired-row` +
  модификаторы, точечные правила для двухуровневого заголовка (§1, §2.2, §3).
- `webapp/src/domain/groupPairedPositions.ts` — новый файл, чистая
  функция группировки (§2.1).
- `webapp/src/portfolio/useCalculatedPositions.ts` — вызов
  `groupPairedPositions` (§2.1).
- `webapp/src/portfolio/filterPositions.ts` — параметры `pairs`,
  `onlyInIndex`, union-логика для пар (§2.3, §4).
- `webapp/src/portfolio/tablePrefs.ts` — `loadOnlyInIndexPref`/
  `saveOnlyInIndexPref` (§4).
- `webapp/src/components/PositionsTable.tsx` — порядок колонок,
  двухуровневый `<thead>`, классы `paired-row*`, `formatMoney`/
  `formatMoneyTruncated` (§2.2, §3, §5).
- `webapp/src/components/PortfolioTab.tsx` — чекбокс «Только в
  индексе», проброс `pairs`/`onlyInIndex` в `filterPositions` (§4).

Изменений в `domain/buildCalculatedPositions.ts`, `domain/calculations.ts`,
`file/schema.ts`, `iss/` — нет.
