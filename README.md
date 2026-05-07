# HQ Bot

Google Chat 打卡檢查服務。每天 19:30（Asia/Taipei）檢查指定人員是否「有上班但未在 19:30 前下班」，若符合條件即送 Telegram 告警。

## Features

- 每日固定時間檢查（預設 `30 19 * * *`）
- 監控指定人員（預設 `HQT - Jeremy,HQT - Conner`）
- 支援多種日期與時間格式（例如 `5月7日`、`05月07日`、`5/7`、`1924`、`20：10`）
- 支援兩種登入：人工 session 授權或 `.env` 帳密自動登入
- 支援在 `WATCH_USERS` 多行設定使用者與可選 Telegram tag（例如 `HQT - Jeremy, @JSanXiao`）
- 若有上班打卡者皆完成下班打卡，會主動發送「全員打卡完成」訊息
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
WATCH_USERS="HQT - Jeremy, @JSanXiao
HQT - Conner
HQT - Shane
HQT - Rosco
HQT - Ichih
PHP - Richard"
```

規則：

- 每行格式：`顯示名稱` 或 `顯示名稱, @telegram_username`
- 若某人未抓到上班打卡，會自動跳過該人的下班檢查（不告警）
- 有上班打卡的人都完成下班後，會發送完成通知

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
- `CHECK_CRON`: cron 表示式，預設 `30 19 * * *`
- `CHECK_CUTOFF`: 規則截止時間，預設 `19:30`
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
