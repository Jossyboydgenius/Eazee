type TelegramWebAppWindow = Window & {
  Telegram?: {
    WebApp?: {
      initData?: string;
      initDataUnsafe?: unknown;
      platform?: string;
      version?: string;
    };
  };
};

function hasTelegramWebAppContext(
  currentWindow: TelegramWebAppWindow,
): boolean {
  const webApp = currentWindow.Telegram?.WebApp;

  if (!webApp) {
    return false;
  }

  if (webApp.initData || webApp.initDataUnsafe) {
    return true;
  }

  return Boolean(webApp.platform || webApp.version);
}

function hasTelegramQueryParams(currentWindow: Window): boolean {
  const searchParams = new URLSearchParams(currentWindow.location.search);

  return (
    searchParams.has("tgWebAppPlatform") ||
    searchParams.has("tgWebAppVersion") ||
    searchParams.has("tgWebAppData") ||
    searchParams.has("tgWebAppStartParam")
  );
}

function hasTelegramUserAgent(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /telegram|webview/i.test(navigator.userAgent || "");
}

export function isTelegramMiniApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const currentWindow = window as TelegramWebAppWindow;

  return (
    hasTelegramWebAppContext(currentWindow) ||
    hasTelegramQueryParams(currentWindow) ||
    hasTelegramUserAgent()
  );
}
