# HQ Bot

Google Chat 圖片打卡檢查服務。週一到週五 09:25、09:28（Asia/Taipei）檢查指定人員是否已發送上班圖片；09:30（含）前曾發送圖片者視為有上班，若之後未再發送下班圖片，會在 19:00、19:30、20:00 發送 Telegram 告警。

## Features

- 上班圖片檢查預設週一到週五 `25 9 * * 1-5`、`28 9 * * 1-5`
- 下班圖片檢查預設週一到週五 `0 19 * * 1-5`、`30 19 * * 1-5`、`0 20 * * 1-5`
- 依 Google Chat 寄件者 email 精確識別六位指定人員
- 僅計算直接上傳或貼上的圖片附件，不計頭像、emoji、貼圖與連結預覽
- 每次排程最多重複檢查 3 次，並依 Google Chat message ID 去重
- 支援兩種登入：人工 session 授權或 `.env` 帳密自動登入
- 支援在 `WATCH_USERS` 多行設定 email 與可選 Telegram tag（例如 `jeremy.j@spookyy.com, @JSanXiao`）
- 所有執行錯誤都可透過 Telegram 通知

## Setup

1. 安裝依賴

```bash
npm install
```

註：本專案使用 `playwright-core`，不會自動下載瀏覽器。
本機請安裝系統瀏覽器（預設使用 Chromium/Chrome），並可透過 `.env` 設定 `BROWSER_EXECUTABLE_PATH`。
Dockerfile 目前已改為 Node slim + apt 安裝 `chromium`，可直接使用。

2. 建立環境變數

```bash
cp .env.example .env
```

3. 填入 Telegram 參數

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

4. 選擇登入方式

方式 A：帳密自動登入（無需打開瀏覽器）

- 在 `.env` 設定 `GOOGLE_EMAIL` 與 `GOOGLE_PASSWORD`
- 執行：

```bash
npm run auth
```

方式 B：人工登入（原本流程）

```bash
npm run auth
```

執行後會開啟瀏覽器，手動登入 Google 帳號，打開指定 Chat 群組後回到終端按 Enter。Session 會存到 `./state/google-session.json`。

5. 手動測試一次檢查

```bash
npm run check
```

手動測試上班打卡檢查：

```bash
npm run checkin
```

6. 啟動排程

```bash
npm run start
```

## Local Development (Nodemon)

即時重啟（預設執行 `check`）：

```bash
npm run dev
```

固定跑單次檢查流程並在修改後重跑：

```bash
npm run dev:check
```

模擬常駐排程流程（修改檔案後自動重啟 scheduler）：

```bash
npm run start:dev
```

## Linux Deployment (Docker Compose)

### 1. 準備 Linux 主機

- 安裝 Docker Engine 與 Compose Plugin
- 確認可用指令：

```bash
docker --version
docker compose version
```

### 2. 下載程式

```bash
git clone <your-repo-url> hq_bot
cd hq_bot
```

### 3. 設定環境變數

```bash
cp .env.example .env
```

請至少填好：

- `GOOGLE_CHAT_URL`
- `WATCH_USERS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TZ=Asia/Taipei`

`WATCH_USERS` 建議使用多行格式（可加 tag）：

```dotenv
WATCH_USERS="jeremy.j@spookyy.com, @JSanXiao
conner.ch@spookyy.com, @Eason_Chung
ichih.h@spookyy.com, @IchihBackend
rosco.a@spookyy.com, @rosco_07
shane.x@spookyy.com, @shane_hsien
richard.lx@spookyy.com, @richardl0_0"
```

規則：

- 每行格式：`email` 或 `email, @telegram_username`
- email 比對不分大小寫，但必須與 Google Chat 訊息作者 email 完整相符
- 09:30（含）以前未發送圖片者會自動跳過當日晚間檢查

### 4. 選擇登入方式

方式 A（建議你目前情境）：帳密自動登入

- 在 `.env` 填入 `GOOGLE_EMAIL`、`GOOGLE_PASSWORD`
- 服務啟動時若 session 不存在或過期，會自動嘗試登入並更新 `state/google-session.json`

方式 B：人工授權 session

- 先在可開瀏覽器環境執行 `npm run auth` 產生 `state/google-session.json`
- 把該檔案放到 Linux 主機的 `./state/google-session.json`

### 5. 啟動服務

```bash
mkdir -p state logs
docker compose up -d --build
```

### 6. 驗證服務

```bash
docker compose ps
docker compose logs -f hq-bot
```

可手動觸發一次檢查：

```bash
docker compose exec hq-bot npm run check
```

### 7. 更新部署

```bash
git pull
docker compose up -d --build
```

### 8. 回滾（可選）

- 回到上一版 commit
- 重新 build 並啟動：

```bash
docker compose up -d --build
```

## Docker

1. 確保 `./state/google-session.json` 已存在（建議先在本機執行 `npm run auth`）。
2. 啟動服務

```bash
docker compose up -d --build
```

3. 查看日誌

```bash
docker compose logs -f hq-bot
```

## Key Env Vars

- `GOOGLE_CHAT_URL`: 要監控的群組 URL
- `WATCH_USERS`: 支援舊版逗號分隔，或新版多行格式（每行可加 `@tag`）
- `TZ`: 時區，預設 `Asia/Taipei`
- `CHECK_CRON`: 下班圖片檢查 cron，預設 `0 19 * * 1-5,30 19 * * 1-5,0 20 * * 1-5`
- `CHECKIN_CRON`: 上班圖片檢查 cron，預設 `25 9 * * 1-5,28 9 * * 1-5`
- `CHECKIN_CUTOFF`: 上班圖片截止時間，預設 `09:30`；剛好 09:30 的圖片仍算上班
- `CHECK_ATTEMPTS`: 每次上班/下班檢查最多重複讀取 Google Chat 次數，預設 `3`
- `CHECK_RETRY_WAIT_MS`: 每次重查間隔毫秒數，預設 `2000`
- `CHECK_RUN_TIMEOUT_MS`: 單次排程檢查最大執行時間，逾時會釋放排程鎖，預設 `600000`
- `SESSION_PATH`: 瀏覽器 session 路徑
- `BROWSER_TYPE`: `chromium`、`firefox`、`webkit`（預設 `chromium`）
- `BROWSER_CHANNEL`: 瀏覽器 channel（例如 `chrome`、`msedge`，主要用於 chromium）
- `BROWSER_EXECUTABLE_PATH`: 系統瀏覽器執行檔路徑
- `BROWSER_HEADLESS`: 是否使用 headless，預設 `true`
- `GOOGLE_EMAIL`: Google 登入帳號（選填，與密碼一起使用）
- `GOOGLE_PASSWORD`: Google 登入密碼（選填，與帳號一起使用）
- `AUTO_LOGIN_POST_WAIT_MS`: 自動登入完成後等待跳轉毫秒數
- `ALERT_ON_ERRORS`: 是否告警執行錯誤，預設 `true`
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `TELEGRAM_CHAT_ID`: Telegram chat id

## Notes

- 如果設定了 `GOOGLE_EMAIL` 與 `GOOGLE_PASSWORD`，程式在 session 過期時會自動嘗試登入並更新 session。
- 若帳密登入遇到 Google 額外驗證（例如 2FA/challenge），程式會拋出 `LOGIN_CHALLENGE` 並走錯誤告警流程。
