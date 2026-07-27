# Режимы ребаланса (buy-only план покупок)

Дата: 2026-07-27

> Первая фича из backlog улучшения трекера. Локальный файл / без
> backend не меняются. Панель рекомендаций: **не мутирует** портфель.
> Платформы: **web + desktop (Tauri)**. Отдельный mobile layout вне
> скоупа.

Связанный контекст: построчные `sharesToBuy` / `buyAmountRub` в
`domain/calculations.ts` остаются «идеалом до цели по каждой
позиции». Ребаланс — согласованный план под **бюджет** по всему
портфелю относительно **текущего выбранного индекса**.

## 1. Цель

Дать пользователю ответ: «при бюджете N ₽ что купить, чтобы ближе к
целевой структуре индекса», без продаж и без записи в
`PortfolioFile`.

## 2. Скоуп

**В скоупе v1**

- Вкладка «Ребаланс» (web + desktop).
- Режимы UI:
  - `budget` — «На сумму N ₽»
  - `free_cash` — «Весь свободный кэш» (то же поле суммы; явная
    cash-позиция в файле — отдельная будущая фича)
  - `min_trades` — «Мин. сделок» (авто-K + тот же бюджет)
- Buy-only. Алгоритм: пропорционально shortfall ₽, lot-round с
  дорогих бумаг first.
- Парные позиции = один shortfall-unit; внутри пары split по
  `indexWeight * coefficient` членов in_index.
- Экспорт плана: copy TSV/CSV + download CSV.
- Учёт `selectedIndex` из Header: смена индекса → пересчёт плана
  (через те же calculated positions, что и вкладка Портфель).

**Вне скоупа v1**

- Продажи, ордера брокеру, «применить к портфелю».
- Явная валюта/кэш-позиция в `PortfolioFile`.
- Quiet mode, див-календарь, sector weights, обзор без индекса.
- Отдельный mobile/card layout.
- Persist prefs режима/бюджета (можно добавить позже через
  localStorage; v1 — React state вкладки).

## 3. Инварианты

1. **Read-only:** план не вызывает `setFile`, не меняет shares,
   coefficients, pairs, transactions, broker holdings.
2. **Индекс:** нет собственного селектора индекса у панели; только
   mirror/badge текущего `selectedIndex`.
3. **Buy-only:** в плане нет отрицательных shares/lots.
4. **Бюджет обязателен** во всех режимах; без суммы / при 0 план не
   считается (пустое состояние с подсказкой).
5. `budget` и `free_cash` — одна математика, разный UX-label.
6. Колонки таблицы портфеля `sharesToBuy` / `buyAmountRub` не
   пересчитываются режимом ребаланса.

## 4. Модель кандидатов (units)

Unit = одиночный тикер **или** пара целиком.

- Берутся только единицы с целевой структурой относительно текущего
  индекса: status in_index / для пары `targetAllocation > 0` из
  `computePairedTargets`.
- `shortfallRub = max(0, -deviationRub)`, где
  `deviationRub = (actualShare - targetAllocation) * portfolioValue / 100`
  (как `computeDeviationRub`).
- Для пары deviation/compliance — от агрегированных paired targets.
- Overweight (`shortfallRub === 0`) в кандидаты не входят.
- Member пары out_of_index: не получает долю при split внутри пары.

## 5. Алгоритм

Чистый модуль `webapp/src/domain/rebalancePlan.ts`:

```ts
buildRebalancePlan(input): RebalancePlan
```

Вход: units (или позиции + pairs + portfolioValue + live-поля),
`budgetRub`, `mode`, опционально `complianceGainThreshold`
(default `0.01`). Порог — абсолютный прирост **avg compliance**
(то же число, что Dashboard «Среднее соответствие»: среднее
`actualShare/targetAllocation` по in_index / парам). Пример:
было 0.94, стало 0.95 → прирост 0.01 ≥ default порога.

### 5.1 Режимы `budget` / `free_cash`

1. Отфильтровать units с `shortfallRub > 0`. Если пусто → пустой план.
2. `totalShortfall = sum(shortfallRub)`.
3. Сырое выделение: `rawRub_i = budgetRub * (shortfallRub_i / totalShortfall)`.
4. Lot-round в порядке **убывания цены**:
   - репрезентативная цена unit: одиночный — `price`; пара —
     **max price** среди in_index members с валидной ценой
   - обход units price-desc; внутри пары members тоже price-desc
   - целевые ₽ → shares → floor к `lotSize` (`lotSize == null` → 1)
   - `spend = lots * lotSize * price`; уменьшить лоты, пока
     `spend <= remainingBudget`
   - остаток бюджета переходит к следующим
5. Пара: `rawRub` на пару → split member’ам пропорционально
   `indexWeight * coefficient` (только in_index, нормализовать) →
   lot-round members **price desc**.
6. Итог: строки `{ ticker, lots, shares, spendRub, unitId }` +
   `spentTotal`, `leftoverRub`, прогноз `avgComplianceAfter`
   (виртуальные shares = owned + planShares; те же формулы
   compliance / paired targets). Файл не трогать.

### 5.2 Режим `min_trades`

1. Упорядочить кандидатов по `shortfallRub` desc.
2. Набор S пустой. По очереди пробовать добавить следующий unit в S.
3. На текущем S распределить **весь** `budgetRub` алгоритмом §5.1
   (proportional + lot-round) **только по S**.
4. Если прирост прогнозного avg compliance относительно плана без
   этого unit ≥ `complianceGainThreshold` — принять unit в S;
   иначе стоп (unit не включать).
5. Если даже первый unit не проходит порог → пустой план +
   пояснение «порог не достигнут».
6. Без `budgetRub` не считать.

### 5.3 Края

- `price == null` или `price === 0` → unit/member пропускается в
  исполняемых строках; не списывать бюджет «в никуда».
- После lot-round ни одной строки с lots > 0 (бюджет не тянет
  даже 1 лот) → пустой план + «бюджет слишком мал».
- Пары без in_index members / `targetAllocation === 0` — не
  кандидаты.

## 6. UI

**Вкладка** `Ребаланс` в `App.tsx` рядом с Портфель / Графики /
Сектора / Транзакции. Один layout для web и desktop.

**Шапка**

- Сегмент mode: На сумму | Свободный кэш | Мин. сделок
- Поле бюджета (₽)
- При мин. сделок — поле порога прироста compliance + короткий hint
- Badge текущего индекса (`selectedIndex`), read-only
- Явная подпись: рекомендации, портфель не меняется

**Таблица плана**

| Unit | Тикер | Лоты | Акции | Сумма ₽ | Shortfall до | Shortfall после (sim) |

Пары — группа с member-строками.

**Итоги:** потрачено / остаток; avg compliance сейчас → после;
число сделок (строк с lots > 0).

**Actions:** копировать TSV/CSV; скачать CSV. Нет «Применить».

**Пустые состояния:** нет файла/live; бюджет не задан; shortfall=0;
порог min_trades; бюджет слишком мал.

## 7. Архитектура компонентов

| Кусок | Роль |
|---|---|
| `domain/rebalancePlan.ts` | pure `buildRebalancePlan` |
| `domain/rebalancePlan.test.ts` | Vitest |
| `components/RebalanceTab.tsx` | controls + table + export |
| optional `useRebalancePlan` | тонкая обёртка над `useCalculatedPositions` + state вкладочных контролов |

Не меняет `PortfolioFile` schema / version.

## 8. Тесты

Domain (обязательно):

- proportional split по shortfall
- lot-round price-desc и leftover бюджета
- pair split по coefficients; out_of_index member = 0
- min_trades: авто-K стоп на пороге; budget обязателен
- buy-only: нет отрицательных shares
- skip null/zero price
- бюджет < 1 лота → пустой план

Wiring (по возможности лёгкий component/hook test):

- смена входных calculated positions (как после смены индекса)
  меняет план
- контролы не вызывают `setFile`

## 9. Backlog (не этот spec)

После v1, отдельными спеками: явная cash-позиция; quiet mode;
sector weights портфель vs индекс; дивдоходность + календарь;
обзор портфеля без привязки к индексу; продажи / apply.

## 10. Acceptance

1. При бюджете N план buy-only, sum(spend) ≤ N, лоты кратны lotSize.
2. `budget` и `free_cash` дают одинаковый план при одинаковом N.
3. `min_trades` трогает меньше или равное число units, чем полный
   proportional по всем shortfall при том же бюджете (при
   разумном пороге).
4. Смена индекса в Header пересчитывает план без ручного reset.
5. Никакое действие на вкладке не меняет сохранённый/в-памяти
   `PortfolioFile` (кроме будущего явного apply — которого в v1 нет).
6. Работает в браузере и в Tauri desktop одинаково по UX.
