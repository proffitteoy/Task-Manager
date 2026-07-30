import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = resolve(currentDirectory, "..", "..", "..");
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = new Set();
let stopping = false;

const services = run(
  [
    "--parallel",
    "--filter",
    "@cw/workbench-core",
    "--filter",
    "homepage",
    "dev"
  ],
  "工作站开发服务"
);

try {
  const build = run(["--filter", "@cw/desktop-shell", "build"], "桌面壳构建");
  const buildCode = await waitForExit(build);
  if (buildCode !== 0) {
    process.exitCode = buildCode;
  } else {
    const desktop = run(
      ["--filter", "@cw/desktop-shell", "dev"],
      "桌面壳",
      {
        HOMEPAGE_EXTERNAL: "1",
        WORKBENCH_CORE_EXTERNAL: "1"
      }
    );
    process.exitCode = await waitForExit(desktop);
  }
} finally {
  stopAll();
}

function run(args, name, extraEnvironment = {}) {
  const child = spawn(packageManager, args, {
    cwd: workspaceDirectory,
    env: {
      ...process.env,
      ...extraEnvironment
    },
    stdio: "inherit",
    windowsHide: true
  });
  child.once("error", (error) => {
    console.error(`${name}无法启动：${error.message}`);
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function waitForExit(child) {
  return new Promise((resolveExit) => {
    child.once("error", () => resolveExit(1));
    child.once("exit", (code, signal) => {
      resolveExit(signal ? 1 : code ?? 1);
    });
  });
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
}

process.once("SIGINT", () => {
  stopAll();
  process.exitCode = 130;
});
process.once("SIGTERM", () => {
  stopAll();
  process.exitCode = 143;
});

services.once("exit", (code) => {
  if (!stopping && code && code !== 0) {
    console.error(`工作站开发服务已退出，退出码 ${code}`);
  }
});
