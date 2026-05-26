const { loadConfig } = require("./config");
const { AppError, toErrorSummary } = require("./errors");
const { runAuth } = require("./auth");
const { runCheck, runCheckInCheck } = require("./checkService");
const { startScheduler } = require("./scheduler");
const { sendTelegramMessage } = require("./notifier/telegram");
const { version } = require("../package.json");
const dayjs = require("./dayjs");

async function main() {
  const mode = process.argv[2] || "start";

  if (!["auth", "check", "checkin", "start"].includes(mode)) {
    throw new AppError("MODE_INVALID", `Unsupported mode: ${mode}`);
  }

  const config = loadConfig(mode);

  if (mode === "auth") {
    await runAuth(config);
    return;
  }

  if (mode === "check") {
    await runCheck(config, "manual");
    return;
  }

  if (mode === "checkin") {
    await runCheckInCheck(config, "manual");
    return;
  }

  startScheduler(config);

  const startedAt = dayjs().tz(config.timezone).format("YYYY-MM-DD HH:mm:ss");
  const startupMessage = [
    "[HQ Bot] 服務啟動成功",
    `Version: ${version}`,
    `Time: ${startedAt} (${config.timezone})`,
  ].join("\n");

  sendTelegramMessage(config, startupMessage).catch((error) => {
    console.error("Failed to send startup message:", error.message);
  });
}

main().catch((error) => {
  console.error(toErrorSummary(error));
  if (error.cause) {
    console.error(`Caused by: ${toErrorSummary(error.cause)}`);
  }
  process.exitCode = 1;
});
