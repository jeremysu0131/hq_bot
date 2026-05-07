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

  if (config.browser.cdpEndpoint && config.browser.type !== "chromium") {
    throw new AppError(
      "CONFIG_INVALID",
      "BROWSER_CDP_ENDPOINT is only supported with BROWSER_TYPE=chromium",
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

  const browser = config.browser.cdpEndpoint
    ? await playwright.chromium.connectOverCDP(config.browser.cdpEndpoint)
    : await browserType.launch({
        headless: forceHeaded ? false : config.browser.headless,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
        ...(config.browser.channel
          ? { channel: config.browser.channel }
          : {}),
        ...(config.browser.executablePath
          ? { executablePath: config.browser.executablePath }
          : {}),
      });

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

async function performCredentialLogin(page, config) {
  if (!config.auth.autoLoginEnabled) {
    throw new AppError(
      "LOGIN_REQUIRED",
      "Session expired and GOOGLE_EMAIL/GOOGLE_PASSWORD were not provided.",
    );
  }

  const emailSelector = "input[type='email'], input[name='identifier']";
  const passwordSelector = "input[type='password'], input[name='Passwd']";

  await page.waitForSelector(emailSelector, {
    timeout: config.chat.loadTimeoutMs,
  });
  await page.fill(emailSelector, config.auth.googleEmail);

  const clickedEmailNext = await clickAnySelector(page, [
    "#identifierNext button",
    "#identifierNext",
    "button:has-text('下一步')",
    "button:has-text('Next')",
  ]);
  if (!clickedEmailNext) {
    await page.keyboard.press("Enter");
  }

  await page.waitForSelector(passwordSelector, {
    timeout: config.chat.loadTimeoutMs,
  });
  await page.fill(passwordSelector, config.auth.googlePassword);

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

async function collectChatText(page, config) {
  const snapshots = [];

  for (let round = 0; round < config.chat.scrollRounds; round += 1) {
    const snapshot = await page.evaluate(() => document.body?.innerText || "");
    snapshots.push(snapshot);

    const moved = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          "[role='main'], [role='list'], [data-message-id]",
        ),
      );

      let target = null;
      for (const element of candidates) {
        if (element.scrollHeight - element.clientHeight > 120) {
          target = element;
          break;
        }
      }

      if (!target) {
        return false;
      }

      const previousTop = target.scrollTop;
      target.scrollTop = 0;
      return previousTop > 0;
    });

    if (!moved) {
      break;
    }

    await page.waitForTimeout(config.chat.scrollWaitMs);
  }

  return snapshots.join("\n");
}

async function fetchChatRawText(config) {
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
    return await collectChatText(page, config);
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = {
  performCredentialLogin,
  fetchChatRawText,
  launchBrowserContext,
  ensureChatIsReady,
};
