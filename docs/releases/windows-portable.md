# MOEX Portfolio Tracker for Windows

Download `moex-portfolio-tracker-windows-portable.exe` and run it directly; no installation is required.

This first Windows build is not code-signed, so Microsoft SmartScreen may show a warning. Verify that the file came from this repository's GitHub Releases page before choosing to run it.

The application uses the system Microsoft Edge WebView2 runtime. It is included in current Windows releases; if startup reports that it is missing, install the official Evergreen Standalone Installer from https://developer.microsoft.com/microsoft-edge/webview2/.

T-Bank requests are made locally by the application. Tokens remain encrypted in `portfolio.json`, are decrypted only in frontend memory for synchronization, and are not sent to a third-party proxy.
