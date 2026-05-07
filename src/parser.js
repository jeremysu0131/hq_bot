const {
  combineWrappedLines,
  containsAttendanceAction,
  normalizeNameToken,
  toHalfWidth,
} = require("./utils/text");
const {
  isSameMonthDay,
  minutesToLabel,
  parseDateMonthDay,
  parseTimeMinutes,
} = require("./utils/time");

function resolveWatchUser(line, watchUsers) {
  const normalized = normalizeNameToken(line);

  for (const user of watchUsers) {
    if (normalized.includes(user.token)) {
      return user;
    }
  }

  return null;
}

function parseAttendanceEntries(rawText, options) {
  const { targetDate, watchUsers } = options;
  const lines = combineWrappedLines(rawText);
  const entries = [];

  for (const originalLine of lines) {
    const line = toHalfWidth(originalLine);

    if (!containsAttendanceAction(line)) {
      continue;
    }

    const monthDay = parseDateMonthDay(line);
    if (!monthDay || !isSameMonthDay(monthDay, targetDate)) {
      continue;
    }

    const user = resolveWatchUser(line, watchUsers);
    if (!user) {
      continue;
    }

    const minutes = parseTimeMinutes(line);
    if (minutes === null) {
      continue;
    }

    const action = /下班/.test(line) ? "checkout" : "checkin";

    entries.push({
      action,
      minutes,
      timeLabel: minutesToLabel(minutes),
      userName: user.name,
      userToken: user.token,
      rawLine: originalLine,
    });
  }

  return {
    entries: entries.sort((left, right) => left.minutes - right.minutes),
    scannedLines: lines.length,
  };
}

module.exports = {
  parseAttendanceEntries,
};
