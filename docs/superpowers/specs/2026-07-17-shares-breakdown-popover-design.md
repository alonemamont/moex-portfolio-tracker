# Детали количества акций по источникам: клик вместо hover

Дата: 2026-07-17

## Контекст

Разделение позиции по источникам (Т-Банк, Финам, ручной ввод) уже реализовано
в кодовой базе:

- `Position.sharesOwned` — ручной ввод пользователя, никогда не
  перезаписывается синхронизацией с брокером.
- `Position.brokerHoldings: BrokerHolding[]` — по одной записи на
  `connectionId`; `applySyncDiff` при синхронизации полностью заменяет только
  запись своего подключения, остальные источники не трогает.
- `computeTotalSharesOwned` суммирует ручной ввод и все `brokerHoldings` —
  это и есть итог, который видит пользователь в столбце «Куплено».
- Разбивку по источникам показывает `buildSharesBreakdownTooltip`
  (`domain/sharesBreakdown.ts`) — собирает строку вида
  `"Т-Банк: 10, Финам: 5, Вручную: 2 = 17"` и рендерится в `PositionsTable.tsx`
  и `PositionCard.tsx` через CSS-тултип (`.th-hint[data-tooltip]:hover/:focus`).

Единственный пробел: раскрытие деталей работает по наведению/фокусу, а не по
клику. На тач-устройствах `span[tabIndex]` не всегда получает фокус по тапу
(особенно в мобильном Safari), а строковый тултип неудобно читать построчно.
Эта спецификация покрывает только переход hover-тултипа в click-попап со
структурированным списком строк.

## Модель данных

`sharesBreakdown.ts` меняет форму возвращаемого значения: вместо готовой
строки — массив строк для рендера.

```ts
export interface SharesBreakdownRow {
  label: string;
  shares: number;
}

export function buildSharesBreakdownRows(
  position: Pick<CalculatedPosition, "manualSharesOwned" | "brokerHoldings">,
  labelByConnectionId: Map<string, string>
): SharesBreakdownRow[]
```

Порядок строк: сперва брокерские источники в порядке `position.brokerHoldings`
(label — из `labelByConnectionId`, при отсутствии — сырой `connectionId`,
как сейчас), последней — строка ручного ввода (`label: "Вручную"`).
Итоговая сумма (`position.sharesOwned`) в массив не входит — её передаёт
компонент отдельным пропом `total`, чтобы функция отвечала только за разбивку.

`buildSharesBreakdownTooltip` и её тест удаляются целиком — второй способ
получить ту же информацию не нужен (YAGNI), новый билдер полностью её
заменяет.

## Компонент

Новый файл `components/SharesBreakdownPopover.tsx` — самостоятельный юнит с
одной задачей: показать Σ-бейдж и по клику раскрыть/скрыть панель с
разбивкой.

```tsx
function SharesBreakdownPopover({
  rows,
  total,
}: {
  rows: SharesBreakdownRow[];
  total: number;
})
```

- Корневой `<span className="shares-popover" ref={containerRef}>`.
- Триггер — настоящий `<button type="button" className="shares-popover__trigger" aria-expanded={open}>Σ{total}</button>`.
  Именно `button`, а не `span[tabIndex]`: кнопки получают фокус по тапу во
  всех браузерах, включая мобильный Safari, где непунктуемые элементы часто
  фокус не получают.
- Панель рендерится только при `open === true`:
  `<div className="shares-popover__panel" role="dialog">` со строкой на
  каждый `row` (`label` слева, `shares` справа) и итоговой строкой
  (`Итого: {total}`), визуально отделённой (border-top).
- Открытие/закрытие — локальный `useState<boolean>`.
- Закрытие по клику вне панели: `useEffect`, пока `open === true`, вешает
  `mousedown`-листенер на `document`, закрывает при клике вне
  `containerRef.current`.
- Закрытие по `Escape`: тот же эффект, `keydown`-листенер.
- Один открытый попап за раз не форсируется намеренно — состояние локально
  для каждой строки таблицы, это не требует координации между строками.

## Интеграция

В `PositionsTable.tsx` и `PositionCard.tsx` блок

```tsx
{p.brokerHoldings && p.brokerHoldings.length > 0 && (
  <span className="th-hint" data-tooltip={buildSharesBreakdownTooltip(p, brokerConnectionsById)} tabIndex={0}>
    Σ{p.sharesOwned}
  </span>
)}
```

заменяется на

```tsx
{p.brokerHoldings && p.brokerHoldings.length > 0 && (
  <SharesBreakdownPopover
    rows={buildSharesBreakdownRows(p, brokerConnectionsById)}
    total={p.sharesOwned}
  />
)}
```

`headerWithHint` (hover-подсказки в заголовках столбцов, тот же `.th-hint`
класс) не меняется — другая задача, другой пользовательский сценарий
(статичный текст-объяснение, не разбивка по источникам).

## Стили

Новые классы, не пересекающиеся с `.th-hint`:

- `.shares-popover` — `position: relative; display: inline-block;`
- `.shares-popover__trigger` — визуально тот же кружок-бейдж, что был у
  `.th-hint` (размер, шрифт, рамка), но `cursor: pointer` вместо `help`, и
  сброшены дефолтные стили `<button>` (background, border взяты из текущего
  `.th-hint`, а не браузерные).
- `.shares-popover__panel` — тот же визуальный бокс, что был у
  `::after`-тултипа (`position: absolute; top: 100%; left: 0; z-index: 100`,
  фон/рамка/тень/ширина ~220px), но реальный DOM-узел со строками, а не
  генерируемый контент.
- `.shares-popover__row` — `display: flex; justify-content: space-between;
  gap: 8px;`, итоговая строка — `border-top`, `font-weight`.

## Тесты

- `sharesBreakdown.test.ts` переписывается под `buildSharesBreakdownRows`,
  проверяет тот же порядок и fallback на `connectionId`, но сравнивает
  массивы объектов, а не строки.
- Новый `SharesBreakdownPopover.test.tsx` (React Testing Library):
  - по умолчанию панель закрыта;
  - клик по триггеру открывает панель, показывает все строки и итог;
  - повторный клик по триггеру закрывает;
  - клик вне компонента закрывает открытую панель;
  - `Escape` закрывает открытую панель.

## Вне объёма

- Изменение самой модели хранения по источникам — она уже реализована и не
  меняется.
- Позиционирование панели с учётом краёв экрана (viewport collision) —
  панель всегда открывается вниз-влево, как было у тултипа.
