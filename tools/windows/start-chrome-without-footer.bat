@echo off
rem Syndicates Client - start Chrome with its new-tab bottom bar turned off.
rem Chrome must be fully closed first (also check the system tray), otherwise the option is ignored.
rem Tip: right-click your Chrome shortcut - Properties - Target, and add  --disable-features=NtpFooter  at the end to make it permanent.
taskkill /IM chrome.exe /F >nul 2>&1
timeout /t 2 >nul
set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"
start "" %CHROME% --disable-features=NtpFooter
