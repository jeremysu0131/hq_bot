const axios = require("axios");
const { toErrorSummary } = require("../errors");

function isTelegramConfigured(config) {
  return Boolean(config.alerts.telegramToken && config.alerts.telegramChatId);
}

async function sendTelegramMessage(config, message) {
  if (!isTelegramConfigured(config)) {
    return {
      sent: false,
      reason: "telegram_not_configured",
    };
  }

  const url = `https://api.telegram.org/bot${config.alerts.telegramToken}/sendMessage`;

  await axios.post(
    url,
    {
      chat_id: config.alerts.telegramChatId,
      text: message,
      disable_web_page_preview: true,
    },
    {
      timeout: 10000,
    },
  );

  return {
    sent: true,
  };
}

function buildAttendanceAlert(payload) {
  const { targetDateLabel, cutoffLabel, chatUrl, alertUsers } = payload;
  const userList = alertUsers
    .map(
      (item) =>
        `- ${item.userName}${item.mentionTag ? ` ${item.mentionTag}` : ""}`,
    )
    .join("\n");

  return [
    "[HQ Bot] 下班沒打卡提醒",
    `日期: ${targetDateLabel}`,
    `規則: 有上班、${cutoffLabel} 前無下班`,
    "未打卡下班名單:",
    userList,
    `群組: ${chatUrl}`,
  ].join("\n");
}

function buildAllCheckedOutAlert(payload) {
  const { targetDateLabel, cutoffLabel, chatUrl, checkedUsers, skippedUsers } =
    payload;

  const checkedList = checkedUsers
    .map(
      (item) =>
        `- ${item.userName}${item.mentionTag ? ` ${item.mentionTag}` : ""}`,
    )
    .join("\n");

  const lines = [
    "[HQ Bot] 打卡檢查完成",
    `日期: ${targetDateLabel}`,
    `規則: 有上班者需於 ${cutoffLabel} 前下班打卡`,
    "已完成下班打卡名單:",
    checkedList,
  ];

  if (skippedUsers.length > 0) {
    const skippedList = skippedUsers
      .map(
        (item) =>
          `- ${item.userName}${item.mentionTag ? ` ${item.mentionTag}` : ""}`,
      )
      .join("\n");
    lines.push("未納入下班檢查(未抓到上班打卡):");
    lines.push(skippedList);
  }

  lines.push(`群組: ${chatUrl}`);
  return lines.join("\n");
}

function buildErrorAlert(payload) {
  const { stage, error } = payload;
  return [
    "[HQ Bot] 系統告警",
    `階段: ${stage}`,
    `錯誤: ${toErrorSummary(error)}`,
    "建議: 檢查 session 是否過期、網路是否可連至 chat.google.com",
  ].join("\n");
}

module.exports = {
  buildAttendanceAlert,
  buildAllCheckedOutAlert,
  buildErrorAlert,
  isTelegramConfigured,
  sendTelegramMessage,
};
