import { join, resolve } from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  session,
  shell,
  type IpcMainInvokeEvent,
  type NativeImage
} from "electron";

import { registerGlobalShortcuts } from "./shortcuts/globalShortcuts.js";
import {
  startActivityWatchProcess,
  stopActivityWatchProcess
} from "./services/activityWatchProcess.js";
import { startCoreProcess, stopCoreProcess } from "./services/coreProcess.js";
import { startHomepageProcess, stopHomepageProcess } from "./services/homepageProcess.js";
import type { RuntimeService } from "./services/runtimeProcess.js";
import { createTray } from "./tray/tray.js";
import { createMainWindow } from "./windows/mainWindow.js";

let mainWindow: BrowserWindow | undefined;
let activityWatchRuntime: RuntimeService | undefined;
let coreRuntime: RuntimeService | undefined;
let homepageRuntime: RuntimeService | undefined;
let isQuitting = false;

app.setName("Cognitive Workstation");
app.setAppUserModelId("dev.cognitive-workstation.desktop");
if (process.env.COGNITIVE_WORKSTATION_USER_DATA_DIR) {
  app.setPath("userData", resolve(process.env.COGNITIVE_WORKSTATION_USER_DATA_DIR));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
  app.whenReady().then(bootstrap).catch(handleBootstrapError);
}

async function bootstrap(): Promise<void> {
  const userData = app.getPath("userData");
  const smokeTest = process.env.COGNITIVE_WORKSTATION_SMOKE_TEST === "1";
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  activityWatchRuntime = await startActivityWatchProcess(userData);
  coreRuntime = await startCoreProcess(userData);
  homepageRuntime = await startHomepageProcess(userData, coreRuntime.url);
  const appIcon = loadAppIcon();

  mainWindow = createMainWindow({
    appIcon,
    homepageUrl: homepageRuntime.url,
    showWhenReady: !smokeTest,
    shouldQuit: () => isQuitting
  });
  createTray({
    icon: appIcon,
    onOpenUserData: () => void shell.openPath(userData),
    onQuit: quitApplication,
    onShow: showMainWindow
  });
  const failedShortcuts = registerGlobalShortcuts({
    onToggleWindow: () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else showMainWindow();
    },
    onTimerToggle: () => void toggleTimer(),
    onTimerStop: () => void postCore("/api/timer/stop", { reason: "desktop shortcut" }),
    onMusicToggle: () => void toggleMusic()
  });
  if (failedShortcuts.length > 0) {
    sendNotice(`以下全局快捷键已被其他应用占用：${failedShortcuts.join("、")}`);
  }

  ipcMain.handle("desktop:open-user-data", (event) => {
    assertTrustedSender(event);
    return shell.openPath(userData);
  });
  ipcMain.handle("desktop:core-status", (event) => {
    assertTrustedSender(event);
    return {
      core: runtimeStatus(coreRuntime),
      homepage: runtimeStatus(homepageRuntime),
      activityWatch: runtimeStatus(activityWatchRuntime),
      userData
    };
  });

  if (smokeTest) {
    setTimeout(quitApplication, 1_000);
  }
}

app.on("activate", () => {
  showMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  stopHomepageProcess();
  stopCoreProcess();
  stopActivityWatchProcess();
});

function quitApplication(): void {
  isQuitting = true;
  app.quit();
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
}

async function toggleTimer(): Promise<void> {
  try {
    const current = await getCore<{ paused?: boolean; session?: unknown }>("/api/timer/current");
    if (!current.session) {
      await postCore("/api/timer/start");
    } else if (current.paused) {
      await postCore("/api/timer/resume");
    } else {
      await postCore("/api/timer/pause");
    }
  } catch (error) {
    sendNotice(errorMessage(error));
  }
}

async function toggleMusic(): Promise<void> {
  try {
    const current = await getCore<{ playing?: boolean }>("/api/music/current");
    await postCore(current.playing ? "/api/music/pause" : "/api/music/play");
  } catch (error) {
    sendNotice(errorMessage(error));
  }
}

async function postCore(path: string, payload?: Record<string, unknown>): Promise<void> {
  try {
    const response = await fetch(`${requiredCoreUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {})
    });
    if (!response.ok) {
      throw new Error(`workbench-core 返回 ${response.status}：${path}`);
    }
  } catch (error) {
    sendNotice(errorMessage(error));
  }
}

async function getCore<T>(path: string): Promise<T> {
  const response = await fetch(`${requiredCoreUrl()}${path}`);
  if (!response.ok) {
    throw new Error(`workbench-core 返回 ${response.status}：${path}`);
  }
  return (await response.json()) as T;
}

function requiredCoreUrl(): string {
  if (!coreRuntime) throw new Error("workbench-core 尚未启动");
  return coreRuntime.url;
}

function sendNotice(message: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:notice", message);
  }
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const allowedOrigin = homepageRuntime ? new URL(homepageRuntime.url).origin : undefined;
  const senderOrigin = safeOrigin(event.senderFrame?.url);
  if (!allowedOrigin || senderOrigin !== allowedOrigin) {
    throw new Error("拒绝来自非工作站页面的桌面 IPC 请求");
  }
}

function safeOrigin(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return undefined;
  }
}

function runtimeStatus(runtime: RuntimeService | undefined): Record<string, unknown> | undefined {
  if (!runtime) return undefined;
  return {
    external: runtime.external,
    pid: runtime.pid,
    url: runtime.url
  };
}

function loadAppIcon(): NativeImage {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "app-assets", "icon.png")
    : resolve(app.getAppPath(), "build", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function handleBootstrapError(error: unknown): void {
  stopHomepageProcess();
  stopCoreProcess();
  stopActivityWatchProcess();
  const userData = app.getPath("userData");
  dialog.showErrorBox(
    "Cognitive Workstation 启动失败",
    `${errorMessage(error)}\n\n日志目录：${join(userData, "logs")}`
  );
  quitApplication();
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const systemError = error as NodeJS.ErrnoException;
  if (systemError.code) {
    const operation = systemError.syscall ? `，操作：${systemError.syscall}` : "";
    const path = systemError.path ? `，路径：${systemError.path}` : "";
    return `系统操作失败（${systemError.code}${operation}${path}）`;
  }
  return error.message;
}
