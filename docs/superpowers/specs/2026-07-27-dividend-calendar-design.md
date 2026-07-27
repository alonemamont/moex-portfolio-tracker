# Календарь дивидендов (ближайшие отсечки)

Дата: 2026-07-27

> Вторая фича backlog после режимов ребаланса. Локальный файл / без
> backend. Платформы: **web + desktop (Tauri)**. Отдельный mobile layout
> вне скоупа. Приложение не в релизе — **миграция старых файлов не
> требуется** (zod `.default` для новых полей допустим как удобство
> парса, не как поддержка legacy shapes).

## 1. Цель

Вкладка «Дивиденды»: календарь **будущих** дат отсечки
(`registryclosedate` из MOEX ISS) по позициям с ненулевым количеством
акций, с максимумом полезных полей (₽/акция, ожидаемый доход, yield).

## 2. Скоуп

**В скоупе v1**

- Новая вкладка «Дивиденды».
- Кнопка **Обновить дивиденды** только на этой вкладке (не смешивать с
  рыночным Update).
- При открытии вкладки — показать данные из текущего `PortfolioFile` в
  памяти (последнее сохранённое / уже обновлённое в сессии).
- Успешный Update → сразу UI + `setFile` (файл dirty); запись на диск —
  только через общую кнопку **Сохранить** портфеля.
- Тикеры: calculated positions с `sharesOwned > 0` (total, включая
  broker holdings).
- Строка события: тикер, дата отсечки, ₽/акция, акций, ожидаемый доход
  ₽, yield % (если цена есть).
- Empty без данных в file: «Нажмите Обновить».
- Empty после Update без future-дат: «Ближайших отсечек в ISS нет».
- Хранение полной ленты ISS по выбранным тикерам в файле; UI фильтрует
  `registryCloseDate >= today` (локальная календарная дата).
- `fetchLatestDividend` для рынка **не ломать**; history — отдельный API.

**Вне скоупа v1**

- Прошлые выплаты / переключатель «Недавние».
- Агрегат дивдоходности портфеля как отдельная аналитика (сумма
  ожидаемого дохода по видимым строкам — ок в footer вкладки).
- Автоfetch при открытии вкладки.
- Дата выплаты на счёт (ISS обычно даёт только отсечку).
- Миграция/поддержка старых portfolio.json без новых полей как
  отдельный product requirement (defaults достаточно).

## 3. Инварианты

1. Рыночный Update **не** перезаписывает `dividendEvents` /
   `dividendsFetchedAt`.
2. Update дивидендов при полном сетевом fail **не** трогает `file`.
3. Save портфеля — единственная запись на диск; одна кнопка на всё.
4. Календарь UI — только future относительно локального «сегодня».
5. Доход и yield **не** персистятся — считают на лету из shares + price.
6. Read path: нет аккаунта / своего backend.

## 4. Модель данных

```ts
interface DividendEvent {
  ticker: string;
  registryCloseDate: string; // YYYY-MM-DD, ISS registryclosedate
  valuePerShare: number;
}

interface PortfolioFile {
  version: 1;
  // ...existing fields...
  dividendEvents: DividendEvent[];
  dividendsFetchedAt: string | null; // ISO, последний успешный Update на вкладке
}
```

- `createEmptyPortfolio`: `dividendEvents: []`, `dividendsFetchedAt: null`.
- Schema: zod с `.default([])` / `.default(null)` для удобства.
- Успешный Update **заменяет** весь `dividendEvents` свежим снимком по
  текущим тикерам с shares > 0 (не merge) — нет stale после продажи.
- События в файле сортировать: дата asc, затем тикер.

## 5. ISS и оркестрация Update

**Клиент**

- `fetchDividendHistory(ticker)` → все строки
  `{ registryCloseDate, valuePerShare }` из
  `/securities/{ticker}/dividends.xml` (тот же endpoint, что latest).
- `fetchDividendHistoriesForTickers(tickers, concurrency = 5)` — pLimit
  как у latest; ошибка одного тикера → пустой список для него (не
  валить весь batch); опционально собрать список failed tickers для
  warning.

**Оркестрация на вкладке**

1. Тикеры = unique tickers из calculated с `sharesOwned > 0`.
2. Если список пуст → не ходить в сеть; empty «Нет позиций с акциями»
   (или эквивалент).
3. Fetch histories.
4. Полный fail транспорта/ISS → ErrorPanel; `file` не менять.
5. Успех (в т.ч. частичный по тикерам) →
   `setFile({ ...file, dividendEvents, dividendsFetchedAt: nowISO })`.
6. При частичных fail тикеров — показать данные + warning в ErrorPanel.

## 6. View model календаря

Чистый `domain/dividendCalendar.ts`:

```ts
buildUpcomingDividendRows(input: {
  events: DividendEvent[];
  positions: { ticker: string; sharesOwned: number; price: number | null }[];
  today: string; // YYYY-MM-DD local
}): UpcomingDividendRow[]
```

- Фильтр: `registryCloseDate >= today`.
- Join shares/price по тикеру.
- `expectedIncome = valuePerShare * sharesOwned`.
- `yieldPct = price ? (valuePerShare / price) * 100 : null`.
- Сорт: дата asc, тикер asc.
- Агрегат footer: `sum(expectedIncome)` по видимым строкам.

## 7. UI

Вкладка в `App.tsx` рядом с существующими.

**Шапка**

- Кнопка «Обновить дивиденды» (disabled пока идёт fetch).
- «Обновлено: {dividendsFetchedAt formatted | —}».
- Подпись: данные сохраняются общей кнопкой «Сохранить».

**Таблица**

| Тикер | Отсечка | ₽/акция | Акций | Ожид. доход ₽ | Yield % |

**Итог:** сумма ожидаемого дохода.

**Empty**

- `dividendEvents.length === 0` (и не после только что пустого
  успешного fetch с данными) → «Нажмите Обновить».
- Есть events, upcoming пуст → «Ближайших отсечек в ISS нет».
- Нет позиций с shares > 0 → отдельное пустое состояние без fetch.

Web + desktop, один layout.

## 8. Архитектура файлов

| Файл | Роль |
|---|---|
| `iss/client.ts` (+ tests) | history fetch |
| `domain/dividendCalendar.ts` (+ tests) | filter + enrich |
| `components/DividendsTab.tsx` (+ tests) | UI + update orchestration |
| `types.ts`, `file/schema.ts`, `createEmptyPortfolio.ts` | модель |
| `App.tsx`, `styles.css` | вкладка + стили |

## 9. Тесты

- Parse history rows; latest-compatible endpoint.
- `buildUpcomingDividendRows`: future filter, income, null yield, sort.
- Schema defaults / empty portfolio includes new fields.
- Tab: empty copy; successful update path mocks ISS и проверяет
  `setFile` payload; network fail → `setFile` not called with new events.

## 10. Acceptance

1. Открыл вкладку без events → «Нажмите Обновить».
2. Update успех → future-строки или «Ближайших отсечек в ISS нет»;
   `dividendsFetchedAt` в памяти.
3. Reload без Save → состояние из файла (пусто/старое).
4. Save → events в JSON; reopen → те же.
5. Только shares > 0; колонки max; рыночный Update не трогает
   `dividendEvents`.
6. Одинаково в браузере и Tauri desktop.

## 11. Backlog (не этот spec)

- Агрегат дивдоходности портфеля / календарь прошлых.
- Sector weights, quiet mode, cash-позиция, обзор без индекса.
- Apply ребаланса (отдельная линия).
