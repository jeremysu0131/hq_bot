const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const dotenv = require("dotenv");
const { AppError } = require("./errors");
const { normalizeNameToken } = require("./utils/text");
const { parseCutoff } = require("./utils/time");

dotenv.config();

function parseBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "y", "on"].includes(String(value).toLowerCase());
}

function parseInteger(name, value, defaultValue, { min, max }) {
  const parsed = value === undefined ? defaultValue : Number(value);

  if (!Number.isInteger(parsed)) {
    throw new AppError("CONFIG_INVALID", `${name} must be an integer`);
  }

  if (parsed < min || parsed > max) {
    throw new AppError(
      "CONFIG_INVALID",
      `${name} must be between ${min} and ${max}`,
    );
  }

  return parsed;
}

function parseBrowserType(value) {
  const normalized = String(value || "chromium")
    .trim()
    .toLowerCase();
  const supported = new Set(["chromium", "firefox", "webkit"]);

  if (!supported.has(normalized)) {
    throw new AppError(
      "CONFIG_INVALID",
      "BROWSER_TYPE must be one of: chromium, firefox, webkit",
    );
  }

  return normalized;
}

function normalizeMentionTag(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }

  return value.startsWith("@") ? value : `@${value}`;
}

function parseWatchUsers(value) {
  const source = String(value || "HQT - Jeremy,HQT - Conner")
    .replace(/\r/g, "")
    .trim();
  const isMultiLine = source.includes("\n");
  const records = isMultiLine
    ? source
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
    : source
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  const seen = new Set();
  const users = [];

  for (const record of records) {
    let name = record;
    let mentionTag = "";

    // Multiline format supports: "Display Name, @telegram_username"
    if (isMultiLine) {
      const match = record.match(/^(.*?)(?:\s*,\s*(@?\S+))?$/);
      if (match) {
        name = (match[1] || "").trim();
        mentionTag = normalizeMentionTag(match[2] || "");
      }
    }

    const token = normalizeNameToken(name);
    if (!token || seen.has(token)) {
      continue;
    }

    seen.add(token);
    users.push({
      name,
      token,
      mentionTag,
    });
  }

  return users;
}

function ensureRuntimePaths(config) {
  fs.mkdirSync(path.dirname(config.sessionPath), { recursive: true });
  fs.mkdirSync(config.logDir, { recursive: true });
}

function loadConfig(mode) {
  const selectedMode = mode || "start";
  const chatUrl = process.env.GOOGLE_CHAT_URL;
  const timezone = process.env.TZ || "Asia/Taipei";
  const cronExpression = process.env.CHECK_CRON || "30 19 * * *";
  const cutoffLabel = process.env.CHECK_CUTOFF || "19:30";
  const googleEmail = (process.env.GOOGLE_EMAIL || "").trim();
  const googlePassword = process.env.GOOGLE_PASSWORD || "";
  const browserExecutablePath = (
    process.env.BROWSER_EXECUTABLE_PATH || ""
  ).trim();
  const cutoffMinutes = parseCutoff(cutoffLabel);

  if (cutoffMinutes === null) {
    throw new AppError("CONFIG_INVALID", "CHECK_CUTOFF must use HH:mm format");
  }

  if (selectedMode === "start" && !cron.validate(cronExpression)) {
    throw new AppError("CONFIG_INVALID", "CHECK_CRON is invalid");
  }

  if (!chatUrl) {
    throw new AppError("CONFIG_MISSING", "GOOGLE_CHAT_URL is required");
  }

  if ((googleEmail && !googlePassword) || (!googleEmail && googlePassword)) {
    throw new AppError(
      "CONFIG_INVALID",
      "GOOGLE_EMAIL and GOOGLE_PASSWORD must be set together",
    );
  }

  const watchUsers = parseWatchUsers(process.env.WATCH_USERS);
  if (selectedMode !== "auth" && watchUsers.length === 0) {
    throw new AppError(
      "CONFIG_MISSING",
      "WATCH_USERS must contain at least one name",
    );
  }

  const config = {
    mode: selectedMode,
    chatUrl,
    watchUsers,
    timezone,
    cronExpression,
    cutoffLabel,
    cutoffMinutes,
    sessionPath: path.resolve(
      process.cwd(),
      process.env.SESSION_PATH || "./state/google-session.json",
    ),
    logDir: path.resolve(process.cwd(), "./logs"),
    browser: {
      type: parseBrowserType(
        process.env.BROWSER_TYPE ||
          process.env.PLAYWRIGHT_BROWSER ||
          "chromium",
      ),
      headless: parseBoolean(
        process.env.BROWSER_HEADLESS ?? process.env.PLAYWRIGHT_HEADLESS,
        true,
      ),
      channel: (process.env.BROWSER_CHANNEL || "").trim() || undefined,
      executablePath: browserExecutablePath
        ? path.resolve(process.cwd(), browserExecutablePath)
        : undefined,
    },
    chat: {
      loadTimeoutMs: parseInteger(
        "CHAT_LOAD_TIMEOUT_MS",
        process.env.CHAT_LOAD_TIMEOUT_MS,
        45000,
        { min: 10000, max: 180000 },
      ),
      scrollRounds: parseInteger(
        "CHAT_SCROLL_ROUNDS",
        process.env.CHAT_SCROLL_ROUNDS,
        24,
        {
          min: 1,
          max: 120,
        },
      ),
      scrollWaitMs: parseInteger(
        "CHAT_SCROLL_WAIT_MS",
        process.env.CHAT_SCROLL_WAIT_MS,
        450,
        {
          min: 100,
          max: 5000,
        },
      ),
    },
    check: {
      attempts: parseInteger("CHECK_ATTEMPTS", process.env.CHECK_ATTEMPTS, 3, {
        min: 1,
        max: 10,
      }),
      retryWaitMs: parseInteger(
        "CHECK_RETRY_WAIT_MS",
        process.env.CHECK_RETRY_WAIT_MS,
        2000,
        {
          min: 0,
          max: 60000,
        },
      ),
    },
    auth: {
      googleEmail,
      googlePassword,
      autoLoginEnabled: Boolean(googleEmail && googlePassword),
      postLoginWaitMs: parseInteger(
        "AUTO_LOGIN_POST_WAIT_MS",
        process.env.AUTO_LOGIN_POST_WAIT_MS,
        15000,
        {
          min: 3000,
          max: 60000,
        },
      ),
    },
    alerts: {
      onErrors: parseBoolean(process.env.ALERT_ON_ERRORS, true),
      telegramToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
    },
  };

  ensureRuntimePaths(config);
  return config;
}

module.exports = {
  loadConfig,
  parseWatchUsers,
};
