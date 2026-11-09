@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 倒带三消 · 启动器

where python >nul 2>nul
if not errorlevel 1 (
  set "PY=python"
  goto :run
)
where py >nul 2>nul
if not errorlevel 1 (
  set "PY=py -3"
  goto :run
)
goto :nopython

:run
echo 正在启动本地服务器...
start "倒带三消 · 本地服务器" cmd /k %PY% -m http.server 8123 --bind 0.0.0.0
timeout /t 2 >nul
start "" "http://127.0.0.1:8123/"

echo.
echo 已在浏览器打开： http://127.0.0.1:8123/
echo.
echo 让同一个 Wi-Fi 的朋友玩：
echo   1. 在命令行运行 ipconfig，找到「IPv4 地址」，例如 192.168.1.23
echo   2. 把 http://192.168.1.23:8123/ 发给对方
echo   3. 第一次运行时如弹出防火墙提示，请选择「允许访问」
echo.
echo 关闭「倒带三消 · 本地服务器」窗口即可停止分享。
echo.
pause
exit /b

:nopython
echo 没有检测到 Python，改为直接用浏览器打开 index.html...
start "" "index.html"
timeout /t 2 >nul
exit /b
