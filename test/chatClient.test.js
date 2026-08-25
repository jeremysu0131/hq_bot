const {
  collectChatMessages,
  fillFirstVisibleInput,
  isGoogleCaptchaChallenge,
  mergeMessageSnapshots,
  oldestMessageTimestamp,
} = require("../src/chatClient");

describe("fillFirstVisibleInput", () => {
  test("waits for and fills the visible matching input", async () => {
    const fill = jest.fn();
    const waitFor = jest.fn();
    const first = jest.fn(() => ({ fill, waitFor }));
    const filter = jest.fn(() => ({ first }));
    const locator = jest.fn(() => ({ filter }));
    const page = { locator };

    await fillFirstVisibleInput(page, "input[type='password']", "secret", 1234);

    expect(locator).toHaveBeenCalledWith("input[type='password']");
    expect(filter).toHaveBeenCalledWith({ visible: true });
    expect(first).toHaveBeenCalled();
    expect(waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 1234 });
    expect(fill).toHaveBeenCalledWith("secret");
  });
});

describe("isGoogleCaptchaChallenge", () => {
  test("detects Google CAPTCHA text", () => {
    expect(isGoogleCaptchaChallenge("輸入您聽到或看到的文字")).toBe(true);
    expect(isGoogleCaptchaChallenge("Enter the text you hear or see")).toBe(true);
    expect(isGoogleCaptchaChallenge("Password")).toBe(false);
  });
});

describe("mergeMessageSnapshots", () => {
  test("deduplicates by message id and preserves discovered metadata", () => {
    const target = new Map();
    mergeMessageSnapshots(target, {
      messages: [
        {
          id: "m1",
          senderEmail: "jeremy.j@spookyy.com",
          sentAt: "",
          hasUploadedImage: false,
        },
      ],
    });
    mergeMessageSnapshots(target, {
      messages: [
        {
          id: "m1",
          senderEmail: "",
          sentAt: "2026-08-11T01:25:00.000Z",
          hasUploadedImage: true,
        },
      ],
    });

    expect(Array.from(target.values())).toEqual([
      {
        id: "m1",
        senderEmail: "jeremy.j@spookyy.com",
        sentAt: "2026-08-11T01:25:00.000Z",
        hasUploadedImage: true,
      },
    ]);
  });
});

describe("oldestMessageTimestamp", () => {
  test("returns the earliest valid message timestamp", () => {
    expect(
      oldestMessageTimestamp([
        { sentAt: "2026-08-14T01:00:00.000Z" },
        { sentAt: "" },
        { sentAt: "2026-08-13T22:00:00.000Z" },
      ]),
    ).toBe(Date.parse("2026-08-13T22:00:00.000Z"));
  });
});

describe("collectChatMessages", () => {
  test("keeps messages from each viewport while scrolling toward older rows", async () => {
    const page = {
      evaluate: jest
        .fn()
        .mockResolvedValueOnce({
          containerCount: 1,
          mainTextLength: 20,
          messages: [
            {
              id: "newer",
              senderEmail: "conner.ch@spookyy.com",
              sentAt: "2026-08-11T01:14:00.000Z",
              hasUploadedImage: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          firstMessageId: "newer",
          moved: true,
          scrollHeight: 2000,
        })
        .mockResolvedValueOnce({
          containerCount: 1,
          mainTextLength: 20,
          messages: [
            {
              id: "older",
              senderEmail: "rosco.a@spookyy.com",
              sentAt: "2026-08-11T00:02:00.000Z",
              hasUploadedImage: true,
            },
          ],
        }),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    const messages = await collectChatMessages(
      page,
      {
        chat: {
          scrollRounds: 4,
          scrollWaitMs: 1,
          scrollLoadTimeoutMs: 5000,
        },
      },
      { oldestRequiredAt: "2026-08-11T00:02:00.000Z" },
    );

    expect(messages.map((message) => message.id)).toEqual(["newer", "older"]);
    expect(page.waitForTimeout).toHaveBeenCalledTimes(1);
  });

  test("stops after collecting a message at the required time", async () => {
    const page = {
      evaluate: jest.fn().mockResolvedValue({
        containerCount: 1,
        mainTextLength: 20,
        messages: [
          {
            id: "at-boundary",
            senderEmail: "jeremy.j@spookyy.com",
            sentAt: "2026-08-13T22:00:00.000Z",
            hasUploadedImage: true,
          },
        ],
      }),
      waitForTimeout: jest.fn(),
    };

    const messages = await collectChatMessages(
      page,
      { chat: { scrollRounds: 1, scrollWaitMs: 1 } },
      { oldestRequiredAt: "2026-08-13T22:00:00.000Z" },
    );

    expect(messages.map((message) => message.id)).toEqual(["at-boundary"]);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.waitForTimeout).not.toHaveBeenCalled();
  });

  test("fails when reaching scrollTop zero does not load an older batch", async () => {
    const page = {
      evaluate: jest
        .fn()
        .mockResolvedValueOnce({
          containerCount: 1,
          mainTextLength: 20,
          messages: [
            {
              id: "room-start",
              senderEmail: "jeremy.j@spookyy.com",
              sentAt: "2026-08-14T00:30:00.000Z",
              hasUploadedImage: false,
            },
          ],
        })
        .mockResolvedValueOnce({
          firstMessageId: "room-start",
          moved: false,
          scrollHeight: 1000,
        }),
      waitForFunction: jest.fn().mockRejectedValue(new Error("timeout")),
      waitForTimeout: jest.fn(),
    };

    await expect(
      collectChatMessages(
        page,
        {
          chat: {
            scrollRounds: 2,
            scrollWaitMs: 1,
            scrollLoadTimeoutMs: 5000,
          },
        },
        { oldestRequiredAt: "2026-08-13T22:00:00.000Z" },
      ),
    ).rejects.toMatchObject({ code: "CHAT_SCROLL_INCOMPLETE" });

    expect(page.waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ firstMessageId: "room-start" }),
      { timeout: 5000 },
    );
  });

  test("fails when the required time is not reached within the scroll limit", async () => {
    const snapshot = {
      containerCount: 1,
      mainTextLength: 20,
      messages: [
        {
          id: "too-new",
          senderEmail: "jeremy.j@spookyy.com",
          sentAt: "2026-08-14T00:30:00.000Z",
          hasUploadedImage: false,
        },
      ],
    };
    const page = {
      evaluate: jest
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockResolvedValueOnce({
          firstMessageId: "too-new",
          moved: true,
          scrollHeight: 2000,
        })
        .mockResolvedValueOnce(snapshot),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      collectChatMessages(
        page,
        {
          chat: {
            scrollRounds: 2,
            scrollWaitMs: 1,
            scrollLoadTimeoutMs: 5000,
          },
        },
        { oldestRequiredAt: "2026-08-13T22:00:00.000Z" },
      ),
    ).rejects.toMatchObject({ code: "CHAT_SCROLL_INCOMPLETE" });
  });

  test("fails a complete time range when no image attachments were loaded", async () => {
    const page = {
      evaluate: jest.fn().mockResolvedValue({
        containerCount: 1,
        mainTextLength: 20,
        messages: [
          {
            id: "text-only",
            senderEmail: "jeremy.j@spookyy.com",
            sentAt: "2026-08-13T22:00:00.000Z",
            hasUploadedImage: false,
          },
        ],
      }),
    };

    await expect(
      collectChatMessages(
        page,
        { chat: { scrollRounds: 1 } },
        {
          oldestRequiredAt: "2026-08-13T22:00:00.000Z",
          requireUploadedImage: true,
        },
      ),
    ).rejects.toMatchObject({ code: "CHAT_ATTACHMENT_LOAD_INCOMPLETE" });
  });
});
