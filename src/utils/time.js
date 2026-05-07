const { toHalfWidth } = require("./text");

function parseCutoff(cutoffLabel) {
  const match = String(cutoffLabel || "").match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour * 60 + minute;
}

function minutesToLabel(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDateMonthDay(text) {
  const normalized = toHalfWidth(text);
  const match = normalized.match(/(\d{1,2})\s*(月|\/)\s*(\d{1,2})\s*日?/);
  if (!match) {
    return null;
  }

  const month = Number(match[1]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { month, day };
}

function parseTimeMinutes(text) {
  const normalized = toHalfWidth(text);
  const actionIndex = normalized.search(/上班|下班/);
  const scope =
    actionIndex >= 0 ? normalized.slice(0, actionIndex + 2) : normalized;

  const colonMatches = [...scope.matchAll(/([01]?\d|2[0-3])\s*:\s*([0-5]\d)/g)];
  if (colonMatches.length > 0) {
    const last = colonMatches[colonMatches.length - 1];
    return Number(last[1]) * 60 + Number(last[2]);
  }

  const compactMatches = [
    ...scope.matchAll(/(?:^|[^0-9])((?:[01]?\d|2[0-3])[0-5]\d)(?=[^0-9]|$)/g),
  ];
  if (compactMatches.length > 0) {
    const last = compactMatches[compactMatches.length - 1][1];
    const value = String(last);
    const hour = Number(value.slice(0, value.length - 2));
    const minute = Number(value.slice(-2));
    return hour * 60 + minute;
  }

  return null;
}

function isSameMonthDay(monthDay, target) {
  return (
    monthDay.month === target.month() + 1 && monthDay.day === target.date()
  );
}

module.exports = {
  isSameMonthDay,
  minutesToLabel,
  parseCutoff,
  parseDateMonthDay,
  parseTimeMinutes,
};
