# Переключение индекса (IMOEX / MOEXBC / MOEX10)

Дата: 2026-07-12

> Сейчас проверка соответствия портфеля жёстко привязана к IMOEX
> (`fetchIndexComposition` дёргает `.../analytics/IMOEX.xml`). Добавляем
> возможность считать соответствие относительно других индексов
> Мосбиржи и переключаться между ними на уже загруженном портфеле, без
> перезагрузки файла.

## Индексы

Только индексы, чей состав отдаёт тот же ISS-эндпоинт
(`/statistics/engines/stock/markets/index/analytics/{secid}.xml`) в
процентных весах:

| secid    | Название                          |
|----------|------------------------------------|
| IMOEX    | Индекс МосБиржи                     |
| MOEXBC   | Индекс МосБиржи голубых фишек       |
| MOEX10   | Индекс МосБиржи 10                  |

IRTS/IMOEX10 из исходного запроса — не реальные secid'ы ISS (проверено
запросом к API). Индекс РТС (`RTSI`) сознательно не включаем: он
котируется в USD, а `weight` в analytics-эндпоинте для него в
USD-базе — это не то же самое "чистое" сравнение весов, что для
рублёвых индексов, и требует отдельной логики. Список индексов —
статичный массив в новом файле `domain/indices.ts`, добавление новых
индексов в будущем — правка одной строки в этом массиве.

## Смысл переключения

Переключение индекса — это **не смена данных портфеля**, а смена
"линзы", через которую считается target allocation / compliance:

- `sharesOwned`, `coefficient` пользовательских позиций не трогаются.
- Тикеры, которых нет в портфеле, но которые входят в состав нового
  индекса — добавляются в `file.positions` с `sharesOwned=0`
  (как это уже делает `mergeMarketData` при обычном "Обновить").
  Симметрично с текущим поведением, отдельного "предпросмотра" без
  побочных эффектов не делаем.
- `indexWeight`/`status` (`in_index`/`out_of_index`) в `liveByTicker`
  пересчитываются под новый индекс.
- `file.history` **не изменяется** — переключение не создаёт новый
  history snapshot. History остаётся последовательностью снимков,
  каждый привязан к тому индексу, что был активен на момент своего
  создания (снимок не хранит indexId явно — это не in scope этой
  фичи).
- Выбор индекса не сохраняется в `portfolio.json` (схема файла не
  меняется), а в `localStorage` — переживает перезагрузку страницы,
  но не привязан к конкретному файлу портфеля.

## Архитектура

### `iss/client.ts`

```ts
export async function fetchIndexComposition(indexId: string): Promise<IndexCompositionEntry[]>
```
URL: `${ISS_BASE}/statistics/engines/stock/markets/index/analytics/${indexId}.xml?limit=100`.
Убираем хардкод `IMOEX`.

### `iss/marketData.ts`

```ts
export async function fetchMarketData(existingTickers: string[], indexId: string): Promise<MarketDataResult>
```
Пробрасывает `indexId` в `fetchIndexComposition`.

### `domain/indices.ts` (новый)

```ts
export interface IndexOption { id: string; label: string }
export const INDEX_OPTIONS: IndexOption[] = [
  { id: "IMOEX", label: "IMOEX" },
  { id: "MOEXBC", label: "MOEXBC" },
  { id: "MOEX10", label: "MOEX10" },
];
export const DEFAULT_INDEX_ID = "IMOEX";
```

### `portfolio/runMarketUpdate.ts`

Рефакторинг на общий helper, чтобы не дублировать fetch+merge+calculate:

```ts
async function computeMarketSnapshot(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData>,
  indexId: string
): Promise<{ positions: Position[]; liveByTicker: Map<string, LiveData>; calculated: CalculatedPosition[]; portfolioValue: number }>
```
(fetchMarketData → mergeMarketData → buildCalculatedPositions → portfolioValue).

```ts
export async function runMarketUpdate(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData> = new Map(),
  indexId: string = DEFAULT_INDEX_ID
): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }>
```
Как сейчас + добавляет history snapshot. Default-параметр `indexId`
сохраняет обратную совместимость существующих 2-arg вызовов/тестов.

```ts
export async function switchIndex(
  currentFile: PortfolioFile,
  previousLiveByTicker: Map<string, LiveData>,
  indexId: string
): Promise<{ file: PortfolioFile; liveByTicker: Map<string, LiveData> }>
```
Та же логика через `computeMarketSnapshot`, но **без** записи в
`history`.

### `portfolio/PortfolioContext.tsx`

Добавить в контекст:
- `selectedIndex: string`, `setSelectedIndex: (id: string) => void`.
  Инициализация лениво из `localStorage["moex-portfolio-tracker:selectedIndex"]`,
  fallback `DEFAULT_INDEX_ID`. `setSelectedIndex` пишет в state; запись
  в `localStorage` — через `useEffect` на изменение (паттерн как
  `saveSearchPref`/`saveHideEmptyPref` в `PortfolioTab.tsx`, только на
  уровне провайдера).
- `isUpdating: boolean`, `setIsUpdating` — переезжает из локального
  state `PortfolioTab`, чтобы Header (переключение индекса) и
  PortfolioTab (кнопка "Обновить", авто-обновление) шарили один
  busy-флаг и не могли выполняться одновременно.

### `components/Header.tsx`

`header__brand` (сейчас статичный `<span>IMOEX</span>`) заменяется на
`<select>` с опциями из `INDEX_OPTIONS`, значение — `selectedIndex` из
контекста. `disabled` пока `!file || isUpdating`.

`onChange`:
1. `setIsUpdating(true)`, `clearBySource("index-switch")`.
2. `switchIndex(file, liveByTicker, newIndexId)`.
3. При успехе: `setFile(updated)`, `setLiveByTicker(newLive)`,
   `setSelectedIndex(newIndexId)`.
4. При ошибке: `addError("index-switch", ...)`, `selectedIndex` и
   данные портфеля не меняются (select визуально остаётся на прежнем
   значении, т.к. `value` контролируется несменившимся `selectedIndex`).
5. `finally`: `setIsUpdating(false)`.

### `components/PortfolioTab.tsx`

- `isUpdating`/`setIsUpdating` берутся из контекста вместо
  `useState` внутри компонента.
- `handleUpdate` и авто-update эффект читают `selectedIndex` из
  контекста и передают его в `runMarketUpdate(file, liveByTicker, selectedIndex)`.

## Error handling

- Сетевые ошибки при `switchIndex` (ISS недоступен, index не найден)
  обрабатываются как существующие ошибки Header (`useErrors`,
  `SOURCE = "index-switch"`), без падения приложения.
- Портфель, `liveByTicker` и `selectedIndex` остаются в прежнем
  состоянии при ошибке — переключение не "наполовину" применяется.

## Тесты

- `iss/client.test.ts`: `fetchIndexComposition("MOEXBC")` бьёт по
  правильному URL (мок fetch, как для текущего IMOEX-теста).
- `portfolio/runMarketUpdate.test.ts`: существующие 2-arg вызовы
  остаются зелёными (default `IMOEX`); новый кейс — явный `indexId`
  передаётся в `fetchMarketData`.
- Новый `portfolio/switchIndex.test.ts`: no history append; positions
  merge добавляет новые тикеры состава; существующие позиции/их
  `sharesOwned`/`coefficient` не теряются при смене индекса.
- Персистентность `selectedIndex` в localStorage: юнит-тест на
  init/write (мок `localStorage`, тот же подход что для
  `tablePrefs.ts`, если там есть тесты — проверить перед реализацией).
- UI-тест на `<select>` в Header — не заводим отдельную
  RTL-инфраструктуру ради одного компонента, если её ещё нет в
  репозитории; проверяется руками через `npm run dev`.

## Вне рамок

- Индекс РТС (`RTSI`, USD-номинал).
- Хранение `selectedIndex` внутри `portfolio.json`.
- Привязка history snapshot к индексу, на котором он был создан.
- Произвольные/пользовательские индексы вне списка `INDEX_OPTIONS`.
