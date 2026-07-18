# Разные коэффициенты для членов пары

Дата: 2026-07-18

> Расширяет `2026-07-12-paired-positions-design.md`. Сейчас у пары
> один общий `coefficient`, применяется одинаково ко всем тикерам
> группы. Задача — разрешить свой коэффициент на каждый тикер пары
> (напр. SBER коэф. 1.15, SBERP коэф. 1.10 — как в исходной Excel-
> таблице пользователя, где у SBER/SBERP разные `G`).

## 1. Схема / модель данных

`Pair` (`types.ts`) и `pairSchema` (`file/schema.ts`):

```ts
interface Pair {
  tickers: string[];
  coefficients: Record<string, number>; // ticker -> coefficient
}
```

Поле `coefficient: number` удаляется из `Pair`.

**Миграция старых файлов.** `pairSchema` — `z.preprocess`, который
принимает старую форму `{ tickers, coefficient }` и разворачивает её
в `{ tickers, coefficients: { [ticker]: coefficient для каждого tickers } }`
до валидации. Новая форма `{ tickers, coefficients }` проходит как
есть. Так старый `portfolio.json` с общим `coefficient` открывается
без потери данных — каждый тикер получает то же значение, что было
общим.

`position.coefficient` для тикеров-членов пары по-прежнему не
используется в расчёте (как в §1 исходной спеки) — не трогаем.

## 2. Расчёт (`domain/calculations.ts`, `domain/buildCalculatedPositions.ts`)

Ключевое изменение: вместо «общая цель по сумме весов → делим по доле
веса» — каждый тикер считает свой вклад в цель независимо, как в
Excel (`K = C1 * F * G / H`, свой `G` на тикер).

**`computePairedTargets`** (для отображаемых `targetAllocation` /
`actualShare` / `compliance` — одинаковые на всех строках группы, без
изменений в этой части):

- `combinedTargetPct = Σ (indexWeight(t) * coefficients[t])` по
  тикерам группы, тикер вне индекса даёт 0 (как раньше, только вместо
  `combinedIndexWeight * pair.coefficient` — сумма произведений).
- Остальное (`combinedActualValueRub`, `actualShare`, `compliance`) —
  без изменений.

**Целевые акции на тикер (`sharesToBuy` / `buyAmountRub`)** — вместо
пропорционального дележа комбинированной цели, каждый член пары
считается как независимая позиция через уже существующие
`computeTargetAllocation` / `computeTargetShares`:

```
individualTargetAllocation = computeTargetAllocation(
  live.indexWeight, pair.coefficients[ticker], live.status
)
targetShares = computeTargetShares(individualTargetAllocation, portfolioValue, live.price)
sharesToBuy = computeSharesToBuy(targetShares, totalShares)
buyAmountRub = computeBuyAmountRub(sharesToBuy, live.price)
```

Тикер вне индекса → `individualTargetAllocation === null` →
`sharesToBuy`/`buyAmountRub === null` (как у обычной вне-индексной
позиции, поведение не меняется по сравнению с текущими тестами).

**Удаляются** (становятся мёртвым кодом, вся логика свёрнута в
описанное выше):
- `computePairMemberTargetShares` — ratio-split больше не нужен,
  замена — прямой вызов `computeTargetAllocation` + `computeTargetShares`.
- `computeCombinedIndexWeight` — использовался только для ratio-split
  и как множитель на `pair.coefficient`; оба места заменены.

`buildCalculatedPositions.ts`: ветка для членов пары читает
`coefficient = pair.coefficients[position.ticker]` вместо
`pair.coefficient`.

## 3. UI

**`PositionsTable.tsx` / `PositionCard.tsx`** — без изменений: инпут
«Коэф-т» уже на уровне строки (тикера), просто теперь пишет в
`pair.coefficients[ticker]` вместо целого `pair.coefficient`.

**`PortfolioTab.tsx`, `updateField`** — при `field === "coefficient"`
и тикере, состоящем в паре, обновляется
`pairs[i].coefficients[ticker] = value` (immutable merge на уровне
`coefficients`-объекта), а не замена всего `pair.coefficient`.

**`PairPositionsModal.tsx`** — в списке существующих пар вместо
одного инпута на пару выводится по одному инпуту на тикер (строка
пары → под-список `тикер + инпут коэффициента`). Форма добавления
новой пары не меняется: один инпут «Коэффициент» (по умолчанию `1`)
применяется ко всем выбранным тикерам при создании пары — тонкая
настройка по тикеру доступна сразу после создания (в этой же модалке
или через `PositionsTable`).

## 4. Тесты к обновлению

- `calculations.test.ts`: `describe("computePairedTargets")` — новый
  формат `pair.coefficients`, новая арифметика (`Σ weight*coeff`).
  `describe("computePairMemberTargetShares")` и
  `describe("computeCombinedIndexWeight")` — удаляются вместе с
  функциями.
- `buildCalculatedPositions.test.ts` — 3 существующих кейса на пары
  (строки ~116, ~144, ~170 на момент написания) переписываются под
  `coefficients: Record<string, number>` и новую (независимую
  по тикеру) арифметику `sharesToBuy`/`buyAmountRub`; добавить кейс с
  **разными** коэффициентами на членов (напр. SBER=1.15, SBERP=1.10),
  подтверждающий независимый расчёт по каждому.
- `schema.test.ts` — новый кейс: загрузка старого файла с
  `pair.coefficient` (число) корректно мигрирует в `coefficients`.
- `PairPositionsModal` (если есть тест-файл) — обновить под
  per-тикерные инпуты.

## Затрагиваемые файлы

- `webapp/src/types.ts` — `Pair.coefficients`.
- `webapp/src/file/schema.ts` — `pairSchema` + preprocess-миграция.
- `webapp/src/domain/calculations.ts` — `computePairedTargets`
  (новая арифметика), удаление `computePairMemberTargetShares` и
  `computeCombinedIndexWeight`.
- `webapp/src/domain/buildCalculatedPositions.ts` — ветка для членов
  пары: чтение `coefficients[ticker]`, прямой вызов
  `computeTargetAllocation`/`computeTargetShares` вместо ratio-split.
- `webapp/src/components/PortfolioTab.tsx` — `updateField` пишет в
  `coefficients[ticker]`.
- `webapp/src/components/PairPositionsModal.tsx` — per-тикерные
  инпуты коэффициента в списке существующих пар.
- Тесты, перечисленные в §4.

Изменений в `iss/`, `PositionsTable.tsx`, `PositionCard.tsx`,
`Dashboard.tsx`, `groupPairedPositions.ts`, `filterPositions.ts` — нет.
