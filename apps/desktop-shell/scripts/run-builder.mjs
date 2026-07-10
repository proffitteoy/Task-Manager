import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(currentDirectory, "..");
const require = createRequire(import.meta.url);
const builderCli = require.resolve("electron-builder/cli.js");
const sqliteEntry = require.resolve("better-sqlite3", {
  paths: [join(appDirectory, "node_modules", "@cw", "workbench-core")]
});
const sqlitePackageDirectory = resolve(dirname(sqliteEntry), "..");
const sqliteNative = join(sqlitePackageDirectory, "build", "Release", "better_sqlite3.node");
const backup = join(appDirectory, "build", ".native-backup", "better_sqlite3.node");

let nativeBackedUp = false;
if (existsSync(sqliteNative)) {
  mkdirSync(dirname(backup), { recursive: true });
  copyFileSync(sqliteNative, backup);
  nativeBackedUp = true;
}

let exitCode = 1;
try {
  exitCode = await run(process.execPath, [builderCli, ...process.argv.slice(2)]);
} finally {
  if (nativeBackedUp) {
    try {
      copyFileSync(backup, sqliteNative);
      rmSync(dirname(backup), { force: true, recursive: true });
      console.log("Restored the Node.js better-sqlite3 native module after Electron packaging.");
    } catch (error) {
      console.error("Unable to restore the Node.js better-sqlite3 native module:", error);
      exitCode = 1;
    }
  }
}

process.exitCode = exitCode;

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: appDirectory,
      env: process.env,
      stdio: "inherit",
      windowsHide: true
    });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(`electron-builder terminated by ${signal}`);
        resolveRun(1);
        return;
      }
      resolveRun(code ?? 1);
    });
  });
}
