const {
  collectChatMessages,
  fillFirstVisibleInput,
  isGoogleCaptchaChallenge,
  mergeMessageSnapshots,
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
        .mockResolvedValueOnce(true)
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
        .mockResolvedValueOnce(false),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    };

    const messages = await collectChatMessages(page, {
      chat: { scrollRounds: 4, scrollWaitMs: 1 },
    });

    expect(messages.map((message) => message.id)).toEqual(["newer", "older"]);
    expect(page.waitForTimeout).toHaveBeenCalledTimes(1);
  });
});
