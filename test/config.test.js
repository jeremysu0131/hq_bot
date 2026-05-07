const { parseWatchUsers } = require("../src/config");

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
