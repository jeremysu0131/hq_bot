const dayjs = require("./dayjs");
const { fetchChatMessages } = require("./chatClient");
const { parseImageAttendanceEntries } = require("./parser");
const { evaluateAttendance, evaluateCheckIns } = require("./rules");
const {
  buildAttendanceAlert,
  buildCheckInAttendanceAlert,
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
  return ms <= 0
    ? Promise.resolve()
    : new Promise((resolve) => setTimeout(resolve, ms));
}

function appendUniqueEntries(target, entries, seenIds) {
  let added = 0;
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      continue;
    }
    seenIds.add(entry.id);
    target.push(entry);
    added += 1;
  }
  return added;
}

function minutesAt(now) {
  return now.hour() * 60 + now.minute();
}

function formatStatusLine(statuses) {
  return statuses
    .map(
      (status) =>
        `${status.userName}:${status.shouldAlert ? "ALERT" : status.skipCheckoutCheck ? "SKIP" : "OK"}`,
    )
    .join(", ");
}

async function collectImageAttendanceWithRetries(config, now, mode, trigger) {
  const attempts = getCheckAttempts(config);
  const retryWaitMs = getRetryWaitMs(config);
  const entries = [];
  const seenIds = new Set();
  const attemptsLog = [];
  let scannedMessages = 0;
  let successfulAttempts = 0;
  let evaluation = null;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const messages = await fetchChatMessages(config);
      const parsed = parseImageAttendanceEntries(messages, {
        targetDate: now,
        timezone: config.timezone,
        watchUsers: config.watchUsers,
      });
      const addedEntries = appendUniqueEntries(entries, parsed.entries, seenIds);
      scannedMessages += parsed.scannedMessages;
      successfulAttempts += 1;

      evaluation =
        mode === "checkin"
          ? evaluateCheckIns(entries, {
              watchUsers: config.watchUsers,
              asOfMinutes: Math.min(
                minutesAt(now),
                config.checkIn.cutoffMinutes,
              ),
            })
          : evaluateAttendance(entries, {
              watchUsers: config.watchUsers,
              checkInCutoffMinutes: config.checkIn.cutoffMinutes,
              asOfMinutes: minutesAt(now),
            });

      const unresolvedUsers = evaluation.alertUsers.map(
        (status) => status.userName,
      );
      attemptsLog.push({
        attempt,
        scannedMessages: parsed.scannedMessages,
        parsedEntries: parsed.entries.length,
        addedEntries,
        unresolvedUsers,
      });

      console.log(
        `[${now.format("YYYY-MM-DD")}] trigger=${trigger} mode=${mode} attempt=${attempt}/${attempts} scanned=${parsed.scannedMessages} matchedImages=${parsed.entries.length} added=${addedEntries} unresolved=${unresolvedUsers.length}`,
      );

      const isComplete =
        mode === "checkin"
          ? unresolvedUsers.length === 0
          : evaluation.activeUsers.length > 0 && unresolvedUsers.length === 0;
      if (isComplete) {
        break;
      }
    } catch (error) {
      lastError = error;
      attemptsLog.push({ attempt, error });
      console.warn(
        `[${now.format("YYYY-MM-DD")}] trigger=${trigger} mode=${mode} attempt=${attempt}/${attempts} failed: ${error.message || error}`,
      );
    }

    if (attempt < attempts) {
      await wait(retryWaitMs);
    }
  }

  if (!evaluation) {
    throw lastError;
  }

  return {
    parsed: {
      entries: entries.sort((left, right) =>
        left.sentAt.localeCompare(right.sentAt),
      ),
      scannedMessages,
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
    await sendTelegramMessage(config, buildErrorAlert({ stage, error }));
  } catch (notifyError) {
    console.error("Failed to send Telegram error alert:", notifyError.message);
  }
}

async function runCheck(config, trigger = "manual") {
  const now = dayjs().tz(config.timezone);
  const targetDateLabel = now.format("YYYY-MM-DD");
  try {
    const { parsed, evaluation } = await collectImageAttendanceWithRetries(
      config,
      now,
      "checkout",
      trigger,
    );
    if (evaluation.alertUsers.length > 0) {
      await sendTelegramMessage(
        config,
        buildAttendanceAlert({
          targetDateLabel,
          cutoffLabel: config.checkIn.cutoffLabel,
          chatUrl: config.chatUrl,
          alertUsers: evaluation.alertUsers,
        }),
      );
    }
    console.log(
      `[${targetDateLabel}] trigger=${trigger} attempts=${parsed.attempts} scanned=${parsed.scannedMessages} matchedImages=${parsed.entries.length} ${formatStatusLine(evaluation.statuses)}`,
    );
    return { now, parsed, evaluation };
  } catch (error) {
    await safeSendErrorAlert(config, "run_check", error);
    throw error;
  }
}

async function runCheckInCheck(config, trigger = "manual") {
  const now = dayjs().tz(config.timezone);
  const targetDateLabel = now.format("YYYY-MM-DD");
  try {
    const { parsed, evaluation } = await collectImageAttendanceWithRetries(
      config,
      now,
      "checkin",
      trigger,
    );
    if (evaluation.alertUsers.length > 0) {
      await sendTelegramMessage(
        config,
        buildCheckInAttendanceAlert({
          targetDateLabel,
          checkTimeLabel: now.format("HH:mm"),
          chatUrl: config.chatUrl,
          alertUsers: evaluation.alertUsers,
        }),
      );
    }
    console.log(
      `[${targetDateLabel}] trigger=${trigger} checkin attempts=${parsed.attempts} scanned=${parsed.scannedMessages} matchedImages=${parsed.entries.length} ${formatStatusLine(evaluation.statuses)}`,
    );
    return { now, parsed, evaluation };
  } catch (error) {
    await safeSendErrorAlert(config, "run_check_in", error);
    throw error;
  }
}

module.exports = {
  collectImageAttendanceWithRetries,
  runCheckInCheck,
  runCheck,
  safeSendErrorAlert,
};
