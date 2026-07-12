# Парные позиции (common/preferred как одна цель по индексу)

Дата: 2026-07-12

> Пользователь может объединить два и более тикера (напр. обычка и
> преф одной компании) в «пару» с общим коэффициентом. Соответствие
> индексу считается по суммарному весу и суммарной стоимости группы,
> а не по каждому тикеру отдельно. Хранится в пользовательском файле
> портфеля. Зависит от колонок «Акций купить»/«Купить на сумму» из
> спеки `2026-07-12-table-dashboard-cleanup-design.md` — расширяет их
> расчёт для членов пары.

## 1. Схема файла

`webapp/src/file/schema.ts`, `portfolioFileSchema` (`:25-30`) получает
новое поле:

```ts
pairs: z.array(
  z.object({
    tickers: z.array(z.string()).min(2),
    coefficient: z.number(),
  })
).default([])
```

Инварианты (проверяются в UI при сохранении пары, не в zod-схеме):
- Тикер не может входить более чем в одну пару.
- В `pairs[].tickers` — только тикеры, присутствующие в `positions[]`.

`positionSchema.coefficient` (`:5-9`) остаётся как есть — не удаляется,
но для тикеров-членов пары значение в `position.coefficient` **не
используется** при расчёте (см. §3). Значение поля у таких позиций
не поддерживается синхронизированным намеренно — источник истины для
пары — `pair.coefficient`.

`PortfolioFile` (`types.ts`) получает соответствующее поле `pairs`.

## 2. Модель хранения коэффициента

Общий коэффициент группы хранится в `pair.coefficient` — отдельно от
per-position `coefficient`. В таблице позиций input «Коэф-т» для
тикера-члена пары:
- читает значение из `pair.coefficient` (не из `position.coefficient`);
- при изменении вызывает обновление `pair.coefficient` — оба тикера
  группы в таблице сразу показывают новое значение (один источник
  данных, не два синхронизируемых поля).

Для тикеров вне пар — поведение не меняется (`position.coefficient`
как сейчас).

## 3. Расчёт (`domain/buildCalculatedPositions.ts`, `domain/calculations.ts`)

Перед вычислением per-position метрик строится карта `ticker → pair`
(`Map<string, { tickers: string[]; coefficient: number }>`).

Для каждой пары:
- `combinedIndexWeight = Σ indexWeight(t)` по тикерам группы; тикер
  вне индекса (`indexWeight` отсутствует/`status !== "in_index"`) даёт
  0 в сумму.
- `combinedTargetPct = combinedIndexWeight * pair.coefficient`
  (аналог `computeTargetAllocation`, но на сумму весов).
- `combinedActualValueRub = Σ (price(t) * sharesOwned(t))`.
- `combinedActualSharePct = combinedActualValueRub / portfolioValue * 100`
  (аналог `computeActualShare`).
- `combinedCompliance = combinedActualSharePct / combinedTargetPct`
  (null, если `combinedTargetPct === 0` — как в `computeCompliance`).

Оба (все) члена пары получают в `CalculatedPosition`:
`targetAllocation = combinedTargetPct`, `actualShare = combinedActualSharePct`,
`compliance = combinedCompliance` — одинаковые числа на всех строках
группы.

Тикеры не в паре — расчёт без изменений (`computeTargetAllocation`
по своему `indexWeight`/`coefficient` и т. д.).

Новая чистая функция в `calculations.ts`: `computePairedTargets(pair, positions, portfolioValue)`
→ `{ targetAllocation, actualShare, compliance }`, вызывается из
`buildCalculatedPositions.ts` вместо per-ticker веток для членов пар.

## 4. Колонки «Акций купить» / «Купить на сумму» для пары

Расширение расчёта из спеки B (`sharesToBuy`, `buyAmountRub`) для
членов пары — пропорционально доле собственного веса в суммарном весе
группы, без двойного счёта:

- `combinedTargetRub = combinedTargetPct / 100 * portfolioValue`.
- Для тикера `t` в паре:
  `targetValueRub(t) = combinedTargetRub * indexWeight(t) / combinedIndexWeight`
  (если `combinedIndexWeight === 0` → `targetValueRub(t) = 0`, обе
  колонки — «—», как у обычной вне-индексной позиции).
- `targetShares(t) = round(targetValueRub(t) / price(t))`.
- `sharesToBuy(t) = targetShares(t) − sharesOwned(t)` (как в спеке B).
- `buyAmountRub(t) = sharesToBuy(t) * price(t)`.

Сумма `targetValueRub(t)` по всем членам группы равна `combinedTargetRub`
— распределение цели без пересечения.

## 5. UI: модалка «Парные позиции»

Новый компонент `webapp/src/components/PairPositionsModal.tsx`, по
образцу `SectorOverrideModal.tsx` (модалка, `<table>`, кнопки
Сохранить/Отмена).

Содержимое:
- Список существующих пар: на пару — строка/блок с перечислением
  тикеров, `<input type="number">` для `pair.coefficient`, кнопка
  «Удалить пару» (просто убирает запись из `pairs[]`, тикеры
  возвращаются к обычному расчёту).
- Форма добавления новой пары: чекбоксы по тикерам из
  `existingPositions`, которые ещё не входят ни в одну пару; текстовое
  поле/инпут коэффициента (по умолчанию `1`, как у новой позиции);
  кнопка «Добавить», активна только если отмечено ≥2 тикера.
- `onSave(pairs)` — сохраняет весь список пар в `file.pairs`.

Открывается из `PortfolioTab.tsx`: новая кнопка «Парные позиции» в
`.action-row` (`:99-106`), рядом с «+ Тикер», по тому же паттерну
(`useState` флаг видимости модалки).

`updateField` (`PortfolioTab.tsx:76-84`) для поля `"coefficient"`
получает доп. проверку: если `ticker` состоит в паре — обновляется
`file.pairs[i].coefficient` вместо `position.coefficient`; иначе —
текущее поведение без изменений.

## 6. Дашборд (спека B, «Наибольший избыток/недостача»)

Для позиции-члена пары дашборд-стат использует то же
`(actualShare − targetAllocation) * portfolioValue / 100`, что уже
одинаково для обоих членов группы (см. §3) — так что при агрегации
max/min по всем позициям пара учитывается **один раз**, не дважды
(группировка по `pair` перед поиском экстремума, а не по отдельным
тикерам).

Лейбл в стат-блоке для парной группы: все тикеры группы через `+`
(напр. `SBER+SBERP +₽12 340`). Для обычной позиции — как в спеке B
(один тикер).

## Затрагиваемые файлы

- `webapp/src/file/schema.ts` — поле `pairs` в `portfolioFileSchema`.
- `webapp/src/types.ts` — `PortfolioFile.pairs`.
- `webapp/src/domain/calculations.ts` — `computePairedTargets`.
- `webapp/src/domain/buildCalculatedPositions.ts` — построение карты
  `ticker → pair`, ветка расчёта для членов пар (включая
  `sharesToBuy`/`buyAmountRub` из спеки B).
- `webapp/src/components/PairPositionsModal.tsx` — новый компонент.
- `webapp/src/components/PortfolioTab.tsx` — кнопка открытия модалки,
  правка `updateField` для коэффициента пары.
- `webapp/src/components/Dashboard.tsx` — группировка по паре при
  поиске max/min отклонения (использует расчёт из спеки B).

Изменений в `iss/` — нет.
