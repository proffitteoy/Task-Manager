import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { app } from "electron";

import {
  connectExternalRuntime,
  findAvailablePort,
  normalizeLocalUrl,
  startRuntimeProcess,
  type RuntimeService
} from "./runtimeProcess.js";

let homepageRuntime: RuntimeService | undefined;

export async function startHomepageProcess(userData: string, coreUrl: string): Promise<RuntimeService> {
  const configuredUrl = normalizeLocalUrl(process.env.HOMEPAGE_URL, 3000);
  if (process.env.HOMEPAGE_EXTERNAL === "1") {
    homepageRuntime = await connectExternalRuntime({
      healthUrl: configuredUrl.toString(),
      name: "外部 Homepage",
      url: configuredUrl.origin
    });
    return homepageRuntime;
  }

  const preferredPort = numberFromEnvironment("HOMEPAGE_PORT", Number(configuredUrl.port || 3000));
  const port = await findAvailablePort(preferredPort);
  const url = `http://127.0.0.1:${port}`;
  const entry = process.env.HOMEPAGE_ENTRY || resolveHomepageEntry();
  const configDirectory = join(userData, "config", "homepage");
  seedHomepageConfig(configDirectory);

  homepageRuntime = await startRuntimeProcess({
    cwd: dirname(entry),
    entry,
    env: {
      HOMEPAGE_CONFIG_DIR: configDirectory,
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      PORT: String(port),
      WORKBENCH_CORE_URL: coreUrl
    },
    healthUrl: url,
    logFile: join(userData, "logs", "homepage.log"),
    name: "Homepage",
    timeoutMs: 60_000,
    url
  });
  return homepageRuntime;
}

export function stopHomepageProcess(): void {
  homepageRuntime?.stop();
  homepageRuntime = undefined;
}

function resolveHomepageEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "app-runtime", "homepage", "apps", "homepage", "server.js");
  }
  return resolve(app.getAppPath(), "..", "homepage", ".next", "standalone", "apps", "homepage", "server.js");
}

function seedHomepageConfig(target: string): void {
  const source = app.isPackaged
    ? join(process.resourcesPath, "app-defaults", "homepage-config")
    : resolve(app.getAppPath(), "..", "homepage", "config");
  mkdirSync(target, { recursive: true });
  if (!existsSync(source)) {
    throw new Error(`Homepage 默认配置不存在：${source}`);
  }
  cpSync(source, target, {
    errorOnExist: false,
    force: false,
    recursive: true
  });
}

function numberFromEnvironment(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} 不是有效端口：${String(process.env[name])}`);
  }
  return value;
}
