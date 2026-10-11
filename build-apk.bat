@echo off
chcp 65001 >nul
setlocal
echo ============================================
echo   星链智运 v3.0 · 一键构建 Android APK
echo ============================================
echo.
echo 前置条件（只需安装一次）：
echo   1. 安装 JDK 21 ：https://adoptium.net/temurin/releases/?version=21
echo   2. 安装 Android Studio（内含 Android SDK）：https://developer.android.com/studio
echo   3. 设置环境变量 ANDROID_HOME 指向 SDK 目录（如 C:\Users\你的用户名\AppData\Local\Android\Sdk）
echo.
where java >nul 2>nul
if errorlevel 1 (echo [错误] 未检测到 Java，请先安装 JDK 17 & pause & exit /b 1)
if not defined ANDROID_HOME (echo [错误] 未设置 ANDROID_HOME 环境变量 & pause & exit /b 1)

cd /d %~dp0
echo [1/3] 同步最新前端资源到 Android 工程...
call npx cap sync android
if errorlevel 1 (echo [错误] cap sync 失败，请先运行 npm install & pause & exit /b 1)

echo [2/3] 开始 Gradle 构建（首次会自动下载 Gradle 与依赖，约 5-15 分钟）...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (echo [错误] 构建失败，请检查上方日志 & pause & exit /b 1)

echo [3/3] 构建完成！
echo.
echo APK 位置：android\app\build\outputs\apk\debug\app-debug.apk
echo 用数据线/微信/QQ 传到手机即可安装（安装时允许"未知来源"应用）。
echo.
echo 首次打开 APP 会自动弹出「互联」设置：
echo   填入电脑端服务地址（电脑启动 exe 后，页面右上角"互联"里显示的"手机访问地址"）
echo   手机和电脑连同一 WiFi 即可实时共享数据。
explorer android\app\build\outputs\apk\debug
pause
