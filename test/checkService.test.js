const dayjs = require("../src/dayjs");
const { normalizeNameToken } = require("../src/utils/text");

jest.mock("../src/chatClient", () => ({
  fetchChatRawText: jest.fn(),
}));

jest.mock("../src/notifier/telegram", () => {
  const actual = jest.requireActual("../src/notifier/telegram");
  return {
    ...actual,
    sendTelegramMessage: jest.fn(),
  };
});

const { fetchChatRawText } = require("../src/chatClient");
const { sendTelegramMessage } = require("../src/notifier/telegram");
const { runCheck } = require("../src/checkService");

const watchUsers = [
  {
    name: "HQT - Jeremy",
    token: normalizeNameToken("HQT - Jeremy"),
    mentionTag: "@JSanXiao",
  },
  {
    name: "HQT - Conner",
    token: normalizeNameToken("HQT - Conner"),
    mentionTag: "@Eason_Chung",
  },
];

function buildConfig() {
  return {
    timezone: "Asia/Taipei",
    watchUsers,
    cutoffLabel: "19:30",
    cutoffMinutes: 1170,
    chatUrl: "https://chat.google.com/example",
    check: {
      attempts: 3,
      retryWaitMs: 0,
    },
    alerts: {
      onErrors: true,
      telegramToken: "token",
      telegramChatId: "chat",
    },
  };
}

function todayLabel() {
  const now = dayjs().tz("Asia/Taipei");
  return `${now.month() + 1}月${now.date()}日`;
}

describe("runCheck retry flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    sendTelegramMessage.mockResolvedValue({ sent: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("keeps checked-out users and retries only unresolved users before alerting", async () => {
    const dateLabel = todayLabel();

    fetchChatRawText
      .mockResolvedValueOnce(`
HQT - Jeremy ${dateLabel}，09:01 上班
HQT - Jeremy ${dateLabel}，18:30 下班
HQT - Conner ${dateLabel}，09:12 上班
`)
      .mockResolvedValueOnce(`
HQT - Conner ${dateLabel}，09:12 上班
`)
      .mockResolvedValueOnce(`
HQT - Conner ${dateLabel}，09:12 上班
`);

    const result = await runCheck(buildConfig(), "test");

    expect(fetchChatRawText).toHaveBeenCalledTimes(3);
    expect(result.evaluation.checkedUsers.map((item) => item.userName)).toEqual([
      "HQT - Jeremy",
    ]);
    expect(result.evaluation.alertUsers.map((item) => item.userName)).toEqual([
      "HQT - Conner",
    ]);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);

    const sentMessage = sendTelegramMessage.mock.calls[0][1];
    expect(sentMessage).toContain("HQT - Conner @Eason_Chung");
    expect(sentMessage).not.toContain("HQT - Jeremy @JSanXiao");
  });

  test("stops retrying when all checked-in users are checked out", async () => {
    const dateLabel = todayLabel();

    fetchChatRawText
      .mockResolvedValueOnce(`
HQT - Jeremy ${dateLabel}，09:01 上班
HQT - Jeremy ${dateLabel}，18:30 下班
HQT - Conner ${dateLabel}，09:12 上班
`)
      .mockResolvedValueOnce(`
HQT - Conner ${dateLabel}，18:36 下班
`);

    const result = await runCheck(buildConfig(), "test");

    expect(fetchChatRawText).toHaveBeenCalledTimes(2);
    expect(result.evaluation.alertUsers).toHaveLength(0);
    expect(result.evaluation.checkedUsers.map((item) => item.userName)).toEqual([
      "HQT - Jeremy",
      "HQT - Conner",
    ]);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage.mock.calls[0][1]).toContain(
      "[HQ Bot] 打卡檢查完成",
    );
  });

  test("continues retrying after a Google Chat read failure", async () => {
    const dateLabel = todayLabel();

    fetchChatRawText.mockRejectedValueOnce(new Error("chat read failed"));
    fetchChatRawText.mockResolvedValueOnce(`
HQT - Jeremy ${dateLabel}，09:01 上班
HQT - Jeremy ${dateLabel}，18:30 下班
HQT - Conner ${dateLabel}，09:12 上班
HQT - Conner ${dateLabel}，18:36 下班
`);

    const result = await runCheck(buildConfig(), "test");

    expect(fetchChatRawText).toHaveBeenCalledTimes(2);
    expect(result.parsed.attempts).toBe(2);
    expect(result.parsed.successfulAttempts).toBe(1);
    expect(result.evaluation.alertUsers).toHaveLength(0);
    expect(result.evaluation.checkedUsers.map((item) => item.userName)).toEqual([
      "HQT - Jeremy",
      "HQT - Conner",
    ]);
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage.mock.calls[0][1]).toContain(
      "[HQ Bot] 打卡檢查完成",
    );
  });
});
