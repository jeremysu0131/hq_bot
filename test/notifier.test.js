const {
  buildAttendanceAlert,
  buildCheckInAttendanceAlert,
  buildErrorAlert,
} = require("../src/notifier/telegram");

const attendanceUrlLine = "打卡網站: https://hr-att.web.app/";
const alertUsers = [
  {
    userName: "jeremy.j@spookyy.com",
    mentionTag: "@JSanXiao",
  },
];

describe("Telegram attendance alerts", () => {
  test("includes the attendance website in the missing check-out alert", () => {
    const message = buildAttendanceAlert({
      targetDateLabel: "2026-08-14",
      cutoffLabel: "09:30",
      chatUrl: "https://chat.google.com/example",
      alertUsers,
    });

    expect(message).toContain(attendanceUrlLine);
  });

  test("includes the attendance website in the missing check-in alert", () => {
    const message = buildCheckInAttendanceAlert({
      targetDateLabel: "2026-08-14",
      checkTimeLabel: "09:28",
      chatUrl: "https://chat.google.com/example",
      alertUsers,
    });

    expect(message).toContain(attendanceUrlLine);
  });

  test("does not add the attendance website to system alerts", () => {
    const message = buildErrorAlert({
      stage: "run_check_in",
      error: new Error("failed"),
    });

    expect(message).not.toContain(attendanceUrlLine);
  });
});
