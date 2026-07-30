import { BrowserWindow, shell, type NativeImage } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const allowedHomepageOrigins = new WeakMap<BrowserWindow, string>();

export function createMainWindow(options: {
  appIcon: NativeImage;
  showWhenReady: boolean;
  shouldQuit: () => boolean;
}): BrowserWindow {
  const startupUrl = createStartupUrl();
  const window = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#090f20",
    icon: options.appIcon,
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: "Research Workstation",
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
    const allowedOrigin = allowedHomepageOrigins.get(window);
    if (url !== startupUrl && (!allowedOrigin || safeOrigin(url) !== allowedOrigin)) {
      event.preventDefault();
      void openExternalUrl(url);
    }
  });
  if (options.showWhenReady) {
    window.once("ready-to-show", () => window.show());
  }
  void window.loadURL(startupUrl);
  window.on("close", (event) => {
    if (!options.shouldQuit() && !window.isDestroyed()) {
      event.preventDefault();
      window.hide();
    }
  });
  return window;
}

export async function loadHomepage(window: BrowserWindow, homepageUrl: string): Promise<void> {
  allowedHomepageOrigins.set(window, new URL(homepageUrl).origin);
  await window.loadURL(homepageUrl);
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

function createStartupUrl(): string {
  const document = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research Workstation</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
        background: #090f20;
        color: #f8fafc;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        overflow: hidden;
        background:
          radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.18), transparent 34rem),
          radial-gradient(circle at 80% 75%, rgba(14, 165, 233, 0.12), transparent 30rem),
          #090f20;
      }
      main {
        width: min(32rem, calc(100vw - 3rem));
        padding: 2rem;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 1.5rem;
        background: rgba(15, 23, 42, 0.78);
        box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.28);
        text-align: center;
      }
      .mark {
        width: 3rem;
        height: 3rem;
        margin: 0 auto 1.25rem;
        border: 3px solid rgba(148, 163, 184, 0.24);
        border-top-color: #818cf8;
        border-radius: 999px;
        animation: spin 0.9s linear infinite;
      }
      h1 {
        margin: 0;
        font-size: 1.35rem;
        letter-spacing: 0.01em;
      }
      p {
        margin: 0.65rem 0 0;
        color: #94a3b8;
        font-size: 0.92rem;
        line-height: 1.65;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .mark { animation: none; border-top-color: #818cf8; }
      }
    </style>
  </head>
  <body>
    <main aria-live="polite">
      <div class="mark" aria-hidden="true"></div>
      <h1>科研开发工作站</h1>
      <p>正在准备本地核心与工作界面…</p>
    </main>
  </body>
</html>`;
  return `data:text/html;charset=UTF-8,${encodeURIComponent(document)}`;
}
