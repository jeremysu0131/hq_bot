const { loadConfig, parseWatchUsers } = require("../src/config");

describe("parseWatchUsers", () => {
  test("parses legacy comma-separated format", () => {
    const users = parseWatchUsers("HQT - Jeremy,HQT - Conner");

    expect(users.map((item) => item.name)).toEqual([
      "HQT - Jeremy",
      "HQT - Conner",
    ]);
    expect(users.map((item) => item.mentionTag)).toEqual(["", ""]);
  });

  test("parses multiline format with optional tags", () => {
    const users = parseWatchUsers(
      `HQT - Jeremy, @JSanXiao\nHQT - Conner\nPHP - Richard, richard_dev`,
    );

    expect(users.map((item) => item.name)).toEqual([
      "HQT - Jeremy",
      "HQT - Conner",
      "PHP - Richard",
    ]);

    expect(users.map((item) => item.mentionTag)).toEqual([
      "@JSanXiao",
      "",
      "@richard_dev",
    ]);
  });
});

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_CHAT_URL: "https://chat.google.com/example",
      WATCH_USERS: "HQT - Jeremy",
      BROWSER_TYPE: "chromium",
      BROWSER_CDP_ENDPOINT: "http://127.0.0.1:9222",
      BROWSER_EXECUTABLE_PATH: "",
      CHECK_CRON: "30 19 * * *",
      CHECK_CUTOFF: "19:30",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("loads remote Chromium CDP endpoint", () => {
    const config = loadConfig("check");

    expect(config.browser.cdpEndpoint).toBe("http://127.0.0.1:9222");
    expect(config.browser.type).toBe("chromium");
  });
});
