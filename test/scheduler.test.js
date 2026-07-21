jest.mock("node-cron", () => ({
  schedule: jest.fn((expr, callback, options) => ({
    expr,
    callback,
    options,
  })),
}));

jest.mock("../src/checkService", () => ({
  runCheck: jest.fn(),
  runCheckInCheck: jest.fn(),
  safeSendErrorAlert: jest.fn(),
}));

const cron = require("node-cron");
const {
  runCheck,
  runCheckInCheck,
  safeSendErrorAlert,
} = require("../src/checkService");
const { getRunTimeoutMs, startScheduler } = require("../src/scheduler");

function buildConfig() {
  return {
    timezone: "Asia/Taipei",
    checkInCronExpressions: ["45 9 * * 1-5"],
    cronExpressions: ["30 19 * * *"],
    check: {
      runTimeoutMs: 1000,
    },
    alerts: {
      onErrors: true,
    },
  };
}

function flushPromises() {
  return Promise.resolve();
}

describe("startScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("releases scheduler lock after a stuck check times out", async () => {
    runCheckInCheck.mockReturnValue(new Promise(() => {}));
    runCheck.mockResolvedValue({ ok: true });

    const tasks = startScheduler(buildConfig());

    const stuckRun = tasks[0].callback();
    await flushPromises();

    await tasks[1].callback();
    expect(runCheck).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "Skip check-out tick: previous check is still running.",
    );

    jest.advanceTimersByTime(1000);
    await stuckRun;

    await tasks[1].callback();

    expect(runCheck).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "Scheduled check-in check failed:",
      "Scheduled check-in check exceeded 1000ms and released the scheduler lock.",
    );
    expect(safeSendErrorAlert).toHaveBeenCalledTimes(1);
  });

  test("uses default run timeout when config does not override it", () => {
    expect(getRunTimeoutMs({})).toBe(600000);
  });

  test("schedules check-in and check-out tasks with configured timezone", () => {
    const tasks = startScheduler(buildConfig());

    expect(tasks).toHaveLength(2);
    expect(cron.schedule).toHaveBeenNthCalledWith(
      1,
      "45 9 * * 1-5",
      expect.any(Function),
      { timezone: "Asia/Taipei" },
    );
    expect(cron.schedule).toHaveBeenNthCalledWith(
      2,
      "30 19 * * *",
      expect.any(Function),
      { timezone: "Asia/Taipei" },
    );
  });
});
