@echo off
chcp 65001 >nul
title 星链智运 · 智慧物流 AI 决策大屏
cd /d %~dp0

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [错误] 未检测到 Node.js 运行环境
  echo  请先安装 Node.js LTS 版：https://nodejs.org/zh-cn
  echo  安装完成后重新双击本文件即可
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo  首次运行，正在安装依赖（约 1-2 分钟）…
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo  [错误] 依赖安装失败，请检查网络后重试
    pause
    exit /b 1
  )
)

if not exist .env copy .env.example .env >nul

echo.
echo  ══════════════════════════════════════════
echo   星链智运服务启动中…
echo   电脑访问：http://localhost:3000
echo   手机访问：http://本机局域网IP:3000 （需与电脑同一 Wi-Fi）
echo   关闭本窗口即停止服务
echo  ══════════════════════════════════════════
echo.

start "" http://localhost:3000
node server\index.js
pause
