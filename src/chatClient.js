const fs = require("fs");
const playwright = require("playwright-core");
const { AppError } = require("./errors");

async function launchBrowserContext(config, options = {}) {
  const {
    ignoreStoredSession = false,
    forceHeaded = false,
    allowMissingSession = false,
  } = options;

  if (
    !ignoreStoredSession &&
    !fs.existsSync(config.sessionPath) &&
    !allowMissingSession
  ) {
    throw new AppError(
      "SESSION_MISSING",
      `Google session not found. Please run auth first: ${config.sessionPath}`,
    );
  }

  const browserType = playwright[config.browser.type];
  if (!browserType) {
    throw new AppError(
      "CONFIG_INVALID",
      `Unsupported browser type: ${config.browser.type}`,
    );
  }

  if (
    config.browser.channel &&
    config.browser.type !== "chromium" &&
    !config.browser.executablePath
  ) {
    throw new AppError(
      "CONFIG_INVALID",
      "BROWSER_CHANNEL is only supported for chromium unless BROWSER_EXECUTABLE_PATH is set",
    );
  }

  const launchOptions = {
    headless: forceHeaded ? false : config.browser.headless,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };

  if (config.browser.channel) {
    launchOptions.channel = config.browser.channel;
  }

  if (config.browser.executablePath) {
    launchOptions.executablePath = config.browser.executablePath;
  }

  const browser = await browserType.launch(launchOptions);

  const contextOptions = {
    locale: "zh-TW",
    timezoneId: config.timezone,
    viewport: { width: 1440, height: 1000 },
  };

  if (!ignoreStoredSession) {
    contextOptions.storageState = config.sessionPath;
  }

  const context = await browser.newContext(contextOptions);

  return {
    browser,
    context,
  };
}

async function clickAnySelector(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      try {
        await locator.click({ timeout: 1200 });
        return true;
      } catch (_error) {
        // Keep trying next selector when button exists but is not interactable.
      }
    }
  }

  return false;
}

function isGoogleCaptchaChallenge(pageText) {
  return /輸入您聽到或看到的文字|Enter the text you hear or see|captcha/i.test(
    pageText,
  );
}

async function waitForFirstVisibleInput(page, selector, timeout) {
  const input = page.locator(selector).filter({ visible: true }).first();
  try {
    await input.waitFor({ state: "visible", timeout });
    return input;
  } catch (error) {
    const pageText = await page.evaluate(() => document.body?.innerText || "");
    if (isGoogleCaptchaChallenge(pageText)) {
      throw new AppError(
        "LOGIN_CHALLENGE",
        "Google requires CAPTCHA verification. Run manual auth in a browser and copy the session file to the server.",
        error,
      );
    }

    throw error;
  }
}

async function waitForPasswordInput(page, selector, config) {
  const passwordInput = page.locator(selector).filter({ visible: true }).first();
  const captchaInput = page.locator("input[name='ca']").filter({
    visible: true,
  });
  const deadline = Date.now() + config.chat.loadTimeoutMs;

  while (Date.now() < deadline) {
    if ((await passwordInput.count()) > 0) {
      return passwordInput;
    }

    if ((await captchaInput.count()) > 0) {
      throw new AppError(
        "LOGIN_CHALLENGE",
        "Google requires CAPTCHA verification. Run manual auth in a browser and copy the session file to the server.",
      );
    }

    const pageText = await page.evaluate(() => document.body?.innerText || "");
    if (isGoogleCaptchaChallenge(pageText)) {
      throw new AppError(
        "LOGIN_CHALLENGE",
        "Google requires CAPTCHA verification. Run manual auth in a browser and copy the session file to the server.",
      );
    }

    await page.waitForTimeout(500);
  }

  await passwordInput.waitFor({
    state: "visible",
    timeout: Math.max(1, deadline - Date.now()),
  });
  return passwordInput;
}

async function fillFirstVisibleInput(page, selector, value, timeout) {
  const input = await waitForFirstVisibleInput(page, selector, timeout);
  await input.fill(value);
}

async function performCredentialLogin(page, config) {
  if (!config.auth.autoLoginEnabled) {
    throw new AppError(
      "LOGIN_REQUIRED",
      "Session expired and GOOGLE_EMAIL/GOOGLE_PASSWORD were not provided.",
    );
  }

  const emailSelector =
    "input[type='email'], input[name='identifier']:not([type='hidden'])";
  const passwordSelector =
    "input[name='Passwd']:not([aria-hidden='true']), input[type='password']:not([name='hiddenPassword']):not([aria-hidden='true'])";

  await fillFirstVisibleInput(
    page,
    emailSelector,
    config.auth.googleEmail,
    config.chat.loadTimeoutMs,
  );

  const clickedEmailNext = await clickAnySelector(page, [
    "#identifierNext button",
    "#identifierNext",
    "button:has-text('下一步')",
    "button:has-text('Next')",
  ]);
  if (!clickedEmailNext) {
    await page.keyboard.press("Enter");
  }

  const passwordInput = await waitForPasswordInput(
    page,
    passwordSelector,
    config,
  );
  await passwordInput.fill(config.auth.googlePassword);

  const clickedPasswordNext = await clickAnySelector(page, [
    "#passwordNext button",
    "#passwordNext",
    "button:has-text('下一步')",
    "button:has-text('Next')",
  ]);
  if (!clickedPasswordNext) {
    await page.keyboard.press("Enter");
  }

  await page
    .waitForURL((url) => !url.includes("accounts.google.com"), {
      timeout: config.auth.postLoginWaitMs,
    })
    .catch(() => {});

  const currentUrl = page.url();
  const pageText = await page.evaluate(() => document.body?.innerText || "");

  if (
    currentUrl.includes("/challenge/") ||
    /驗證你的身分|兩步驟驗證|2-step verification|Verify it's you|Try another way/i.test(
      pageText,
    )
  ) {
    throw new AppError(
      "LOGIN_CHALLENGE",
      "Google requires extra verification challenge. Auto login cannot continue.",
    );
  }

  if (currentUrl.includes("accounts.google.com")) {
    throw new AppError(
      "LOGIN_FAILED",
      "Credential login failed or redirected to unsupported Google sign-in step.",
    );
  }
}

async function ensureChatIsReady(page, config, options = {}) {
  const { allowAutoLogin = true, saveSessionAfterLogin = true } = options;

  await page.goto(config.chatUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.chat.loadTimeoutMs,
  });

  await page
    .waitForLoadState("networkidle", {
      timeout: config.chat.loadTimeoutMs,
    })
    .catch(() => {});

  if (page.url().includes("accounts.google.com")) {
    if (!allowAutoLogin || !config.auth.autoLoginEnabled) {
      throw new AppError(
        "LOGIN_REQUIRED",
        "Google login required. Session may be expired. Set GOOGLE_EMAIL and GOOGLE_PASSWORD for auto login.",
      );
    }

    await performCredentialLogin(page, config);

    await page.goto(config.chatUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.chat.loadTimeoutMs,
    });

    await page
      .waitForLoadState("networkidle", {
        timeout: config.chat.loadTimeoutMs,
      })
      .catch(() => {});

    if (page.url().includes("accounts.google.com")) {
      throw new AppError(
        "LOGIN_FAILED",
        "Login succeeded but could not enter target Google Chat room.",
      );
    }

    if (saveSessionAfterLogin) {
      await page.context().storageState({ path: config.sessionPath });
    }
  }

  await page.waitForSelector("[role='main']", {
    timeout: config.chat.loadTimeoutMs,
  });
}

async function readVisibleMessageSnapshot(page) {
  return page.evaluate(() => {
    const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const roots = Array.from(
      document.querySelectorAll("[role='group'][data-id]"),
    );

    function allElements(root) {
      return [root, ...Array.from(root.querySelectorAll("*"))];
    }

    function findEmail(root) {
      const scopes = [
        root,
        root.closest("[role='listitem']"),
        root.parentElement,
      ].filter(Boolean);

      for (const scope of scopes) {
        for (const element of allElements(scope)) {
          for (const name of [
            "data-hovercard-id",
            "data-email",
            "email",
            "aria-label",
            "title",
          ]) {
            const match = String(element.getAttribute(name) || "").match(
              emailPattern,
            );
            if (match) {
              return match[0].toLowerCase();
            }
          }
        }
      }

      return "";
    }

    function parseTimestampValue(value) {
      const source = String(value || "").trim();
      if (!source) {
        return "";
      }

      if (/^\d{13}$/.test(source)) {
        return new Date(Number(source)).toISOString();
      }

      if (/^\d{10}$/.test(source)) {
        return new Date(Number(source) * 1000).toISOString();
      }

      const parsed = Date.parse(source);
      return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
    }

    function findTimestamp(root) {
      const scopes = [
        root,
        root.closest("c-wiz[data-local-sort-time-msec]"),
        root.closest("[role='listitem']"),
        root.parentElement,
      ].filter(Boolean);

      for (const scope of scopes) {
        for (const element of allElements(scope)) {
          for (const name of [
            "datetime",
            "data-absolute-timestamp",
            "data-timestamp",
            "data-time",
            "data-local-sort-time-msec",
          ]) {
            const timestamp = parseTimestampValue(element.getAttribute(name));
            if (timestamp) {
              return timestamp;
            }
          }
        }
      }

      return "";
    }

    function isUploadedImage(image) {
      const attachmentContainer = image.closest(
        "[data-attachment-id], [data-attachment-type], [aria-label*='attachment' i], [aria-label*='附件']",
      );
      const excluded = image.closest(
        "[data-emoji], [data-reaction], [aria-label*='profile' i], [aria-label*='個人資料'], [aria-label*='sticker' i], [aria-label*='貼圖']",
      );
      const profileLink = image.closest("[data-hovercard-id]");
      if (excluded || (profileLink && !attachmentContainer)) {
        return false;
      }

      const descriptor = [
        image.getAttribute("alt"),
        image.getAttribute("aria-label"),
        image.getAttribute("data-tooltip"),
        image.getAttribute("src"),
        image.closest("[data-attachment-id]")?.getAttribute("data-attachment-id"),
        image.closest("[data-attachment-type]")?.getAttribute("data-attachment-type"),
      ]
        .filter(Boolean)
        .join(" ");

      const hasAttachmentContainer = Boolean(attachmentContainer);
      const looksLikeUploadedImage =
        /(?:^|\b)(image|photo)(?:\b|$)|圖片|相片/i.test(descriptor) ||
        /chat_attachment|chat\.googleusercontent\.com/i.test(descriptor);

      return hasAttachmentContainer || looksLikeUploadedImage;
    }

    const messages = roots.map((root) => ({
      id: root.getAttribute("data-id") || "",
      senderEmail: findEmail(root),
      sentAt: findTimestamp(root),
      hasUploadedImage: Array.from(root.querySelectorAll("img")).some(
        isUploadedImage,
      ),
    }));

    return {
      containerCount: roots.length,
      mainTextLength: (document.querySelector("[role='main']")?.innerText || "")
        .trim().length,
      messages,
    };
  });
}

function mergeMessageSnapshots(target, snapshot) {
  for (const message of snapshot.messages) {
    if (!message.id) {
      continue;
    }

    const previous = target.get(message.id) || {};
    target.set(message.id, {
      id: message.id,
      senderEmail: message.senderEmail || previous.senderEmail || "",
      sentAt: message.sentAt || previous.sentAt || "",
      hasUploadedImage: Boolean(
        message.hasUploadedImage || previous.hasUploadedImage,
      ),
    });
  }
}

function oldestMessageTimestamp(messages) {
  let oldestTimestamp = null;

  for (const message of messages) {
    const timestamp = Date.parse(message.sentAt);
    if (Number.isNaN(timestamp)) {
      continue;
    }

    if (oldestTimestamp === null || timestamp < oldestTimestamp) {
      oldestTimestamp = timestamp;
    }
  }

  return oldestTimestamp;
}

async function scrollTowardOlderMessages(page) {
  return page.evaluate(() => {
    const main = document.querySelector("[role='main']");
    const roots = Array.from(
      document.querySelectorAll("[role='group'][data-id]"),
    );
    const candidateScores = new Map();

    for (const root of roots) {
      let element = root.parentElement;
      while (element && element !== main?.parentElement) {
        if (
          element.clientHeight > 100 &&
          element.scrollHeight - element.clientHeight > 120
        ) {
          candidateScores.set(element, (candidateScores.get(element) || 0) + 1);
        }
        if (element === main) {
          break;
        }
        element = element.parentElement;
      }
    }

    let candidates = Array.from(candidateScores, ([element, messageCount]) => ({
      element,
      messageCount,
    }));

    if (candidates.length === 0 && main) {
      candidates = [main, ...Array.from(main.querySelectorAll("*"))]
        .filter(
          (element) =>
            element.clientHeight > 100 &&
            element.scrollHeight - element.clientHeight > 120,
        )
        .map((element) => ({ element, messageCount: 0 }));
    }

    const target = candidates
      .sort(
        (left, right) =>
          right.messageCount - left.messageCount ||
          Number(right.element.scrollTop > 0) -
            Number(left.element.scrollTop > 0) ||
          right.element.clientHeight - left.element.clientHeight,
      )[0]?.element;

    if (!target) {
      return null;
    }

    const previousTop = target.scrollTop;
    const firstMessageId = roots[0]?.getAttribute("data-id") || "";
    const scrollHeight = target.scrollHeight;
    target.scrollTop = 0;
    target.dispatchEvent(new Event("scroll", { bubbles: true }));

    return {
      firstMessageId,
      moved: target.scrollTop < previousTop,
      scrollHeight,
    };
  });
}

async function waitForOlderMessageBatch(page, previous, timeoutMs) {
  try {
    await page.waitForFunction(
      ({ firstMessageId, scrollHeight }) => {
        const roots = Array.from(
          document.querySelectorAll("[role='group'][data-id]"),
        );
        const candidateScores = new Map();

        for (const root of roots) {
          let element = root.parentElement;
          while (element) {
            if (
              element.clientHeight > 100 &&
              element.scrollHeight - element.clientHeight > 120
            ) {
              candidateScores.set(
                element,
                (candidateScores.get(element) || 0) + 1,
              );
            }
            element = element.parentElement;
          }
        }

        const target = Array.from(
          candidateScores,
          ([element, messageCount]) => ({ element, messageCount }),
        ).sort(
          (left, right) =>
            right.messageCount - left.messageCount ||
            right.element.clientHeight - left.element.clientHeight,
        )[0]?.element;

        return Boolean(
          target &&
            (target.scrollHeight !== scrollHeight ||
              (roots[0]?.getAttribute("data-id") || "") !== firstMessageId),
        );
      },
      previous,
      { timeout: timeoutMs },
    );
    return true;
  } catch (_error) {
    return false;
  }
}

function validateCollectedMessages(
  { messages, containerCount, mainTextLength },
  options = {},
) {
  const completeMessages = messages.filter(
    (message) => message.senderEmail && message.sentAt,
  );
  const incompleteImageMessages = messages.filter(
    (message) =>
      message.hasUploadedImage && (!message.senderEmail || !message.sentAt),
  );

  if (
    containerCount === 0 ||
    (containerCount > 0 && completeMessages.length === 0) ||
    incompleteImageMessages.length > 0
  ) {
    throw new AppError(
      "CHAT_DOM_PARSE_FAILED",
      `Google Chat DOM extraction was incomplete (containers=${containerCount}, complete=${completeMessages.length}, incompleteImages=${incompleteImageMessages.length}, textLength=${mainTextLength}).`,
    );
  }

  if (
    options.requireUploadedImage &&
    !completeMessages.some((message) => message.hasUploadedImage)
  ) {
    throw new AppError(
      "CHAT_ATTACHMENT_LOAD_INCOMPLETE",
      `Google Chat loaded ${completeMessages.length} messages but no image attachments were available.`,
    );
  }

  return completeMessages;
}

async function collectChatMessages(page, config, options = {}) {
  const oldestRequiredTimestamp = options.oldestRequiredAt
    ? Date.parse(options.oldestRequiredAt)
    : null;
  if (
    options.oldestRequiredAt &&
    Number.isNaN(oldestRequiredTimestamp)
  ) {
    throw new AppError(
      "CONFIG_INVALID",
      `Invalid oldestRequiredAt value: ${options.oldestRequiredAt}`,
    );
  }

  const messagesById = new Map();
  let containerCount = 0;
  let mainTextLength = 0;

  for (let round = 0; round < config.chat.scrollRounds; round += 1) {
    const snapshot = await readVisibleMessageSnapshot(page);
    containerCount = Math.max(containerCount, snapshot.containerCount);
    mainTextLength = Math.max(mainTextLength, snapshot.mainTextLength || 0);
    mergeMessageSnapshots(messagesById, snapshot);

    const messages = Array.from(messagesById.values());
    const oldestTimestamp = oldestMessageTimestamp(messages);
    const reachedBoundary =
      oldestRequiredTimestamp === null ||
      (oldestTimestamp !== null && oldestTimestamp <= oldestRequiredTimestamp);

    if (reachedBoundary) {
      const completeMessages = validateCollectedMessages(
        { messages, containerCount, mainTextLength },
        { requireUploadedImage: options.requireUploadedImage },
      );
      console.log(
        `Google Chat scan complete: reason=boundary rounds=${round + 1} messages=${completeMessages.length} oldest=${oldestTimestamp === null ? "unknown" : new Date(oldestTimestamp).toISOString()} required=${oldestRequiredTimestamp === null ? "none" : new Date(oldestRequiredTimestamp).toISOString()}`,
      );
      return completeMessages;
    }

    if (round === config.chat.scrollRounds - 1) {
      break;
    }

    const scrollResult = await scrollTowardOlderMessages(page);
    if (!scrollResult) {
      throw new AppError(
        "CHAT_SCROLL_INCOMPLETE",
        `Google Chat message scroll container was not found before the required time (oldest=${oldestTimestamp === null ? "unknown" : new Date(oldestTimestamp).toISOString()}, required=${new Date(oldestRequiredTimestamp).toISOString()}).`,
      );
    }

    const loadedOlderBatch = await waitForOlderMessageBatch(
      page,
      scrollResult,
      config.chat.scrollLoadTimeoutMs,
    );
    if (!loadedOlderBatch) {
      throw new AppError(
        "CHAT_SCROLL_INCOMPLETE",
        `Google Chat did not load an older message batch within ${config.chat.scrollLoadTimeoutMs}ms (oldest=${oldestTimestamp === null ? "unknown" : new Date(oldestTimestamp).toISOString()}, required=${new Date(oldestRequiredTimestamp).toISOString()}).`,
      );
    }

    await page.waitForTimeout(config.chat.scrollWaitMs);
  }

  const messages = Array.from(messagesById.values());
  const oldestTimestamp = oldestMessageTimestamp(messages);
  validateCollectedMessages({ messages, containerCount, mainTextLength });
  throw new AppError(
    "CHAT_SCROLL_INCOMPLETE",
    `Google Chat did not reach the required time within ${config.chat.scrollRounds} rounds (oldest=${oldestTimestamp === null ? "unknown" : new Date(oldestTimestamp).toISOString()}, required=${new Date(oldestRequiredTimestamp).toISOString()}).`,
  );
}

async function fetchChatMessages(config, options = {}) {
  const hasSession = fs.existsSync(config.sessionPath);
  const { browser, context } = await launchBrowserContext(config, {
    ignoreStoredSession: !hasSession,
    allowMissingSession: config.auth.autoLoginEnabled,
  });

  try {
    const page = await context.newPage();
    await ensureChatIsReady(page, config, {
      allowAutoLogin: true,
      saveSessionAfterLogin: true,
    });
    return await collectChatMessages(page, config, options);
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = {
  collectChatMessages,
  fillFirstVisibleInput,
  fetchChatMessages,
  isGoogleCaptchaChallenge,
  performCredentialLogin,
  launchBrowserContext,
  mergeMessageSnapshots,
  oldestMessageTimestamp,
  readVisibleMessageSnapshot,
  scrollTowardOlderMessages,
  waitForOlderMessageBatch,
  ensureChatIsReady,
};
