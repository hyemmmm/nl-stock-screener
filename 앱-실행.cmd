@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   자연어 종목 스크리너 실행 중...
echo   잠시 후 브라우저가 자동으로 열립니다. (창을 닫으면 종료)
echo.
start "" cmd /c "timeout /t 9 >nul & start http://localhost:3000"
npm run dev
