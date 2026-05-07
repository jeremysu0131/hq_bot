const readline = require("readline");
const { AppError } = require("./errors");
const { ensureChatIsReady, launchBrowserContext } = require("./chatClient");

function waitForEnter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Login complete? Press Enter to save session... ", () => {
      rl.close();
      resolve();
    });
  });
}

async function runAuth(config) {
  const useCredentialMode = config.auth.autoLoginEnabled;
  const { browser, context } = await launchBrowserContext(config, {
    ignoreStoredSession: true,
    forceHeaded: !useCredentialMode,
    allowMissingSession: true,
  });

  try {
    const page = await context.newPage();

    if (useCredentialMode) {
      await ensureChatIsReady(page, config, {
        allowAutoLogin: true,
        saveSessionAfterLogin: true,
      });

      console.log("Credential login succeeded.");
      console.log(`Session saved: ${config.sessionPath}`);
      return;
    }

    await page.goto(config.chatUrl, {
      waitUntil: "domcontentloaded",
      timeout: config.chat.loadTimeoutMs,
    });

    console.log("A browser window was opened.");
    console.log("Please login to Google Chat manually.");
    console.log(
      "After the target group is visible, come back and press Enter.",
    );

    await waitForEnter();
    await ensureChatIsReady(page, config, {
      allowAutoLogin: false,
      saveSessionAfterLogin: false,
    });

    await context.storageState({ path: config.sessionPath });
    console.log(`Session saved: ${config.sessionPath}`);
  } catch (error) {
    throw new AppError("AUTH_FAILED", "Failed to save Google session.", error);
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = {
  runAuth,
};
