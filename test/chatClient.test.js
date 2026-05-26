const {
  fillFirstVisibleInput,
  isGoogleCaptchaChallenge,
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
