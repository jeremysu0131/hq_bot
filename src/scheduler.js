const cron = require("node-cron");
const {
  runCheck,
  runCheckInCheck,
  safeSendErrorAlert,
} = require("./checkService");
const { AppError } = require("./errors");

const DEFAULT_RUN_TIMEOUT_MS = 10 * 60 * 1000;

function getRunTimeoutMs(config) {
  return config.check?.runTimeoutMs || DEFAULT_RUN_TIMEOUT_MS;
}

function withTimeout(promise, timeoutMs, buildError) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(buildError());
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function startScheduler(config) {
  let runningRunId = null;
  let nextRunId = 0;

  const run = async (name, checkFn) => {
    if (runningRunId !== null) {
      console.warn(`Skip ${name} tick: previous check is still running.`);
      return;
    }

    nextRunId += 1;
    const runId = nextRunId;
    runningRunId = runId;
    const timeoutMs = getRunTimeoutMs(config);

    try {
      await withTimeout(
        checkFn(config, "scheduler"),
        timeoutMs,
        () =>
          new AppError(
            "CHECK_TIMEOUT",
            `Scheduled ${name} check exceeded ${timeoutMs}ms and released the scheduler lock.`,
          ),
      );
    } catch (error) {
      console.error(`Scheduled ${name} check failed:`, error.message);
      if (error.code === "CHECK_TIMEOUT") {
        await safeSendErrorAlert(config, `scheduled_${name}`, error);
      }
    } finally {
      if (runningRunId === runId) {
        runningRunId = null;
      }
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
  getRunTimeoutMs,
  startScheduler,
  withTimeout,
};
