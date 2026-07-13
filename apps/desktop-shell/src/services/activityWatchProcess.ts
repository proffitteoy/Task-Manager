import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { app } from "electron";

import { normalizeLocalUrl, type RuntimeService } from "./runtimeProcess.js";

let activityWatchRuntime: RuntimeService | undefined;

export async function startActivityWatchProcess(userData: string): Promise<RuntimeService> {
  const configuredUrl = normalizeLocalUrl(process.env.ACTIVITYWATCH_URL, 5600);
  const url = configuredUrl.origin;

  if (process.env.ACTIVITYWATCH_MANAGED === "0" || !isLoopback(configuredUrl.hostname)) {
    activityWatchRuntime = externalRuntime(url);
    return activityWatchRuntime;
  }
  if (await isHealthy(url)) {
    activityWatchRuntime = externalRuntime(url);
    return activityWatchRuntime;
  }

  const runtimeDirectory = resolveActivityWatchRuntime();
  const executables = {
    server: join(runtimeDirectory, "aw-server", "aw-server.exe"),
    window: join(runtimeDirectory, "aw-watcher-window", "aw-watcher-window.exe"),
    afk: join(runtimeDirectory, "aw-watcher-afk", "aw-watcher-afk.exe")
  };
  for (const [name, executable] of Object.entries(executables)) {
    if (!existsSync(executable)) {
      throw new Error(`ActivityWatch ${name} 运行时不存在：${executable}`);
    }
  }

  const logFile = join(userData, "logs", "activitywatch.log");
  mkdirSync(dirname(logFile), { recursive: true });
  const log = createWriteStream(logFile, { flags: "a" });
  const children: ChildProcess[] = [];
  const serviceArgs = ["--host", configuredUrl.hostname, "--port", configuredUrl.port || "5600"];

  try {
    const server = spawnActivityWatch(executables.server, serviceArgs, log, "aw-server");
    children.push(server);
    await waitForServer(url, server, 30_000);

    children.push(spawnActivityWatch(executables.window, serviceArgs, log, "aw-watcher-window"));
    children.push(spawnActivityWatch(executables.afk, serviceArgs, log, "aw-watcher-afk"));
  } catch (error) {
    stopChildren(children);
    log.end();
    throw error;
  }

  activityWatchRuntime = {
    external: false,
    pid: children[0]?.pid,
    url,
    stop: () => {
      stopChildren(children);
      log.end();
    }
  };
  return activityWatchRuntime;
}

export function stopActivityWatchProcess(): void {
  activityWatchRuntime?.stop();
  activityWatchRuntime = undefined;
}

function resolveActivityWatchRuntime(): string {
  if (process.env.ACTIVITYWATCH_HOME) return resolve(process.env.ACTIVITYWATCH_HOME);
  if (app.isPackaged) return join(process.resourcesPath, "app-runtime", "activitywatch");
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("无法定位 ActivityWatch：LOCALAPPDATA 未设置");
  return join(localAppData, "Programs", "ActivityWatch");
}

function spawnActivityWatch(
  executable: string,
  args: string[],
  log: WriteStream,
  name: string
): ChildProcess {
  writeLog(log, `${name} starting: ${executable}`);
  const child = spawn(executable, args, {
    cwd: dirname(executable),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  child.once("error", (error) => writeLog(log, `${name} error: ${error.message}`));
  child.once("exit", (code, signal) => {
    writeLog(log, `${name} exited: code=${String(code)} signal=${String(signal)}`);
  });
  return child;
}

async function waitForServer(url: string, server: ChildProcess, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (server.exitCode !== null) {
      throw new Error(`aw-server 在就绪前退出，退出码 ${String(server.exitCode)}`);
    }
    if (await isHealthy(url)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`aw-server 启动超时（${Math.round(timeoutMs / 1_000)} 秒）：${url}`);
}

async function isHealthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("/api/0/info", url), {
      signal: AbortSignal.timeout(1_500)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function stopChildren(children: ChildProcess[]): void {
  for (const child of [...children].reverse()) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
}

function externalRuntime(url: string): RuntimeService {
  return { external: true, url, stop: () => undefined };
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function writeLog(stream: WriteStream, message: string): void {
  stream.write(`[${new Date().toISOString()}] ${message}\n`);
}
