function toHalfWidth(input) {
  return String(input || "")
    .replace(/[\uFF01-\uFF5E]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ");
}

function normalizeWhitespace(input) {
  return String(input || "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLine(input) {
  const halfWidth = toHalfWidth(input);
  return normalizeWhitespace(halfWidth);
}

function normalizeNameToken(input) {
  return toHalfWidth(input)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function containsAttendanceAction(line) {
  return /上班|下班/.test(line);
}

function combineWrappedLines(rawText) {
  const lines = String(rawText || "")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const combined = [];

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i];
    const next = lines[i + 1];

    if (!next) {
      combined.push(current);
      continue;
    }

    const nextIsActionOnly = /^(上班|下班|班)$/.test(next);
    const currentHasDate = /(\d{1,2}\s*(月|\/))/.test(current);

    if (
      (/上$|下$/.test(current) && next === "班") ||
      (currentHasDate && nextIsActionOnly)
    ) {
      combined.push(`${current}${next}`);
      i += 1;
      continue;
    }

    combined.push(current);
  }

  return combined;
}

module.exports = {
  combineWrappedLines,
  containsAttendanceAction,
  normalizeLine,
  normalizeNameToken,
  normalizeWhitespace,
  toHalfWidth,
};
