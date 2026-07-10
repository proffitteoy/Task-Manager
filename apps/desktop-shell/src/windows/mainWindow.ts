import { BrowserWindow, shell, type NativeImage } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export function createMainWindow(options: {
  appIcon: NativeImage;
  homepageUrl: string;
  shouldQuit: () => boolean;
}): BrowserWindow {
  const allowedOrigin = new URL(options.homepageUrl).origin;
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#090f20",
    icon: options.appIcon,
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "Cognitive Workstation",
    webPreferences: {
      preload: join(currentDirectory, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (safeOrigin(url) !== allowedOrigin) {
      event.preventDefault();
      void openExternalUrl(url);
    }
  });
  window.once("ready-to-show", () => window.show());
  void window.loadURL(options.homepageUrl);
  window.on("close", (event) => {
    if (!options.shouldQuit() && !window.isDestroyed()) {
      event.preventDefault();
      window.hide();
    }
  });
  return window;
}

async function openExternalUrl(rawUrl: string): Promise<void> {
  try {
    const url = new URL(rawUrl);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) {
      await shell.openExternal(url.toString());
    }
  } catch {
    // Ignore malformed URLs supplied by rendered content.
  }
}

function safeOrigin(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return undefined;
  }
}
