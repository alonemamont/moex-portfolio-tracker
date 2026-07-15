@echo off
setlocal

set "VS_DEV_CMD=E:\work\tools\VS2022BuildTools\Common7\Tools\VsDevCmd.bat"

if not exist "%VS_DEV_CMD%" (
  echo Visual Studio Build Tools environment script not found:
  echo   %VS_DEV_CMD%
  exit /b 1
)

call "%VS_DEV_CMD%" -arch=x64 -host_arch=x64
if errorlevel 1 exit /b %errorlevel%

cd /d "%~dp0"
npm run tauri:dev

