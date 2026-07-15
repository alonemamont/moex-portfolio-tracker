# MOEX Portfolio Tracker

Локальное веб-приложение для отслеживания портфеля акций относительно индексов Московской биржи. Приложение получает актуальные рыночные данные через MOEX ISS, считает соответствие индексу, показывает структуру портфеля и сохраняет пользовательские данные в локальный файл без серверного хранения.

> [!NOTE]
> Проект ориентирован на локальную работу с личным портфелем: без аккаунтов, без облачной базы и без передачи пользовательских данных на собственный backend.

## Возможности

- Загрузка и сохранение локального файла портфеля.
- Обновление состава индекса, цен, лотности и дивидендов через MOEX ISS.
- Поддержка нескольких индексов и позиций вне индекса.
- Расчёт стоимости портфеля, отклонения от целевой структуры и агрегированного compliance.
- Вкладки с портфелем, графиками, секторами и транзакциями.
- Импорт и синхронизация данных брокеров, включая `T-Bank` и `Финам`.
- Работа в браузере и дополнительный desktop runtime через Tauri.

## Почему это локальное приложение

- Личные данные остаются у пользователя.
- Источник истины для портфеля — файл, которым владеет пользователь.
- Рыночные данные можно обновлять независимо от ручных полей.
- Приложение не требует отдельного сервера для хранения портфельной истории.

## Стек

- `React 18` + `TypeScript`
- `Vite`
- `Vitest` + `Testing Library`
- `Playwright`
- `Recharts`
- `Zod`
- `Tauri` для desktop-сценариев

## Быстрый старт

Тулчейн приложения находится в каталоге `webapp/`.

### Зависимости для запуска

- `Node.js 20+`
- `Rust` с target `x86_64-pc-windows-msvc`
- Для desktop-режима на Windows: `Visual Studio 2022 Build Tools` или `Visual Studio 2022` с workload `Desktop development with C++`

Для проверки Rust toolchain:

```bash
rustup show
```

Для desktop-режима `Tauri` нужен системный линкер `link.exe` из MSVC. Если `npm run tauri:dev` падает с ошибкой `linker 'link.exe' not found`, значит не установлен Visual C++ toolchain или сборка запущена вне Developer PowerShell / без корректно настроенного `PATH`.

```bash
cd webapp
npm install
npm run dev
```

После запуска Vite приложение будет доступно локально. Для production-сборки:

```bash
npm run build
```

## Основные команды

Запускать из `webapp/`:

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run test:e2e
npm run test:contract
npm run test:bench
npm run test:mutation
```

Для desktop-режима:

```bash
npm run tauri:dev
npm run tauri:build
```

На Windows для `Tauri` обычно нужно:

```bash
rustup default stable-x86_64-pc-windows-msvc
```

А затем запускать сборку после установки Visual C++ Build Tools.

Если Build Tools установлены в `E:\work\tools\VS2022BuildTools`, можно запускать desktop-режим через готовые скрипты:

```bash
cd webapp
tauri-dev.cmd
```

Скрипт сам поднимает `VsDevCmd.bat` и затем вызывает `npm run tauri:dev`.

Для запуска из PowerShell можно использовать wrapper:

```powershell
cd webapp
.\tauri-dev.ps1
```

Для desktop-сборки:

```bash
cd webapp
tauri-build.cmd
```

Скрипт так же поднимает `VsDevCmd.bat` и затем вызывает `npm run tauri:build`.

PowerShell-вариант:

```powershell
cd webapp
.\tauri-build.ps1
```

> [!NOTE]
> Синхронизация с `T-Bank` доступна только в desktop-версии на `Tauri`. В браузерном режиме этот сценарий ограничен политикой `CORS`.

## Подключение брокеров

Т-Банк (`invest-public-api.tbank.ru`) отдаёт TLS-сертификат, подписанный
`Russian Trusted Sub CA`, а не публично доверенным центром сертификации.
Если в браузере не установлена эта цепочка, запрос падает ещё до ответа
брокера с сетевой ошибкой (`NetworkError when attempting to fetch
resource` / `Failed to fetch`). Это не ограничение приложения и не
rate-limit брокера.

**Решение** — скачать на https://www.gosuslugi.ru/crt и установить
именно пару **«Russian Trusted Root CA»** + **«Russian Trusted Sub
CA»**. Это *не* тот же сертификат, что «Минцифры России ГУЦ/НУЦ»
(используется для госуслуг/подписи документов) — нужна отдельная пара.

Куда устанавливать (Windows, двойной клик по `.cer` → «Установить
сертификат…» → «Текущий пользователь»):

- `Russian Trusted Root CA*.cer` → хранилище **«Доверенные корневые
  центры сертификации»** (Trusted Root Certification Authorities).
- `Russian Trusted Sub CA*.cer` → хранилище **«Промежуточные центры
  сертификации»** (Intermediate Certification Authorities).

Частая ошибка — положить Root CA в «Промежуточные» вместо «Доверенные
корневые»: файл физически появится в системе, но доверия не даст.
Проверить, что сертификат встал туда, куда нужно:

```powershell
Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -match "Russian Trusted" }
```

После установки — полностью закрыть браузер (все окна) и открыть
заново. Node (`npm run test:contract`) эту цепочку не увидит в любом
случае — Node использует собственный встроенный список CA, а не
хранилище сертификатов ОС; ориентироваться на реальный браузер.

Приложение показывает это же объяснение в сообщении об ошибке, когда
определяет сетевой сбой при подключении к Т-Банку.

## Как устроены данные

Приложение разделяет:

- рыночные данные, которые можно безопасно обновлять из внешних источников;
- ручные данные пользователя, такие как количество бумаг, настройки портфеля, транзакции и история;
- справочные данные, например секторные привязки и конфигурацию подключения брокеров.

> [!IMPORTANT]
> Обновление рынка не должно затирать пользовательские ручные поля. Это один из базовых инвариантов проекта.

## Архитектура

```text
webapp/
  src/
    brokers/       интеграции брокеров и адаптеры синхронизации
    components/    UI-компоненты и вкладки приложения
    domain/        расчёты, агрегации и бизнес-логика
    file/          загрузка, сохранение и схема файла портфеля
    iss/           клиент MOEX ISS и XML-парсинг
    portfolio/     orchestration состояния портфеля и обновлений
    errors/        обработка и отображение ошибок
    testUtils/     тестовые моки и утилиты
  e2e/             end-to-end сценарии Playwright
  src-tauri/       Tauri runtime
docs/superpowers/  дизайн-спеки и планы по развитию
```

## Качество и тестирование

В проекте есть несколько уровней проверки:

- unit- и integration-тесты на `Vitest`;
- контрактные тесты для клиентов брокеров;
- e2e-сценарии на `Playwright`;
- benchmark и mutation testing для критичных частей доменной логики.

Порог покрытия в конфигурации `Vitest` установлен на `70%` по statements, branches, functions и lines.

## Публикация

Веб-версия собирается с base path `/moex-portfolio-tracker/`, что подходит для публикации на GitHub Pages. Workflow-файлы CI и деплоя лежат в `.github/workflows/`.

## Windows Portable Build

Latest release: https://github.com/alonemamont/moex-portfolio-tracker/releases/latest

T-Bank synchronization requires the Windows portable application. Finam synchronization remains available in the browser build on GitHub Pages.
