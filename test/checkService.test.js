jest.mock("../src/chatClient", () => ({
  fetchChatMessages: jest.fn(),
}));

jest.mock("../src/notifier/telegram", () => {
  const actual = jest.requireActual("../src/notifier/telegram");
  return {
    ...actual,
    sendTelegramMessage: jest.fn(),
  };
});

const { fetchChatMessages } = require("../src/chatClient");
const { sendTelegramMessage } = require("../src/notifier/telegram");
const { runCheck, runCheckInCheck } = require("../src/checkService");

const watchUsers = [
  {
    name: "jeremy.j@spookyy.com",
    email: "jeremy.j@spookyy.com",
    token: "jeremy.j@spookyy.com",
    mentionTag: "@JSanXiao",
  },
  {
    name: "conner.ch@spookyy.com",
    email: "conner.ch@spookyy.com",
    token: "conner.ch@spookyy.com",
    mentionTag: "@Eason_Chung",
  },
];

function buildConfig() {
  return {
    timezone: "Asia/Taipei",
    watchUsers,
    chatUrl: "https://chat.google.com/example",
    check: { attempts: 3, retryWaitMs: 0 },
    checkIn: { cutoffLabel: "09:30", cutoffMinutes: 570 },
    alerts: {
      onErrors: true,
      telegramToken: "token",
      telegramChatId: "chat",
    },
  };
}

function image(id, senderEmail, taipeiTime) {
  return {
    id,
    senderEmail,
    sentAt: `2026-08-11T${taipeiTime}:00+08:00`,
    hasUploadedImage: true,
  };
}

describe("image check service", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    sendTelegramMessage.mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("retries unresolved checkout users and alerts with email and tag", async () => {
    jest.setSystemTime(new Date("2026-08-11T11:00:00.000Z"));
    const snapshot = [
      image("j-in", "jeremy.j@spookyy.com", "09:20"),
      image("j-out", "jeremy.j@spookyy.com", "18:30"),
      image("c-in", "conner.ch@spookyy.com", "09:25"),
    ];
    fetchChatMessages.mockResolvedValue(snapshot);

    const result = await runCheck(buildConfig(), "test");

    expect(fetchChatMessages).toHaveBeenCalledTimes(3);
    expect(result.evaluation.alertUsers.map((item) => item.userName)).toEqual([
      "conner.ch@spookyy.com",
    ]);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage.mock.calls[0][1]).toContain(
      "conner.ch@spookyy.com @Eason_Chung",
    );
  });

  test("stops checkout retries when all active users have a later image", async () => {
    jest.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    fetchChatMessages.mockResolvedValue([
      image("j-in", "jeremy.j@spookyy.com", "09:30"),
      image("j-out", "jeremy.j@spookyy.com", "09:31"),
    ]);

    const result = await runCheck(buildConfig(), "test");

    expect(fetchChatMessages).toHaveBeenCalledTimes(1);
    expect(result.evaluation.alertUsers).toHaveLength(0);
    expect(result.evaluation.skippedUsers.map((item) => item.userName)).toEqual([
      "conner.ch@spookyy.com",
    ]);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  test("alerts users still missing an image at the morning check", async () => {
    jest.setSystemTime(new Date("2026-08-11T01:28:00.000Z"));
    fetchChatMessages.mockResolvedValue([
      image("j-in", "jeremy.j@spookyy.com", "09:25"),
    ]);

    const result = await runCheckInCheck(buildConfig(), "test");

    expect(fetchChatMessages).toHaveBeenCalledTimes(3);
    expect(result.evaluation.alertUsers.map((item) => item.userName)).toEqual([
      "conner.ch@spookyy.com",
    ]);
    expect(sendTelegramMessage.mock.calls[0][1]).toContain("截至 09:28");
  });

  test("continues retrying after a Google Chat read failure", async () => {
    jest.setSystemTime(new Date("2026-08-11T01:28:00.000Z"));
    fetchChatMessages.mockRejectedValueOnce(new Error("chat read failed"));
    fetchChatMessages.mockResolvedValueOnce([
      image("j-in", "jeremy.j@spookyy.com", "09:25"),
      image("c-in", "conner.ch@spookyy.com", "09:27"),
    ]);

    const result = await runCheckInCheck(buildConfig(), "test");

    expect(fetchChatMessages).toHaveBeenCalledTimes(2);
    expect(result.parsed.successfulAttempts).toBe(1);
    expect(result.evaluation.alertUsers).toHaveLength(0);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
