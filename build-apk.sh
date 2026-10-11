#!/usr/bin/env bash
# 星链智运 v3.0 · 一键构建 Android APK（macOS / Linux）
set -e
echo "============================================"
echo "  星链智运 v3.0 · 一键构建 Android APK"
echo "============================================"
command -v java >/dev/null || { echo "[错误] 未检测到 Java，请先安装 JDK 17：brew install openjdk@17"; exit 1; }
[ -n "$ANDROID_HOME" ] || { echo "[错误] 未设置 ANDROID_HOME（通常为 ~/Library/Android/sdk 或 ~/Android/Sdk）"; exit 1; }

cd "$(dirname "$0")"
echo "[1/3] 同步前端资源…"
npx cap sync android
echo "[2/3] Gradle 构建（首次约 5-15 分钟）…"
cd android && ./gradlew assembleDebug
echo "[3/3] 完成！APK：android/app/build/outputs/apk/debug/app-debug.apk"
