# Интеграционные тесты для broker sync — дизайн

## Проблема

Существующие тесты в `webapp/src/brokers/` и `webapp/src/portfolio/runBrokerSync.test.ts` — юнитовые: каждый слой мокает соседний ниже него.

- `finam/client.test.ts`, `tbank/client.test.ts` — мокают `global.fetch`, проверяют парсинг ответа реального клиента.
- `finam/adapter.test.ts`, `tbank/adapter.test.ts` — мокают функции `client.ts` через `vi.spyOn`, проверяют только логику адаптера (фильтрация EQUITIES/share, маппинг).
- `runBrokerSync.test.ts` — мокает `getBrokerAdapter` и `fetchSecurities` целиком.

Реальная склейка слоёв (adapter → client → HTTP; registry → adapter → syncDiff) нигде не проверяется одним тестом. Баг на границе слоёв (например, неверный порядок аргументов при вызове client-функции из adapter, или неверная сборка URL) юнит-тестами не ловится, если оба слоя замоканы независимо и оба мока согласованы с багом.

## Подход

Новые тестовые файлы `*.integration.test.ts`, рядом с существующими юнит-тестами (не заменяют их). Мокается только сетевая граница — `global.fetch` — все промежуточные слои реальные.

Vitest подхватывает `*.integration.test.ts` автоматически (default glob `*.test.ts`, доп. настройки в `vitest`-секции `vite.config.ts` не ограничивают паттерн).

Мок fetch — ручной стаб (как в `client.test.ts`), но с роутингом по URL, т.к. в одном тесте нужно ответить на несколько разных эндпоинтов. Без новых зависимостей (не MSW) — решение пользователя: сохранить существующий стиль ручного мока.

## Новые файлы

### `webapp/src/brokers/finam/adapter.integration.test.ts`

Мокается только `fetch`. Реальные `exchangeFinamSecret`, `fetchFinamAccountIds`, `fetchFinamAccountDetails`, `resolveFinamAsset`, `parseFinamQuantity` — без моков.

- `listAccounts`: secret → POST `/v1/sessions` → jwt → POST `/v1/sessions/details` → account ids → `BrokerAccount[]`.
- `fetchHoldings`:
  - happy path: jwt exchange → GET `/v1/accounts/{id}` → позиции → параллельный GET `/v1/assets/{symbol}?account_id=...` на каждую (через `pLimit`) → фильтр `type === "EQUITIES"` → `parseFinamQuantity`.
  - смешанный набор: одна позиция EQUITIES, одна BONDS → в результате только EQUITIES.
  - resolve падает (404) на одной позиции → эта позиция тихо дропается, остальные остаются.
  - symbol с `@` (`SBER@MISX`) корректно URL-кодируется при вызове `/v1/assets/`.

### `webapp/src/brokers/tbank/adapter.integration.test.ts`

Мокается только `fetch`. Реальные `fetchTbankAccounts`, `fetchTbankPortfolio`, `resolveTbankTicker`, `quantityToShares` — без моков.

- `listAccounts`: token → POST `.UsersService/GetAccounts` → `BrokerAccount[]`.
- `fetchHoldings`:
  - happy path: POST `.OperationsService/GetPortfolio` → позиции → фильтр `instrumentType === "share"` → параллельный POST `.InstrumentsService/GetInstrumentBy` на каждую → `quantityToShares` (units + nano/1e9).
  - resolve падает → позиция дропается.
  - позиция с `instrumentType !== "share"` (например, `"bond"`) отфильтровывается до resolve-запроса (resolve не должен для неё вызываться).

### `webapp/src/portfolio/runBrokerSync.integration.test.ts`

Мокается только `fetch` — оба эндпоинта (брокерский API и ISS `securities.xml`). `registry.ts`, конкретный adapter (tbank или finam — один на этот файл, tbank как более простой) и `syncDiff.ts` — реальные, без моков.

- Полный путь: `BrokerConnection` (brokerId: "tbank") + токен → `fetchBrokerSyncPreview` → реальный `getBrokerAdapter("tbank")` → реальный `tbankAdapter.fetchHoldings` (мок fetch на уровне HTTP) → реальный `fetchSecurities` (мок fetch на ISS) → реальный `buildSyncDiff`.
- Кейс: один тикер уже есть в портфеле (`status: "existing"`), один новый и торгуемый (`status: "new"`), один новый и не торгуемый / не найден в ISS (`status: "unresolved"`).
- Проверка, что `fetchSecurities` вызывается только с тикерами, которых ещё нет в файле (существующее поведение из `runBrokerSync.ts:19-22`), в интеграционном сценарии с реальным adapter-результатом.

## Не входит в скоуп

- `syncDiff.test.ts`, `registry.test.ts`, `crypto.test.ts`, `tokenSession.test.ts` — остаются как есть, чистые юниты без внешних вызовов, интеграционный слой им не нужен.
- UI-компоненты (`BrokerConnectionsModal` и т.д.) — не входят, отдельная область.
- `applySyncDiff` — чистая функция без сетевых вызовов, уже покрыта юнит-тестом, интеграционный тест не добавляет ценности.
