const dayjs = require("./dayjs");
const { fetchChatRawText } = require("./chatClient");
const { parseAttendanceEntries } = require("./parser");
const { evaluateAttendance } = require("./rules");
const {
  buildAttendanceAlert,
  buildErrorAlert,
  sendTelegramMessage,
} = require("./notifier/telegram");

const DEFAULT_CHECK_ATTEMPTS = 3;

function getCheckAttempts(config) {
  return config.check?.attempts || DEFAULT_CHECK_ATTEMPTS;
}

function getRetryWaitMs(config) {
  return config.check?.retryWaitMs ?? 2000;
}

function wait(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toEntryKey(entry) {
  return `${entry.userToken}:${entry.action}:${entry.minutes}`;
}

function appendUniqueEntries(target, entries, seenEntryKeys) {
  let added = 0;

  for (const entry of entries) {
    const key = toEntryKey(entry);
    if (seenEntryKeys.has(key)) {
      continue;
    }

    seenEntryKeys.add(key);
    target.push(entry);
    added += 1;
  }

  return added;
}

function formatStatusLine(statuses) {
  return statuses
    .map(
      (status) =>
        `${status.userName}:${status.shouldAlert ? "ALERT" : status.skipCheckoutCheck ? "SKIP" : "OK"}`,
    )
    .join(", ");
}

async function collectAttendanceWithRetries(
  config,
  now,
  targetDateLabel,
  trigger,
) {
  const attempts = getCheckAttempts(config);
  const retryWaitMs = getRetryWaitMs(config);
  const checkedOutTokens = new Set();
  const seenEntryKeys = new Set();
  const entries = [];
  const attemptsLog = [];
  let scannedLines = 0;
  let evaluation = null;
  let successfulAttempts = 0;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const pendingUsers = config.watchUsers.filter(
      (user) => !checkedOutTokens.has(user.token),
    );

    if (pendingUsers.length === 0) {
      break;
    }

    try {
      const rawText = await fetchChatRawText(config);
      const parsed = parseAttendanceEntries(rawText, {
        targetDate: now,
        watchUsers: pendingUsers,
      });
      const addedEntries = appendUniqueEntries(
        entries,
        parsed.entries,
        seenEntryKeys,
      );

      scannedLines += parsed.scannedLines;
      successfulAttempts += 1;
      evaluation = evaluateAttendance(entries, {
        watchUsers: config.watchUsers,
      });

      const newlyCheckedUsers = evaluation.checkedUsers.filter(
        (status) => !checkedOutTokens.has(status.userToken),
      );

      for (const status of newlyCheckedUsers) {
        checkedOutTokens.add(status.userToken);
      }

      const unresolvedUsers = config.watchUsers.filter(
        (user) => !checkedOutTokens.has(user.token),
      );

      attemptsLog.push({
        attempt,
        scannedLines: parsed.scannedLines,
        parsedEntries: parsed.entries.length,
        addedEntries,
        checkedUsers: newlyCheckedUsers.map((status) => status.userName),
        unresolvedUsers: unresolvedUsers.map((user) => user.name),
      });

      console.log(
        `[${targetDateLabel}] trigger=${trigger} attempt=${attempt}/${attempts} scanned=${parsed.scannedLines} entries=${parsed.entries.length} added=${addedEntries} newlyChecked=${newlyCheckedUsers.length} unresolved=${unresolvedUsers.length}`,
      );
    } catch (error) {
      lastError = error;
      attemptsLog.push({
        attempt,
        error,
      });

      console.warn(
        `[${targetDateLabel}] trigger=${trigger} attempt=${attempt}/${attempts} failed: ${error.message || error}`,
      );
    }

    if (
      attempt < attempts &&
      config.watchUsers.some((user) => !checkedOutTokens.has(user.token))
    ) {
      await wait(retryWaitMs);
    }
  }

  if (!evaluation) {
    throw lastError;
  }

  return {
    parsed: {
      entries: entries.sort((left, right) => left.minutes - right.minutes),
      scannedLines,
      attempts: attemptsLog.length,
      successfulAttempts,
      attemptsLog,
    },
    evaluation,
  };
}

async function safeSendErrorAlert(config, stage, error) {
  if (!config.alerts.onErrors) {
    return;
  }

  try {
    await sendTelegramMessage(
      config,
      buildErrorAlert({
        stage,
        error,
      }),
    );
  } catch (notifyError) {
    console.error("Failed to send Telegram error alert:", notifyError.message);
  }
}

async function runCheck(config, trigger = "manual") {
  const now = dayjs().tz(config.timezone);
  const targetDateLabel = now.format("YYYY-MM-DD");

  try {
    const { parsed, evaluation } = await collectAttendanceWithRetries(
      config,
      now,
      targetDateLabel,
      trigger,
    );

    if (evaluation.alertUsers.length > 0) {
      const message = buildAttendanceAlert({
        targetDateLabel,
        chatUrl: config.chatUrl,
        alertUsers: evaluation.alertUsers,
      });

      await sendTelegramMessage(config, message);
    }

    const statusLine = formatStatusLine(evaluation.statuses);

    console.log(
      `[${targetDateLabel}] trigger=${trigger} attempts=${parsed.attempts} scanned=${parsed.scannedLines} entries=${parsed.entries.length} ${statusLine}`,
    );

    return {
      now,
      parsed,
      evaluation,
    };
  } catch (error) {
    await safeSendErrorAlert(config, "run_check", error);
    throw error;
  }
}

module.exports = {
  collectAttendanceWithRetries,
  runCheck,
  safeSendErrorAlert,
};
