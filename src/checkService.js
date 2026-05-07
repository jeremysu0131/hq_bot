const dayjs = require("./dayjs");
const { fetchChatRawText } = require("./chatClient");
const { parseAttendanceEntries } = require("./parser");
const { evaluateAttendance } = require("./rules");
const {
  buildAttendanceAlert,
  buildAllCheckedOutAlert,
  buildErrorAlert,
  sendTelegramMessage,
} = require("./notifier/telegram");

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
    const rawText = await fetchChatRawText(config);

    const parsed = parseAttendanceEntries(rawText, {
      targetDate: now,
      watchUsers: config.watchUsers,
    });

    const evaluation = evaluateAttendance(parsed.entries, {
      watchUsers: config.watchUsers,
      cutoffMinutes: config.cutoffMinutes,
    });

    if (evaluation.alertUsers.length > 0) {
      const message = buildAttendanceAlert({
        targetDateLabel,
        cutoffLabel: config.cutoffLabel,
        chatUrl: config.chatUrl,
        alertUsers: evaluation.alertUsers,
      });

      await sendTelegramMessage(config, message);
    } else if (evaluation.allCheckedOut) {
      const message = buildAllCheckedOutAlert({
        targetDateLabel,
        cutoffLabel: config.cutoffLabel,
        chatUrl: config.chatUrl,
        checkedUsers: evaluation.checkedUsers,
        skippedUsers: evaluation.skippedUsers,
      });

      await sendTelegramMessage(config, message);
    }

    const statusLine = evaluation.statuses
      .map(
        (status) =>
          `${status.userName}:${status.shouldAlert ? "ALERT" : status.skipCheckoutCheck ? "SKIP" : "OK"}`,
      )
      .join(", ");

    console.log(
      `[${targetDateLabel}] trigger=${trigger} scanned=${parsed.scannedLines} entries=${parsed.entries.length} ${statusLine}`,
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
  runCheck,
  safeSendErrorAlert,
};
