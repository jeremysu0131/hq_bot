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
  test("alerts when checked in but no checkout", () => {
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
    });

    expect(result.alertUsers.map((item) => item.userName)).toEqual([
      "HQT - Jeremy",
    ]);
  });

  test("does not alert when checkout exists after checkin", () => {
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
    });

    expect(result.alertUsers).toHaveLength(0);
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
