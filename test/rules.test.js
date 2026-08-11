const { evaluateAttendance, evaluateCheckIns } = require("../src/rules");

const watchUsers = [
  {
    name: "jeremy.j@spookyy.com",
    token: "jeremy.j@spookyy.com",
    mentionTag: "@JSanXiao",
  },
  {
    name: "conner.ch@spookyy.com",
    token: "conner.ch@spookyy.com",
    mentionTag: "@Eason_Chung",
  },
];

function entry(userToken, minutes, id) {
  return {
    id,
    userName: userToken,
    userToken,
    minutes,
    sentAt: `2026-08-11T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00.000Z`,
  };
}

describe("image attendance rules", () => {
  test("alerts at check-in when no image exists as of the check time", () => {
    const result = evaluateCheckIns(
      [
        entry("jeremy.j@spookyy.com", 565, "m1"),
        entry("conner.ch@spookyy.com", 569, "m2"),
      ],
      { watchUsers, asOfMinutes: 568 },
    );

    expect(result.checkedUsers.map((item) => item.userName)).toEqual([
      "jeremy.j@spookyy.com",
    ]);
    expect(result.alertUsers.map((item) => item.userName)).toEqual([
      "conner.ch@spookyy.com",
    ]);
  });

  test("treats 09:30 as check-in and only a later image as checkout", () => {
    const result = evaluateAttendance(
      [
        entry("jeremy.j@spookyy.com", 570, "m1"),
        entry("jeremy.j@spookyy.com", 571, "m2"),
        entry("conner.ch@spookyy.com", 571, "m3"),
      ],
      {
        watchUsers,
        checkInCutoffMinutes: 570,
        asOfMinutes: 1200,
      },
    );

    expect(result.checkedUsers.map((item) => item.userName)).toEqual([
      "jeremy.j@spookyy.com",
    ]);
    expect(result.skippedUsers.map((item) => item.userName)).toEqual([
      "conner.ch@spookyy.com",
    ]);
    expect(result.alertUsers).toHaveLength(0);
  });

  test("alerts active users whose second image has not arrived", () => {
    const result = evaluateAttendance(
      [entry("jeremy.j@spookyy.com", 565, "m1")],
      {
        watchUsers,
        checkInCutoffMinutes: 570,
        asOfMinutes: 1140,
      },
    );

    expect(result.alertUsers.map((item) => item.userName)).toEqual([
      "jeremy.j@spookyy.com",
    ]);
    expect(result.skippedUsers.map((item) => item.userName)).toEqual([
      "conner.ch@spookyy.com",
    ]);
  });
});
