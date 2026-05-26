const cron = require("node-cron");
const {
  runCheck,
  runCheckInCheck,
  safeSendErrorAlert,
} = require("./checkService");

function startScheduler(config) {
  let isRunning = false;

  const run = async (name, checkFn) => {
    if (isRunning) {
      console.warn(`Skip ${name} tick: previous check is still running.`);
      return;
    }

    isRunning = true;
    try {
      await checkFn(config, "scheduler");
    } catch (error) {
      console.error(`Scheduled ${name} check failed:`, error.message);
    } finally {
      isRunning = false;
    }
  };

  const tasks = [
    ...config.checkInCronExpressions.map((expr) =>
      cron.schedule(expr, () => run("check-in", runCheckInCheck), {
        timezone: config.timezone,
      }),
    ),
    ...config.cronExpressions.map((expr) =>
      cron.schedule(expr, () => run("check-out", runCheck), {
        timezone: config.timezone,
      }),
    ),
  ];

  console.log(
    [
      "Scheduler started:",
      `check-in=${config.checkInCronExpressions.join(", ")}`,
      `check-out=${config.cronExpressions.join(", ")}`,
      `(${config.timezone})`,
    ].join(" "),
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
