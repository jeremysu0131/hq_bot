const dayjs = require("./dayjs");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseImageAttendanceEntries(messages, options) {
  const { targetDate, timezone, watchUsers } = options;
  const targetDateLabel = targetDate.format("YYYY-MM-DD");
  const usersByEmail = new Map(
    watchUsers.map((user) => [normalizeEmail(user.email || user.name), user]),
  );
  const entries = [];

  for (const message of messages || []) {
    if (!message.hasUploadedImage) {
      continue;
    }

    const email = normalizeEmail(message.senderEmail);
    const user = usersByEmail.get(email);
    if (!user || !message.sentAt) {
      continue;
    }

    const sentAt = dayjs(message.sentAt).tz(timezone);
    if (!sentAt.isValid() || sentAt.format("YYYY-MM-DD") !== targetDateLabel) {
      continue;
    }

    entries.push({
      id: String(message.id),
      minutes: sentAt.hour() * 60 + sentAt.minute(),
      sentAt: sentAt.toISOString(),
      userName: user.name,
      userToken: user.token,
    });
  }

  return {
    entries: entries.sort((left, right) => left.sentAt.localeCompare(right.sentAt)),
    scannedMessages: (messages || []).length,
  };
}

module.exports = {
  normalizeEmail,
  parseImageAttendanceEntries,
};
