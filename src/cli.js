const { loadConfig } = require("./config");
const { AppError } = require("./errors");
const { runAuth } = require("./auth");
const { runCheck } = require("./checkService");
const { startScheduler } = require("./scheduler");
const { sendTelegramMessage } = require("./notifier/telegram");

async function main() {
  const mode = process.argv[2] || "start";

  if (!["auth", "check", "start"].includes(mode)) {
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

  startScheduler(config);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
