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
        .mockResolvedValueOnce({ moved: true, atTop: false })
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
        })
        .mockResolvedValueOnce({ moved: false, atTop: true }),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    const messages = await collectChatMessages(
      page,
      { chat: { scrollRounds: 4, scrollWaitMs: 1 } },
      { oldestRequiredAt: "2026-08-10T22:00:00.000Z" },
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

  test("accepts the complete snapshot when the message list is already at the top", async () => {
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
        .mockResolvedValueOnce({ moved: false, atTop: true }),
      waitForTimeout: jest.fn(),
    };

    const messages = await collectChatMessages(
      page,
      { chat: { scrollRounds: 1, scrollWaitMs: 1 } },
      { oldestRequiredAt: "2026-08-13T22:00:00.000Z" },
    );

    expect(messages.map((message) => message.id)).toEqual(["room-start"]);
    expect(page.waitForTimeout).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce({ moved: true, atTop: false })
        .mockResolvedValueOnce(snapshot)
        .mockResolvedValueOnce({ moved: true, atTop: false }),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      collectChatMessages(
        page,
        { chat: { scrollRounds: 2, scrollWaitMs: 1 } },
        { oldestRequiredAt: "2026-08-13T22:00:00.000Z" },
      ),
    ).rejects.toMatchObject({ code: "CHAT_SCROLL_INCOMPLETE" });
  });
});
