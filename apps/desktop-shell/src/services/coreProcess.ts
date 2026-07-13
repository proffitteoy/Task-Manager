import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { app } from "electron";

import {
  connectExternalRuntime,
  findAvailablePort,
  normalizeLocalUrl,
  startRuntimeProcess,
  type RuntimeService
} from "./runtimeProcess.js";

let coreRuntime: RuntimeService | undefined;

export async function startCoreProcess(userData: string): Promise<RuntimeService> {
  const configuredUrl = normalizeLocalUrl(process.env.WORKBENCH_CORE_URL, 3900);
  if (process.env.WORKBENCH_CORE_EXTERNAL === "1") {
    coreRuntime = await connectExternalRuntime({
      healthUrl: new URL("/health", configuredUrl).toString(),
      name: "外部 workbench-core",
      url: configuredUrl.origin
    });
    return coreRuntime;
  }

  const preferredPort = numberFromEnvironment("WORKBENCH_CORE_PORT", Number(configuredUrl.port || 3900));
  const port = await findAvailablePort(preferredPort);
  const url = `http://127.0.0.1:${port}`;
  const databaseDirectory = join(userData, "data");
  const entry = process.env.WORKBENCH_CORE_ENTRY || resolveCoreEntry();
  const tokeiRepo = process.env.TOKEI_REPO || resolveTokeiRuntime();
  const tokeiPython = process.env.TOKEI_PYTHON || resolveTokeiPython();

  coreRuntime = await startRuntimeProcess({
    cwd: userData,
    entry,
    env: {
      ACTIVITYWATCH_URL: process.env.ACTIVITYWATCH_URL || "http://127.0.0.1:5600",
      DATABASE_URL: process.env.DATABASE_URL || `file:${join(databaseDirectory, "workbench.sqlite")}`,
      HOST: "127.0.0.1",
      PORT: String(port),
      TOKEI_PYTHON: tokeiPython,
      TOKEI_REPO: tokeiRepo
    },
    healthUrl: `${url}/health`,
    logFile: join(userData, "logs", "workbench-core.log"),
    name: "workbench-core",
    url
  });
  return coreRuntime;
}

function resolveTokeiRuntime(): string {
  if (app.isPackaged) return join(process.resourcesPath, "app-runtime", "tokei");
  return resolve(app.getAppPath(), "build", "tokei-runtime");
}

function resolveTokeiPython(): string | undefined {
  if (app.isPackaged) {
    return join(process.resourcesPath, "app-runtime", "python", "python.exe");
  }
  return undefined;
}

export function stopCoreProcess(): void {
  coreRuntime?.stop();
  coreRuntime = undefined;
}

function resolveCoreEntry(): string {
  if (app.isPackaged) {
    return createRequire(import.meta.url).resolve("@cw/workbench-core");
  }
  return resolve(app.getAppPath(), "..", "..", "services", "workbench-core", "dist", "index.js");
}

function numberFromEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} 不是有效端口：${String(process.env[name])}`);
  }
  return value;
}
