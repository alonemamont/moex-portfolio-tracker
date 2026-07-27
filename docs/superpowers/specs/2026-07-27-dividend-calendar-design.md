# Календарь дивидендов (сегодня и будущие отсечки)

Дата: 2026-07-27  
Обновлено: 2026-07-27 (review fixes §1–12)

> Вторая фича backlog после режимов ребаланса. Локальный файл / без
> backend. Платформы: **web + desktop (Tauri)**. Отдельный mobile layout
> вне скоупа. Приложение не в релизе — **миграция старых файлов не
> требуется** (zod `.default` для новых полей допустим как удобство
> парса, не как поддержка legacy shapes).

## 1. Цель

Вкладка «Дивиденды»: календарь отсечек **на сегодня и в будущем**
(`registryclosedate` из MOEX ISS, фильтр `>= today`) по позициям с
ненулевым количеством акций, с максимумом полезных полей (₽/акция,
ориентировочный ожидаемый доход, доходность события к текущей цене).

## 2. Скоуп

**В скоупе v1**

- Новая вкладка «Дивиденды».
- Кнопка **Обновить дивиденды** только на этой вкладке.
- Открытие вкладки → данные из текущего `PortfolioFile` в памяти.
- Успешный Update (не полный fail) → UI + functional `setFile`; на диск —
  только общая **Сохранить**.
- Тикеры запроса: calculated с `sharesOwned > 0` (total, включая broker).
- Колонки: тикер, отсечка, ₽/акция, акций, ожид. доход ₽, доходность
  события %.
- Empty-state по §7 (формальные правила).
- В файле хранится лента событий по owned-тикерам; UI фильтрует
  `registryCloseDate >= today` (локальная календарная дата пользователя).
- `fetchLatestDividend` для рынка **не ломать**; history — отдельный API.

**Вне скоупа v1**

- Прошлые выплаты / переключатель «Недавние».
- Годовая дивдоходность портфеля как отдельная аналитика.
- Автоfetch при открытии вкладки.
- Дата выплаты на счёт.
- Миграция legacy portfolio.json как product requirement.

## 3. Инварианты

1. Рыночный Update **не** перезаписывает `dividendEvents` /
   `dividendsFetchedAt`.
2. Полный fail дивидендного Update **не** трогает `file` (см. §5).
3. Save портфеля — единственная запись на диск.
4. UI-календарь: `registryCloseDate >= today` (сегодня **включается**).
5. Доход и доходность события **не** персистятся.
6. Нет аккаунта / своего backend.
7. Тикеры нормализуются `trim().toUpperCase()` везде (fetch URL key,
   storage, join) — как в `buildCalculatedPositions` / tickerValidation.
8. Dividend fetch имеет **свой** `isDividendsUpdating`; может идти
   **параллельно** с рыночным `isUpdating`. Кнопка «Обновить дивиденды»
   disabled только от `isDividendsUpdating`. Рыночные кнопки не
   блокируются дивидендным fetch и наоборот.

## 4. Модель данных

```ts
interface DividendEvent {
  ticker: string; // always UPPERCASE trimmed
  registryCloseDate: string; // YYYY-MM-DD, validated calendar date
  valuePerShare: number; // finite, > 0
}

interface PortfolioFile {
  version: 1;
  // ...existing...
  dividendEvents: DividendEvent[];
  dividendsFetchedAt: string | null; // ISO; null = ещё никогда успешно не обновляли
}
```

- `createEmptyPortfolio`: `[]` / `null`.
- Schema: zod `.default([])` / `.default(null)`.
- События в файле: сорт дата asc, тикер asc.

### 4.1 Политика снимка при Update (partial fail)

**Не** «всегда заменить всё слепым полным snapshot».

После fetch строится новый `dividendEvents` так:

1. `ownedNow` = тикеры с `sharesOwned > 0` на момент **apply**
   (functional `setFile`, актуальный `current`).
2. Для каждого `t ∈ ownedNow`:
   - если `t ∈ succeededTickers` → взять **новые** распарсенные события `t`;
   - иначе → **сохранить** прежние события `t` из `current.dividendEvents`
     (failed или не запрашивался из‑за гонки).
3. События тикеров ∉ `ownedNow` **удалить** (проданы / обнулены).
4. `dividendsFetchedAt = nowISO` только если `succeededTickers.length > 0`
   (был хотя бы один успешный тикер).

Итог: упавший тикер не теряет сохранённую историю; проданный — вычищается;
успешный — полностью заменяется свежей лентой.

## 5. ISS клиент и оркестрация

### 5.1 Endpoint / пагинация

- URL: `GET {ISS_BASE}/securities/{encodeURIComponent(ticker)}/dividends.xml`
  (ticker уже UPPERCASE).
- **Один запрос на тикер.** Берём **все** `<row>` из блока
  `data id="dividends"`. Пагинация `start`/`limit` **не** используется:
  текущий контракт ISS для dividends отдаёт ленту одним блоком (как
  существующий `fetchLatestDividend`). Если блок пуст — валидный пустой
  результат для тикера, не ошибка.
- Известное ограничение v1: если ISS когда‑либо начнёт резать ответ без
  явной пагинации в клиенте — полнота не гарантирована; отдельный
  follow-up, не скрывать в «магическом merge».

### 5.2 Parse / filter / dedupe одной истории тикера

Из каждого row:

| Поле | Правило |
|---|---|
| `registryclosedate` | trim; должен матчить `^\d{4}-\d{2}-\d{2}$` **и** быть реальной календарной датой (reject `2024-02-31` и т.п.) |
| `value` | `Number(value)`; принять только `Number.isFinite(n) && n > 0` |

Строки, не прошедшие правила — **отбросить** (не ошибка тикера).

Dedupe: ключ `${registryCloseDate}|${valuePerShare}`; при дублях оставить
одну запись. Сорт даты asc.

Пустой список после фильтра — успех тикера с `[]`.

### 5.3 Batch API (обязательный контракт)

```ts
interface DividendHistoryBatchResult {
  eventsByTicker: Map<string, DividendEvent[]>; // keys UPPERCASE; only succeeded
  failedTickers: string[];
  succeededTickers: string[];
}

fetchDividendHistoriesForTickers(tickers: string[], concurrency?: number)
  : Promise<DividendHistoryBatchResult>
```

- На тикер: сеть/HTTP/parse throw → тикер в `failedTickers`, **не** в
  `eventsByTicker`.
- Успех (в т.ч. пустой `[]`) → `succeededTickers` + запись в map.
- **Полный fail batch** = `succeededTickers.length === 0`
  (все тикеры упали **или** входной список был пуст после нормализации —
  пустой вход оркестратор не должен слать; см. ниже).
- Транспортный abort всего Promise — оркестратор трактует как полный fail
  (file не трогать).

`fetchDividendHistory(ticker)` может остаться низкоуровневым хелпером;
batch — единственный контракт для UI.

### 5.4 Оркестрация вкладки

1. Если нет позиций с `sharesOwned > 0` → **не** ходить в сеть; empty
   «Нет позиций с акциями».
2. `requestedTickers` = unique normalized tickers.
3. `setIsDividendsUpdating(true)`; clear dividend error source.
4. Await batch.
5. Если `succeededTickers.length === 0` → ErrorPanel («Не удалось
   обновить дивиденды»); **file не менять**; stop.
6. Иначе functional update:

```ts
setFile((current) => {
  if (!current) return current;
  const ownedNow = /* shares>0 from current + live, normalized */;
  const nextEvents = mergeDividendSnapshot({
    previous: current.dividendEvents,
    ownedNow,
    eventsByTicker: result.eventsByTicker,
    succeededTickers: result.succeededTickers,
  });
  return {
    ...current,
    dividendEvents: nextEvents,
    dividendsFetchedAt: new Date().toISOString(),
  };
});
```

7. Если `failedTickers.length > 0` → warning в ErrorPanel со списком
   тикеров (данные успешных уже применены).
8. `setIsDividendsUpdating(false)` в `finally`.

**Гонка набора тикеров:** apply всегда относительно `ownedNow` на шаге
setFile (п.4.1). Результаты fetch по тикерам, которых уже нет в
`ownedNow`, отбрасываются. Тикеры, появившиеся во время fetch и не
входившие в `requestedTickers`, сохраняют старые events (обычно `[]`)
до следующего Update.

## 6. View model

`domain/dividendCalendar.ts`:

```ts
buildUpcomingDividendRows(input: {
  events: DividendEvent[];
  positions: { ticker: string; sharesOwned: number; price: number | null }[];
  today: string; // local YYYY-MM-DD
}): UpcomingDividendRow[]
```

- Join по `ticker.toUpperCase()`.
- Фильтр: `registryCloseDate >= today` (**сегодня включается**).
- Показывать только строки, у которых после join `sharesOwned > 0`.
- `expectedIncome = valuePerShare * sharesOwned`.
- `eventYieldPct`:
  `price !== null && Number.isFinite(price) && price > 0`
  ? `(valuePerShare / price) * 100`
  : `null`.
- Сорт: дата asc, тикер asc.
- Footer: `sum(expectedIncome)`.

Подпись колонки: **«К цене %»** или **«Дох. события %»** — не «годовая
дивдоходность». В UI hint/disclaimer (постоянный, под таблицей или в
шапке):

> Ожидаемый доход ориентировочный: считается по **текущему** числу акций.
> Право на дивиденд зависит от владения на дату отсечки; налоги и факт
> выплаты не учитываются.

## 7. UI / empty-state (формально)

Приоритет empty (первый подходящий):

1. **Нет позиций с shares > 0** → «Нет позиций с акциями» (кнопка Update
   disabled или no-op с тем же текстом).
2. **`dividendsFetchedAt === null`** → «Нажмите Обновить»
   (ещё никогда не было успешного дивидендного Update).
3. **`dividendsFetchedAt !== null`** и upcoming rows пусты →
   «Ближайших отсечек в ISS нет» (успешный fetch был; на сегодня/будущее
   нечего показать — в т.ч. после reload).

Шапка: кнопка «Обновить дивиденды» (`disabled={isDividendsUpdating}`);
«Обновлено: … | —»; напоминание про общую Сохранить; disclaimer §6.

Таблица: Тикер | Отсечка | ₽/акция | Акций | Ожид. доход ₽ | Дох. события %.

Web + desktop, один layout.

## 8. Архитектура файлов

| Файл | Роль |
|---|---|
| `iss/client.ts` (+ tests) | history + batch result contract |
| `domain/dividendCalendar.ts` (+ tests) | parse helpers if pure, filter, enrich, merge snapshot |
| `domain/mergeDividendSnapshot.ts` (или в calendar) | §4.1 merge |
| `components/DividendsTab.tsx` (+ tests) | UI + orchestration + `isDividendsUpdating` |
| `types.ts`, `file/schema.ts`, `createEmptyPortfolio.ts` | модель |
| `App.tsx`, `styles.css` | вкладка |

`isDividendsUpdating` — local state вкладки **или** поле в portfolio
context, **отдельно** от `isUpdating`. Не переиспользовать market flag.

## 9. Тесты (обязательные ветки)

**ISS / parse**

- Валидные rows; drop bad date / non-finite / ≤0 value; reject
  non-calendar YYYY-MM-DD; dedupe; empty block → `[]` success.
- Batch: mixed success/fail → корректные `succeeded`/`failed` maps.
- Полный fail (`succeeded.length === 0`) и HTTP 500 на всех.
- URL encoding / uppercase ticker.
- Один запрос без `start`/`limit` query (контракт пагинации).

**Merge / orchestration**

- Partial fail **сохраняет** старые events упавшего тикера.
- Succeeded тикер **заменяет** свою ленту.
- Тикер с shares→0 на apply **удаляется** из events.
- Functional `setFile`: изменения `positions`/`transactions` во время
  fetch не затираются (mock sequential updates).
- Полный fail → `setFile` не вызывается / dividends fields unchanged.
- `sharesOwned` включает broker holdings при выборе тикеров.

**Calendar UI model**

- `today` boundary: дата `== today` **входит**; `today-1` нет.
- Null/zero/negative price → `eventYieldPct === null`.
- Empty-state inputs: `fetchedAt null` vs fetched+no upcoming vs no
  positions (тесты приоритета копий или pure helpers).

**Tab**

- Успешный path; partial warning; полный fail; нулевые позиции без сети.

## 10. Acceptance

1. Первый визит (`dividendsFetchedAt === null`) → «Нажмите Обновить».
2. Update: полный fail → file дивидендов не меняется; partial → успешные
   обновлены, failed сохранили старое + warning.
3. После успешного Update без дат ≥ today → «Ближайших отсечек в ISS нет»;
   то же после Save/reload.
4. Reload без Save → состояние из файла.
5. Save → events в JSON; reopen → те же.
6. Только shares > 0; disclaimer виден; рыночный Update не трогает
   dividend fields; dividend fetch не блокирует market Update.
7. Web + desktop.

## 11. Backlog (не этот spec)

- Пагинация dividends, если ISS начнёт резать ответ.
- Календарь прошлых / годовая доходность.
- Sector weights, quiet mode, cash-позиция, обзор без индекса.
