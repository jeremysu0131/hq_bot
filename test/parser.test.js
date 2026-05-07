const dayjs = require("../src/dayjs");
const { parseAttendanceEntries } = require("../src/parser");
const { normalizeNameToken } = require("../src/utils/text");

const watchUsers = [
  { name: "HQT - Jeremy", token: normalizeNameToken("HQT - Jeremy") },
  { name: "HQT - Conner", token: normalizeNameToken("HQT - Conner") },
];

describe("parseAttendanceEntries", () => {
  test("parses mixed formats for target users", () => {
    const rawText = `
你, 09:00
HQT - Jeremy 5月7日，09:01 上班
Conner.ch HQT, 09:12
HQT -  Conner 5月7日，09:12上班
Conner.ch HQT, 18:36
HQT- Conner 5月7日，18:36下班
你, 19:42
HQT - Jeremy 5月7日，1942下班
QA2 - Del 5月7日，19：19下班
`;

    const targetDate = dayjs.tz("2026-05-07T19:30:00", "Asia/Taipei");

    const result = parseAttendanceEntries(rawText, {
      watchUsers,
      targetDate,
    });

    expect(result.entries).toHaveLength(4);

    expect(result.entries.map((entry) => entry.userName)).toEqual([
      "HQT - Jeremy",
      "HQT - Conner",
      "HQT - Conner",
      "HQT - Jeremy",
    ]);

    expect(result.entries.map((entry) => entry.minutes)).toEqual([
      541, 552, 1116, 1182,
    ]);
  });

  test("supports wrapped action lines", () => {
    const rawText = `
HQT - Adam 5月7日 1010下
上班
你, 09:00
HQT - Jeremy 5月7日，1015上班
`;

    const targetDate = dayjs.tz("2026-05-07T19:30:00", "Asia/Taipei");

    const result = parseAttendanceEntries(rawText, {
      watchUsers,
      targetDate,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].userName).toBe("HQT - Jeremy");
    expect(result.entries[0].minutes).toBe(615);
  });
});
