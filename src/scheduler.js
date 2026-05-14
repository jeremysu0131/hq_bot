const cron = require("node-cron");
const { runCheck, safeSendErrorAlert } = require("./checkService");

function startScheduler(config) {
  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      console.warn("Skip tick: previous check is still running.");
      return;
    }

    isRunning = true;
    try {
      await runCheck(config, "scheduler");
    } catch (error) {
      console.error("Scheduled check failed:", error.message);
    } finally {
      isRunning = false;
    }
  };

  const tasks = config.cronExpressions.map((expr) =>
    cron.schedule(expr, run, { timezone: config.timezone }),
  );

  console.log(
    `Scheduler started: ${config.cronExpressions.join(", ")} (${config.timezone})`,
  );

  process.on("unhandledRejection", async (error) => {
    await safeSendErrorAlert(config, "unhandled_rejection", error);
    console.error("Unhandled rejection:", error);
  });

  process.on("uncaughtException", async (error) => {
    await safeSendErrorAlert(config, "uncaught_exception", error);
    console.error("Uncaught exception:", error);
  });

  return tasks;
}

module.exports = {
  startScheduler,
};
