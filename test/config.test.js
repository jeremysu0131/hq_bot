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
      `Jeremy.J@Spookyy.com, @JSanXiao\nconner.ch@spookyy.com\nrichard.lx@spookyy.com, richard_dev`,
    );

    expect(users.map((item) => item.name)).toEqual([
      "jeremy.j@spookyy.com",
      "conner.ch@spookyy.com",
      "richard.lx@spookyy.com",
    ]);
    expect(users.map((item) => item.token)).toEqual(
      users.map((item) => item.name),
    );

    expect(users.map((item) => item.mentionTag)).toEqual([
      "@JSanXiao",
      "",
      "@richard_dev",
    ]);
  });
});

describe("loadConfig", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  test("rejects legacy display names because image matching requires email", () => {
    process.env = {
      ...originalEnv,
      GOOGLE_CHAT_URL: "https://chat.google.com/example",
      WATCH_USERS: "HQT - Jeremy, @JSanXiao",
    };

    expect(() => loadConfig("check")).toThrow(
      "WATCH_USERS entries must use an email address",
    );
  });
});
