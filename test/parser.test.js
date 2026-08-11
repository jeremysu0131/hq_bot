const dayjs = require("../src/dayjs");
const { parseImageAttendanceEntries } = require("../src/parser");

const watchUsers = [
  {
    name: "jeremy.j@spookyy.com",
    email: "jeremy.j@spookyy.com",
    token: "jeremy.j@spookyy.com",
  },
  {
    name: "conner.ch@spookyy.com",
    email: "conner.ch@spookyy.com",
    token: "conner.ch@spookyy.com",
  },
];

describe("parseImageAttendanceEntries", () => {
  test("keeps uploaded images from watched emails on the target Taipei date", () => {
    const result = parseImageAttendanceEntries(
      [
        {
          id: "m1",
          senderEmail: "JEREMY.J@SPOOKYY.COM",
          sentAt: "2026-08-11T01:30:00.000Z",
          hasUploadedImage: true,
        },
        {
          id: "m2",
          senderEmail: "conner.ch@spookyy.com",
          sentAt: "2026-08-11T01:31:00.000Z",
          hasUploadedImage: false,
        },
        {
          id: "m3",
          senderEmail: "other@spookyy.com",
          sentAt: "2026-08-11T01:20:00.000Z",
          hasUploadedImage: true,
        },
        {
          id: "m4",
          senderEmail: "conner.ch@spookyy.com",
          sentAt: "2026-08-10T01:20:00.000Z",
          hasUploadedImage: true,
        },
      ],
      {
        targetDate: dayjs.tz("2026-08-11T19:00:00", "Asia/Taipei"),
        timezone: "Asia/Taipei",
        watchUsers,
      },
    );

    expect(result.scannedMessages).toBe(4);
    expect(result.entries).toEqual([
      expect.objectContaining({
        id: "m1",
        userName: "jeremy.j@spookyy.com",
        minutes: 570,
      }),
    ]);
  });
});
