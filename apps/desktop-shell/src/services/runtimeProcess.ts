import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from "node:fs";
import { createServer } from "node:net";
import { dirname } from "node:path";

import { app } from "electron";

export interface RuntimeService {
  external: boolean;
  pid?: number;
  url: string;
  stop(): void;
}

interface SpawnRuntimeOptions {
  args?: string[];
  cwd: string;
  entry: string;
  env: NodeJS.ProcessEnv;
  healthUrl: string;
  logFile: string;
  name: string;
  timeoutMs?: number;
  url: string;
}

export async function startRuntimeProcess(options: SpawnRuntimeOptions): Promise<RuntimeService> {
  if (!existsSync(options.entry)) {
    throw new Error(`${options.name} 入口不存在：${options.entry}`);
  }

  mkdirSync(dirname(options.logFile), { recursive: true });
  const log = createWriteStream(options.logFile, { flags: "a" });
  const runtime = nodeRuntime();
  writeLog(log, `${options.name} starting: ${options.entry}`);

  const child = spawn(runtime.command, [options.entry, ...(options.args ?? [])], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...runtime.env,
      ...options.env
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  child.stdout?.pipe(log, { end: false });
  child.stderr?.pipe(log, { end: false });
  child.once("exit", (code, signal) => {
    writeLog(log, `${options.name} exited: code=${String(code)} signal=${String(signal)}`);
    log.end();
  });

  try {
    await waitForHttp(options.healthUrl, {
      child,
      name: options.name,
      timeoutMs: options.timeoutMs ?? 45_000
    });
  } catch (error) {
    stopChild(child);
    throw error;
  }

  return {
    external: false,
    pid: child.pid,
    url: options.url,
    stop: () => stopChild(child)
  };
}

export async function connectExternalRuntime(options: {
  healthUrl: string;
  name: string;
  timeoutMs?: number;
  url: string;
}): Promise<RuntimeService> {
  await waitForHttp(options.healthUrl, {
    name: options.name,
    timeoutMs: options.timeoutMs ?? 15_000
  });
  return {
    external: true,
    url: options.url,
    stop: () => undefined
  };
}

export async function findAvailablePort(preferredPort: number): Promise<number> {
  if (await canListen(preferredPort)) {
    return preferredPort;
  }
  return listenOnEphemeralPort();
}

export function normalizeLocalUrl(rawUrl: string | undefined, fallbackPort: number): URL {
  const candidate = new URL(rawUrl || `http://127.0.0.1:${fallbackPort}`);
  if (candidate.protocol !== "http:") {
    throw new Error(`桌面内置服务只支持本地 HTTP：${candidate.toString()}`);
  }
  return candidate;
}

async function waitForHttp(
  url: string,
  options: { child?: ChildProcess; name: string; timeoutMs: number }
): Promise<void> {
  const startedAt = Date.now();
  let spawnError: Error | undefined;
  options.child?.once("error", (error) => {
    spawnError = error;
  });

  while (Date.now() - startedAt < options.timeoutMs) {
    if (spawnError) {
      throw new Error(`${options.name} 无法启动：${spawnError.message}`);
    }
    if (options.child && options.child.exitCode !== null) {
      throw new Error(`${options.name} 在就绪前退出，退出码 ${String(options.child.exitCode)}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Service is still starting. The timeout below remains authoritative.
    }
    await delay(250);
  }

  throw new Error(`${options.name} 启动超时（${Math.round(options.timeoutMs / 1_000)} 秒）：${url}`);
}

function nodeRuntime(): { command: string; env: NodeJS.ProcessEnv } {
  if (app.isPackaged) {
    return {
      command: process.execPath,
      env: { ELECTRON_RUN_AS_NODE: "1" }
    };
  }
  return {
    command: process.env.NODE_EXEC_PATH || "node",
    env: {}
  };
}

function stopChild(child: ChildProcess): void {
  if (child.exitCode === null && !child.killed) {
    child.kill();
  }
}

function writeLog(stream: WriteStream, message: string): void {
  stream.write(`[${new Date().toISOString()}] ${message}\n`);
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function listenOnEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("无法分配本地端口"));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
