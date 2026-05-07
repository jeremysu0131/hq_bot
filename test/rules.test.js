const { evaluateAttendance } = require("../src/rules");
const { normalizeNameToken } = require("../src/utils/text");

const watchUsers = [
  {
    name: "HQT - Jeremy",
    token: normalizeNameToken("HQT - Jeremy"),
    mentionTag: "@JSanXiao",
  },
  {
    name: "HQT - Conner",
    token: normalizeNameToken("HQT - Conner"),
    mentionTag: "",
  },
];

describe("evaluateAttendance", () => {
  test("alerts when checked in but no checkout before cutoff", () => {
    const entries = [
      {
        userName: "HQT - Jeremy",
        userToken: normalizeNameToken("HQT - Jeremy"),
        action: "checkin",
        minutes: 541,
      },
      {
        userName: "HQT - Conner",
        userToken: normalizeNameToken("HQT - Conner"),
        action: "checkin",
        minutes: 552,
      },
      {
        userName: "HQT - Conner",
        userToken: normalizeNameToken("HQT - Conner"),
        action: "checkout",
        minutes: 1116,
      },
    ];

    const result = evaluateAttendance(entries, {
      watchUsers,
      cutoffMinutes: 1170,
    });

    expect(result.alertUsers.map((item) => item.userName)).toEqual([
      "HQT - Jeremy",
    ]);
  });

  test("checkout after cutoff still alerts", () => {
    const entries = [
      {
        userName: "HQT - Jeremy",
        userToken: normalizeNameToken("HQT - Jeremy"),
        action: "checkin",
        minutes: 541,
      },
      {
        userName: "HQT - Jeremy",
        userToken: normalizeNameToken("HQT - Jeremy"),
        action: "checkout",
        minutes: 1230,
      },
    ];

    const result = evaluateAttendance(entries, {
      watchUsers: [watchUsers[0]],
      cutoffMinutes: 1170,
    });

    expect(result.alertUsers.map((item) => item.userName)).toEqual([
      "HQT - Jeremy",
    ]);
  });

  test("skips checkout validation when check-in is missing", () => {
    const entries = [
      {
        userName: "HQT - Jeremy",
        userToken: normalizeNameToken("HQT - Jeremy"),
        action: "checkout",
        minutes: 1110,
      },
    ];

    const result = evaluateAttendance(entries, {
      watchUsers,
      cutoffMinutes: 1170,
    });

    const jeremy = result.statuses.find(
      (item) => item.userName === "HQT - Jeremy",
    );
    expect(jeremy.skipCheckoutCheck).toBe(true);
    expect(jeremy.shouldAlert).toBe(false);
    expect(result.alertUsers).toHaveLength(0);
  });

  test("returns allCheckedOut when every checked-in user has checkout", () => {
    const entries = [
      {
        userName: "HQT - Jeremy",
        userToken: normalizeNameToken("HQT - Jeremy"),
        action: "checkin",
        minutes: 541,
      },
      {
        userName: "HQT - Jeremy",
        userToken: normalizeNameToken("HQT - Jeremy"),
        action: "checkout",
        minutes: 1110,
      },
    ];

    const result = evaluateAttendance(entries, {
      watchUsers,
      cutoffMinutes: 1170,
    });

    expect(result.allCheckedOut).toBe(true);
    expect(result.checkedUsers.map((item) => item.userName)).toEqual([
      "HQT - Jeremy",
    ]);
    expect(result.skippedUsers.map((item) => item.userName)).toEqual([
      "HQT - Conner",
    ]);
  });
});
