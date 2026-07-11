# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project layout

All app code and tooling live in `webapp/` — there is no root `package.json`. Run all npm commands with cwd `webapp/`.

- `webapp/src/components/` — React components
- `webapp/src/domain/` — calculations, merge, snapshots (core business logic)
- `webapp/src/file/` — portfolio file load/save, zod schema (`schema.ts`)
- `webapp/src/iss/` — Moscow Exchange ISS API client (`https://iss.moex.com/iss`) — network dependency for live market data
- `webapp/src/portfolio/` — React context, market-update orchestration
- `webapp/src/concurrency/` — `pLimit`-based concurrency helpers
- `docs/superpowers/` — planning/spec markdown (Russian-language), not app code

## Commands (run from `webapp/`)

- `npm run dev` — Vite dev server
- `npm run build` — typecheck (both tsconfig projects) then `vite build`
- `npm run test` — run all tests once (Vitest)
- `npm run test:watch` — Vitest watch mode
- `npm run typecheck` — typecheck only, no build
- Single test file: `npx vitest run src/domain/calculations.test.ts`
- Single test by name: `npx vitest run -t "test name"`
- `npm run lint` — ESLint (flat config in `eslint.config.js`): `@eslint/js` + `typescript-eslint` recommended, `eslint-plugin-react-hooks` recommended (includes the newer `set-state-in-effect` rule), `eslint-plugin-react-refresh`.

## Code style

`tsconfig.json` has `strict: true` plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, and `isolatedModules: true`. No ESLint/Prettier config — match existing formatting by hand.

## Gotchas

- `webapp/vite.config.ts` binds the dev server to `host: "127.0.0.1"` explicitly — IPv6 loopback (`::1`) is unreachable on this host. Don't revert to default host binding.
- `base: "/moex-portfolio-tracker/"` in vite.config — app deploys to a GitHub Pages subpath.
- Personal/local files are gitignored and must never be committed: `*.xlsx`/`*.xlsm`, `positions.csv` (personal ticker/quantity data), and the app's own `portfolio.json` save file.
- `.github/workflows/deploy.yml` triggers on push to `main`, but this repo's default branch is `master` — deploy does not auto-fire on normal pushes (known, to be fixed later).
