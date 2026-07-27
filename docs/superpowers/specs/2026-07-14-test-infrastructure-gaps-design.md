# Дозаполнение тестовой инфраструктуры — дизайн

## Проблема

Текущее покрытие (см. обзор от 2026-07-14): ~250 тестов, Vitest + Testing Library, unit + несколько integration (`*.integration.test.ts`, мок только на уровне fetch). Пробелы против современного стандарта:

- CI не гоняет тесты и lint вообще — только `npm run build` в `deploy.yml`.
- Нет coverage reporting — нет видимости, что не покрыто.
- Нет E2E — golden path (load file → добавить позицию → market update → broker sync → save file) нигде не проверен целиком в браузере.
- Ручной fetch-мок дублируется в ~15 файлах без общего helper.
- Нет mutation testing — неизвестно, ловят ли тесты реальные баги.
- Нет a11y-проверок в компонент-тестах (модалки, формы).
- Нет contract-тестов против реальных Finam/Tbank API — integration-тесты мокают fetch, breaking change на стороне брокера не поймать.
- Нет explicit security-теста хранения токенов (`crypto.ts`, `tokenSession.ts`).
- Нет perf-тестов на `calculations.ts` (52 теста, самый крупный модуль домена).

## Ограничение из предыдущего решения

`2026-07-14-broker-integration-tests-design.md` фиксирует: **без новых mocking-зависимостей** (явный отказ от MSW), ручной мок fetch — сохранённый стиль. Это решение остаётся в силе для всего проекта, не только для файла, где было принято. План ниже это учитывает — MSW не используется нигде.

## Подход

Один план, 4 фазы по возрастанию размера/риска. Каждая фаза — самостоятельный кусок работы (свой PR/коммит), фазы 3-4 не блокируют друг друга, но идут после 1-2 (инфраструктурная база).

## Фаза 1 — быстрые правки (часы)

### 1.1 CI gate
Новый `.github/workflows/ci.yml`: триггер `pull_request` + `push` на `master`, пути `webapp/**`. Джоба: `npm ci` → `npm run lint` → `npm run typecheck` → `npm run test`. `deploy.yml` не трогаем (отдельная известная проблема с веткой main/master, вне скоупа).

### 1.2 Coverage reporting
`@vitest/coverage-v8` в devDependencies. В `vite.config.ts` секция `test.coverage`: `provider: "v8"`, `reporter: ["text", "html", "lcov"]`, `thresholds` (lines/statements/functions/branches — стартовый порог = текущий факт, чтобы не блокировать сразу, потом поднимать). Новый npm script `test:coverage`. Добавить шаг в `ci.yml` (после `npm run test`, либо заменить на `vitest run --coverage`).

### 1.3 Общий fetch-mock helper
Новый `webapp/src/testUtils/mockFetch.ts`: функция вида `mockFetchSequence(responses: MockResponse[])` / `mockFetchByUrl(routes: Record<string, Response>)`, обёртка над `vi.spyOn(globalThis, "fetch")` — тот же ручной стиль, без новых зависимостей. Рефактор существующих `iss/*.test.ts`, `brokers/*/client.test.ts`, `*.integration.test.ts` на использование helper вместо дублирования inline-мока. Чисто механический рефактор, поведение тестов не меняется.

## Фаза 2 — среднее

### 2.1 Mutation testing
`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`. Конфиг `stryker.conf.json` в `webapp/`, скоуп мутаций — `src/domain/**`, `src/brokers/syncDiff.ts` (самая ценная чистая бизнес-логика, наибольшая плотность edge-кейсов). npm script `test:mutation`. Не в CI (медленно, шумно) — ручной/периодический запуск, порог mutation score фиксируется после первого прогона (baseline).

### 2.2 a11y-проверки
`vitest-axe` + `axe-core`. Добавить `toHaveNoViolations` matcher в `setupTests.ts`. Расширить существующие RTL-тесты интерактивных компонентов (`BrokerConnectionsModal.test.tsx`, `AddBrokerConnectionForm.test.tsx`, `BrokerSyncPreviewModal.test.tsx`) проверкой `axe(container)` на смонтированный компонент. Новых файлов не создаём — точечные ассершены в существующих тестах.

Visual regression — не делаем отдельным инструментом (Percy/Chromatic — платные, лишняя зависимость). Покрывается скриншотами Playwright в фазе 3.

## Фаза 3 — крупное

### 3.1 E2E (Playwright)
`@playwright/test` в devDependencies. `webapp/playwright.config.ts`: `webServer` — `npm run preview` (после `npm run build`), `baseURL` — локальный preview-адрес с учётом `base: "/moex-portfolio-tracker/"` из `vite.config.ts`. Тесты в `webapp/e2e/`.

Сценарии (golden path + основные ветки):
- Загрузка portfolio-файла → позиции отображаются в таблице.
- Добавление позиции вручную → появляется в таблице и в файле при сохранении.
- Market update (refresh) → цены подтягиваются (мок ISS на уровне сети через Playwright route intercept, не реальный iss.moex.com — сеть внешняя, нестабильна для CI).
- Broker sync: открыть модалку подключения → добавить соединение → preview diff → apply → позиции влиты в портфель (мок брокерского API и ISS через Playwright route).
- Сохранение файла (browser download flow).

CI: отдельная джоба `e2e` в `ci.yml` (или отдельный workflow `e2e.yml`), запуск на PR, не на каждый push в master (дольше, реже нужен). Скриншоты Playwright по умолчанию не хранить как baseline (нет визуального diff-инструмента) — только для дебага упавших тестов (`trace: on-first-retry`).

## Фаза 4

### 4.1 Contract-тесты Finam/Tbank (реальный API)
Реальные вызовы в CI нежелательны: личные credentials, rate limits, недетерминированность. Подход: новый npm script `test:contract`, гейт через переменную окружения `RUN_LIVE_BROKER_TESTS=1` (тест пропускается — `it.skipIf` — если переменная не выставлена). Файлы `webapp/src/brokers/finam/client.contract.test.ts`, `webapp/src/brokers/tbank/client.contract.test.ts` — реальный `fetch`, реальные credentials из `.env.local` (gitignored), проверяют актуальность контракта ответа (обязательные поля, коды статусов). Не в CI по умолчанию — документация в README, как запускать локально перед апдейтом клиента брокера.

### 4.2 Security review токенов
Ручной аудит `webapp/src/brokers/crypto.ts` и `webapp/src/brokers/tokenSession.ts` (как токен шифруется/хранится, попадает ли в логи/console, очищается ли при disconnect). По итогам — regression-тесты на конкретные найденные проблемы (не пишем тесты вслепую до аудита). Можно выполнить через существующий скилл `/security-review` как отдельный шаг перед этой фазой.

### 4.3 Perf-тесты `calculations.ts`
Vitest `bench` API (`import { bench } from "vitest"`) в новом `webapp/src/domain/calculations.bench.ts` — прогон расчётов на синтетическом наборе 1000+ позиций. npm script `test:bench`. Не гейт в CI (шум от разного железа раннеров) — baseline фиксируется вручную, сверяется при подозрении на регресс.

## Не входит в скоуп

- MSW — исключено решением из `2026-07-14-broker-integration-tests-design.md`.
- Исправление `deploy.yml` (main vs master) — отдельная известная проблема, не про тестирование.
- Visual regression как отдельный инструмент (Percy/Chromatic) — покрыто Playwright-скриншотами по необходимости, не полноценный baseline-diff.
