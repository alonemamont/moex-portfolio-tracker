---
name: desktop-tauri-runner
description: Use when working in this repository and needing to run or build the fresh Windows Tauri desktop app, especially from PowerShell or Codex on Windows where MSVC setup, helper script choice, or common Tauri startup blockers must be handled consistently.
---

# Desktop Tauri Runner

Use project helper scripts from `webapp/` instead of calling `npm run tauri:*` from a plain shell.

For PowerShell and Codex, prefer `.ps1` wrappers. They delegate to existing `.cmd` scripts without tripping PowerShell-specific process launch issues.

## Quick Reference

- Dev run from PowerShell or Codex: `cd webapp; .\tauri-dev.ps1`
- Desktop build from PowerShell or Codex: `cd webapp; .\tauri-build.ps1`
- Dev run from `cmd`: `cd webapp && tauri-dev.cmd`
- Desktop build from `cmd`: `cd webapp && tauri-build.cmd`
- Verify Rust app only: open MSVC env, then `cd webapp\src-tauri && cargo build`

## Environment

- Build Tools path: `E:\work\tools\VS2022BuildTools`
- MSVC bootstrap script: `E:\work\tools\VS2022BuildTools\Common7\Tools\VsDevCmd.bat`
- Rust toolchain expected: `stable-x86_64-pc-windows-msvc`

## Procedure

1. Start in repo root `E:\work\micex_index`.
2. If shell is PowerShell or Codex, use `webapp\tauri-dev.ps1` for dev and `webapp\tauri-build.ps1` for build.
3. If shell is plain `cmd`, use `webapp\tauri-dev.cmd` for dev and `webapp\tauri-build.cmd` for build.
4. If helper script fails before `npm`, verify `VsDevCmd.bat` still exists at configured path.
5. If Tauri starts Vite but desktop app still exits, inspect known blockers below before inventing alternate launch commands.

## Common Blockers

- `link.exe not found`
  Fix: do not call `npm run tauri:*` directly. Use project helper scripts so `VsDevCmd.bat` sets MSVC environment first.

- PowerShell `Start-Process` / Codex launch fails before app starts
  Fix: use `tauri-dev.ps1` or `tauri-build.ps1`. Do not replace project launch flow with ad hoc `cmd /c "call ... && npm ..."`.

- `PluginInitialization("http", "... (os error 5)")`
  Fix: HTTP plugin cookie persistence is incompatible with this environment. Keep `webapp/src-tauri/Cargo.toml` on `tauri-plugin-http` with `default-features = false` and no `cookies` feature.

- Vite watcher crashes with `EBUSY` under `webapp/src-tauri/target/**`
  Fix: keep `webapp/vite.config.ts` ignoring `**/src-tauri/target/**` in `server.watch.ignored`.

- `icons/icon.ico not found`
  Fix: ensure `webapp/src-tauri/icons/icon.ico` exists. This repo already includes technical placeholder icon for Tauri Windows resource generation.

- Tauri build fails before frontend starts
  Fix: check `npm install` was run in `webapp/`.

## Boundaries

- Use this skill only for this repository. Paths are project-specific.
- Prefer project helper scripts over ad hoc long `cmd /c "call ... && npm run ..."` commands.
- In PowerShell or Codex, prefer `.ps1` wrappers first. `.cmd` remains fallback for plain `cmd`.
