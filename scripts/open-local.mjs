import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreDirectory = resolve(workspaceDirectory, "services", "workbench-core");
const homepageDirectory = resolve(workspaceDirectory, "apps", "homepage");
const checkOnly = process.argv.includes("--check");
const devMode = process.argv.includes("--dev");
const noOpen = checkOnly || process.argv.includes("--no-open");
let corePort = readPort("WORKBENCH_CORE_PORT", process.env.WORKBENCH_CORE_PORT ?? process.env.PORT ?? "3900");
let homepagePort = readPort("HOMEPAGE_PORT", process.env.HOMEPAGE_PORT ?? "3000");
let coreUrl = `http://127.0.0.1:${corePort}`;
let homepageUrl = `http://127.0.0.1:${homepagePort}`;
const children = new Map();
let stopping = false;

try {
  let [coreIsReady, homepageIsReady] = await Promise.all([
    isReady(`${coreUrl}/health`, "core"),
    isReady(homepageUrl, "homepage")
  ]);

  if (coreIsReady) {
    console.log(`复用已运行的 Core：${coreUrl}`);
  } else {
    const preferredCorePort = corePort;
    corePort = await findAvailablePort(preferredCorePort);
    coreUrl = `http://127.0.0.1:${corePort}`;
    if (corePort !== preferredCorePort) {
      console.log(`Core 默认端口 ${preferredCorePort} 已被其他服务占用，改用 ${corePort}。`);
      homepageIsReady = false;
    }
    const command = coreCommand();
    startService("Core", command, {
      HOST: "127.0.0.1",
      PORT: String(corePort)
    });
  }

  if (homepageIsReady) {
    console.log(`复用已运行的 Homepage：${homepageUrl}`);
  } else {
    const preferredHomepagePort = homepagePort;
    homepagePort = await findAvailablePort(preferredHomepagePort);
    homepageUrl = `http://127.0.0.1:${homepagePort}`;
    if (homepagePort !== preferredHomepagePort) {
      console.log(`Homepage 默认端口 ${preferredHomepagePort} 已被其他服务占用，改用 ${homepagePort}。`);
    }
    startService("Homepage", homepageCommand(), {
      HOSTNAME: "127.0.0.1",
      PORT: String(homepagePort),
      WORKBENCH_CORE_URL: coreUrl
    });
  }

  await Promise.all([
    coreIsReady ? Promise.resolve() : waitUntilReady("Core", `${coreUrl}/health`, "core", 45_000),
    homepageIsReady
      ? Promise.resolve()
      : waitUntilReady("Homepage", homepageUrl, "homepage", 90_000)
  ]);

  console.log(`工作站已就绪：${homepageUrl}`);
  if (checkOnly) {
    console.log("本机模式自检通过，正在停止测试服务。");
    await stopAll();
    process.off("SIGINT", handleInterrupt);
    process.off("SIGTERM", handleTermination);
    await delay(250);
    process.exit(0);
  } else if (noOpen) {
    console.log("已按 --no-open 跳过浏览器打开。");
  } else {
    openBrowser(homepageUrl);
  }

  if (!checkOnly && children.size > 0) {
    console.log("保持此窗口运行；按 Ctrl+C 停止本次启动的本机服务。");
    await new Promise(() => {});
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await stopAll();
  process.exitCode = 1;
}

function startService(name, command, extraEnvironment) {
  const child = spawn(command.executable, command.args, {
    cwd: command.cwd,
    env: {
      ...process.env,
      ...extraEnvironment
    },
    stdio: "inherit",
    windowsHide: true
  });

  children.set(name, child);
  child.once("error", (error) => {
    console.error(`${name} 无法启动：${error.message}`);
  });
  child.once("exit", (code, signal) => {
    children.delete(name);
    if (!stopping) {
      console.error(`${name} 已意外退出（${signal ? `信号 ${signal}` : `退出码 ${String(code)}`}）。`);
      void stopAll().then(() => {
        process.exitCode = code && code !== 0 ? code : 1;
        process.exit();
      });
    }
  });
}

function coreCommand() {
  const tsxEntry = resolve(coreDirectory, "node_modules", "tsx", "dist", "cli.mjs");
  if (existsSync(tsxEntry)) {
    return {
      executable: process.execPath,
      args: [tsxEntry, "watch", "src/index.ts"],
      cwd: coreDirectory
    };
  }

  const builtEntry = resolve(coreDirectory, "dist", "index.js");
  if (existsSync(builtEntry)) {
    console.log("Core 的开发运行文件不可用，改用本机已有构建产物。");
    return {
      executable: process.execPath,
      args: [builtEntry],
      cwd: coreDirectory
    };
  }

  throw new Error("Core 本机运行文件不存在；请先运行 pnpm install 和 pnpm build。");
}

function homepageCommand() {
  if (!devMode) {
    const runtimeDirectory = findHomepageRuntime();
    if (runtimeDirectory) {
      prepareHomepageAssets(runtimeDirectory);
      console.log("Homepage 使用本机已有生产构建；传入 --dev 可改用源码开发服务。");
      return {
        executable: process.execPath,
        args: [resolve(runtimeDirectory, "server.js")],
        cwd: runtimeDirectory
      };
    }
    console.log("Homepage 生产构建不可用，改用本机源码开发服务。");
  }

  const nextEntry = resolve(homepageDirectory, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextEntry)) {
    throw new Error("Homepage 的生产构建和 Next.js 本机依赖均不可用；请先运行 pnpm install 和 pnpm build。");
  }
  return {
    executable: process.execPath,
    args: [nextEntry, "dev"],
    cwd: homepageDirectory
  };
}

function findHomepageRuntime() {
  const sourceBuildId = readOptionalText(resolve(homepageDirectory, ".next", "BUILD_ID"));
  const candidates = [
    resolve(workspaceDirectory, "apps", "desktop-shell", "build", "homepage-runtime-v4", "apps", "homepage"),
    resolve(homepageDirectory, ".next", "standalone", "apps", "homepage")
  ];

  for (const candidate of candidates) {
    if (!existsSync(resolve(candidate, "server.js"))) continue;
    if (!existsSync(resolve(candidate, "node_modules", "next", "package.json"))) continue;
    const candidateBuildId = readOptionalText(resolve(candidate, ".next", "BUILD_ID"));
    if (sourceBuildId && candidateBuildId !== sourceBuildId) continue;
    return candidate;
  }
  return undefined;
}

function prepareHomepageAssets(runtimeDirectory) {
  ensureDirectoryLink(resolve(homepageDirectory, "public"), resolve(runtimeDirectory, "public"));
  ensureDirectoryLink(
    resolve(homepageDirectory, ".next", "static"),
    resolve(runtimeDirectory, ".next", "static")
  );
}

function ensureDirectoryLink(source, destination) {
  if (existsSync(destination)) return;
  if (!existsSync(source)) {
    throw new Error(`Homepage 本机构建资源不存在：${source}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  try {
    symlinkSync(source, destination, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    throw new Error(`无法连接 Homepage 本机构建资源 ${destination}：${error.message}`);
  }
}

function readOptionalText(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

async function waitUntilReady(name, url, service, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const child = children.get(name);
    if (!child || child.exitCode !== null) {
      throw new Error(`${name} 在就绪前退出。`);
    }
    if (await isReady(url, service)) return;
    await delay(300);
  }
  throw new Error(`${name} 启动超时（${Math.round(timeoutMs / 1_000)} 秒）：${url}`);
}

async function isReady(url, service) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) return false;
    if (service === "core") {
      const body = await response.json();
      return body?.ok === true;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return false;
    const body = await response.text();
    if (!/<!doctype html|<html[\s>]/i.test(body)) return false;
    const assetPath = body.match(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/i)?.[1];
    if (!assetPath) return false;
    const assetResponse = await fetch(new URL(assetPath.replaceAll("&amp;", "&"), url), {
      signal: AbortSignal.timeout(1_500)
    });
    return assetResponse.ok;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? { executable: "explorer.exe", args: [url] }
      : process.platform === "darwin"
        ? { executable: "open", args: [url] }
        : { executable: "xdg-open", args: [url] };

  const opener = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  opener.once("error", (error) => {
    console.warn(`浏览器未能自动打开：${error.message}`);
    console.warn(`请手动访问 ${url}`);
  });
  opener.unref();
}

async function stopAll() {
  if (stopping) return;
  stopping = true;

  const ownedChildren = [...children.values()];
  children.clear();
  await Promise.all(ownedChildren.map(stopChildTree));
}

async function stopChildTree(child) {
  if (!child.pid || child.exitCode !== null || child.killed) return;

  if (process.platform === "win32") {
    const childClosed = waitForChildClose(child, 5_000);
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.once("error", () => {
        child.kill();
        resolve();
      });
      killer.once("exit", resolve);
    });
    await childClosed;
    return;
  }

  child.kill("SIGTERM");
  await waitForChildClose(child, 5_000);
}

function waitForChildClose(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      child.off("close", finish);
      child.off("exit", finish);
      resolve();
    }
    child.once("close", finish);
    child.once("exit", finish);
  });
}

function readPort(name, rawValue) {
  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} 必须是 1 到 65535 之间的端口号，当前值为 ${rawValue}`);
  }
  return port;
}

async function findAvailablePort(preferredPort) {
  const lastCandidate = Math.min(preferredPort + 20, 65_535);
  for (let port = preferredPort; port <= lastCandidate; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`无法在 ${preferredPort} 到 ${lastCandidate} 之间找到可用本机端口。`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function handleInterrupt() {
  void stopAll().then(() => process.exit(130));
}

function handleTermination() {
  void stopAll().then(() => process.exit(143));
}

process.once("SIGINT", handleInterrupt);
process.once("SIGTERM", handleTermination);
