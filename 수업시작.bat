@echo off
chcp 65001 >nul
title AI·AX 수업 서버
cd /d "%~dp0"

echo ============================================
echo   AI · AX 수업 서버를 시작합니다
echo ============================================
echo.

REM --- Node 설치 확인 ---
where node >nul 2>nul
if errorlevel 1 (
  echo [오류] Node.js가 설치되어 있지 않습니다.
  echo        https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
  echo.
  pause
  exit /b 1
)

REM --- 최초 1회: 필요한 파일 설치 ---
if not exist "node_modules" (
  echo [준비] 처음 실행이라 필요한 파일을 설치합니다. 몇 분 걸릴 수 있어요...
  call npm install
  if errorlevel 1 ( echo [오류] 설치 실패. & pause & exit /b 1 )
)

REM --- 화면 빌드가 없으면 빌드 ---
if not exist "client\dist\index.html" (
  echo [준비] 수업 화면을 빌드합니다...
  call npm run build
  if errorlevel 1 ( echo [오류] 빌드 실패. & pause & exit /b 1 )
)

echo.
echo [실행] 서버를 켭니다. 잠시 후 강사 콘솔이 자동으로 열립니다.
echo        주소: http://localhost:8787/teach
echo        (이 창을 닫으면 수업 서버도 꺼집니다. 수업 끝날 때까지 열어두세요.)
echo.

REM --- 서버가 응답하면 브라우저를 자동으로 연다 (최대 40초 대기) ---
start "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest -UseBasicParsing 'http://localhost:8787/' -TimeoutSec 2 ^| Out-Null; break}catch{Start-Sleep -Seconds 1}}; Start-Process 'http://localhost:8787/teach'"

REM --- 서버 실행 (이 줄에서 창이 계속 떠 있음) ---
call npm start

echo.
echo 서버가 종료되었습니다.
pause
