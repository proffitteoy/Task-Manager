import { spawn } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(currentDirectory, "..");
const require = createRequire(import.meta.url);
const builderCli = require.resolve("electron-builder/cli.js");
const rebuildModule = createRequire(builderCli).resolve("@electron/rebuild");
const { rebuild } = await import(pathToFileURL(rebuildModule).href);
const electronVersion = require("electron/package.json").version;
const electronDist = join(dirname(require.resolve("electron/package.json")), "dist");
const sqliteEntry = require.resolve("better-sqlite3", {
  paths: [join(appDirectory, "node_modules", "@cw", "workbench-core")]
});
const sqlitePackageDirectory = resolve(dirname(sqliteEntry), "..");
const sqliteNative = join(sqlitePackageDirectory, "build", "Release", "better_sqlite3.node");
const backupDirectory = join(appDirectory, "build", ".native-backup");
const nodeNativeBackup = join(backupDirectory, "node-better_sqlite3.node");
const electronNativeBackup = join(backupDirectory, "electron-better_sqlite3.node");
const homepageStandalone = resolve(appDirectory, "../homepage/.next/standalone");
const homepageRuntime = join(appDirectory, "build", "homepage-runtime-v2");
const activityWatchRuntime = join(appDirectory, "build", "activitywatch-runtime");
const tokeiRuntime = join(appDirectory, "build", "tokei-runtime");
const pythonRuntime = join(appDirectory, "build", "python-runtime");
const builderCache = join(appDirectory, "build", ".electron-builder-cache");

prepareHomepageRuntime(homepageStandalone, homepageRuntime);
prepareActivityWatchRuntime(activityWatchRuntime);
prepareTokeiRuntime(tokeiRuntime);
preparePythonRuntime(pythonRuntime);
prepareBuilderCache(builderCache);

let nativeBackedUp = false;
if (existsSync(sqliteNative)) {
  mkdirSync(backupDirectory, { recursive: true });
  copyFileSync(sqliteNative, nodeNativeBackup);
  nativeBackedUp = true;
}

let exitCode = 1;
try {
  await rebuild({
    buildPath: appDirectory,
    electronVersion,
    force: true,
    mode: "sequential",
    onlyModules: ["better-sqlite3"]
  });
  if (!existsSync(sqliteNative)) {
    throw new Error(`Electron native rebuild did not produce ${sqliteNative}`);
  }
  copyFileSync(sqliteNative, electronNativeBackup);

  const builderArguments = [
    builderCli,
    `--config.electronDist=${electronDist}`,
    "--config.npmRebuild=false"
  ];
  const requestedArguments = process.argv.slice(2);
  const buildsNsis = requestedArguments.includes("nsis");

  exitCode = buildsNsis
    ? await run(process.execPath, [...builderArguments, "--dir", "--win"])
    : await run(process.execPath, [...builderArguments, ...requestedArguments]);
  if (exitCode === 0) {
    removePackagedElectronDefaultApp();
    preservePackagedElectronNatives(electronNativeBackup);
    verifyPackagedDesktopShell();
    verifyPackagedHomepageRuntime();
  }
  if (exitCode === 0 && buildsNsis) {
    const unpackedApplication = join(appDirectory, "release", "win-unpacked");
    exitCode = await run(process.execPath, [
      ...builderArguments,
      "--prepackaged",
      unpackedApplication,
      "--win",
      "nsis"
    ]);
  }
} finally {
  if (nativeBackedUp) {
    try {
      rmSync(sqliteNative, { force: true });
      copyFileSync(nodeNativeBackup, sqliteNative);
      console.log("Restored the Node.js better-sqlite3 native module after Electron packaging.");
    } catch (error) {
      console.error("Unable to restore the Node.js better-sqlite3 native module:", error);
      exitCode = 1;
    }
  }
  rmSync(backupDirectory, { force: true, recursive: true });
}

process.exitCode = exitCode;

function prepareBuilderCache(directory) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), '{"type":"commonjs"}\n', "utf8");
}

function prepareHomepageRuntime(source, destination) {
  const sourceApp = join(source, "apps", "homepage");
  const sourceModules = join(sourceApp, "node_modules");
  if (!existsSync(join(sourceApp, "server.js")) || !existsSync(sourceModules)) {
    throw new Error(`Homepage standalone build is incomplete: ${source}`);
  }
  if (canReuseHomepageRuntime(source, destination)) {
    console.log("Reusing the verified portable Homepage runtime for the current Next.js build.");
    return;
  }

  rmSync(destination, { force: true, recursive: true });
  mkdirSync(dirname(destination), { recursive: true });
  const excludedDirectories = ["node_modules", join("apps", "homepage", "node_modules")];
  cpSync(source, destination, {
    dereference: true,
    filter: (path) => {
      const pathFromSource = relative(source, path);
      return !excludedDirectories.some(
        (excluded) => pathFromSource === excluded || pathFromSource.startsWith(`${excluded}${sep}`)
      );
    },
    preserveTimestamps: true,
    recursive: true
  });

  const destinationModules = join(destination, "apps", "homepage", "node_modules");
  mkdirSync(destinationModules, { recursive: true });
  const packageState = new Map();
  const directPackages = listPackages(sourceModules).map(({ name, path }) => ({
    destination: packagePath(destinationModules, name),
    name,
    source: realpathSync(path)
  }));

  // Seed direct dependencies first so their versions always win the top-level slots.
  for (const directPackage of directPackages) {
    ensurePackageCopy(directPackage.source, directPackage.destination, packageState);
  }
  for (const directPackage of directPackages) {
    installPackageDependencies(
      directPackage.source,
      directPackage.destination,
      destinationModules,
      packageState
    );
  }

  const helperPackage = join(destinationModules, "@swc", "helpers", "package.json");
  if (!existsSync(helperPackage)) {
    throw new Error(`Portable Homepage runtime does not contain ${helperPackage}`);
  }
  verifyHomepageHealthcheckBypass(destination);
  const links = findSymbolicLinks(destination);
  if (links.length > 0) {
    throw new Error(`Portable Homepage runtime still contains filesystem links: ${links[0]}`);
  }
  console.log(`Prepared portable Homepage runtime with ${packageState.size} package directories.`);
}

function prepareActivityWatchRuntime(destination) {
  const source = process.env.ACTIVITYWATCH_BUNDLE_DIR || process.env.ACTIVITYWATCH_HOME;
  const modules = ["aw-server", "aw-watcher-window", "aw-watcher-afk"];
  const isComplete = (directory) =>
    modules.every((name) => existsSync(join(directory, name, `${name}.exe`)));

  if (!source || !isComplete(source)) {
    if (isComplete(destination)) {
      console.log("Reusing the staged ActivityWatch runtime.");
      return;
    }
    throw new Error(
      "ActivityWatch runtime is missing. Install ActivityWatch or set ACTIVITYWATCH_BUNDLE_DIR before packaging."
    );
  }

  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });
  for (const moduleName of modules) {
    copyDirectory(join(source, moduleName), join(destination, moduleName));
  }
  copyFileSync(
    join(appDirectory, "resources", "ACTIVITYWATCH-NOTICE.txt"),
    join(destination, "ACTIVITYWATCH-NOTICE.txt")
  );
  console.log("Prepared the bundled ActivityWatch server and watchers.");
}

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath);
    } else if (entry.isSymbolicLink()) {
      const resolved = realpathSync(sourcePath);
      copyDirectory(resolved, destinationPath);
    }
  }
}

function prepareTokeiRuntime(destination) {
  const source = process.env.TOKEI_BUNDLE_DIR;
  const requiredFiles = ["usage.30s.py", "pricing.json", "pricing_overrides.json"];
  const isComplete = (directory) =>
    directory && requiredFiles.every((filename) => existsSync(join(directory, filename)));
  if (!isComplete(source)) {
    if (isComplete(destination)) {
      console.log("Reusing the staged Tokei token collector.");
      return;
    }
    throw new Error(
      "Tokei collector source is missing. Set TOKEI_BUNDLE_DIR before packaging."
    );
  }
  for (const filename of requiredFiles) {
    if (!existsSync(join(source, filename))) {
      throw new Error(`Tokei runtime is missing ${join(source, filename)}`);
    }
  }

  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });
  for (const filename of requiredFiles) {
    copyFileSync(join(source, filename), join(destination, filename));
  }
  copyFileSync(
    join(appDirectory, "resources", "TOKEI-NOTICE.txt"),
    join(destination, "TOKEI-NOTICE.txt")
  );
  console.log("Prepared the bundled Tokei token collector.");
}

function preparePythonRuntime(destination) {
  const source =
    process.env.TOKEI_PYTHON_HOME ||
    (process.env.TOKEI_PYTHON ? dirname(process.env.TOKEI_PYTHON) : undefined);
  if (!source || !existsSync(join(source, "python.exe"))) {
    if (existsSync(join(destination, "python.exe"))) {
      console.log("Reusing the staged Python runtime for Tokei.");
      return;
    }
    throw new Error(
      "Python 3.12 runtime is missing. Set TOKEI_PYTHON_HOME before packaging."
    );
  }

  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });
  for (const filename of [
    "python.exe",
    "python3.dll",
    "python312.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
    "LICENSE.txt"
  ]) {
    const path = join(source, filename);
    if (!existsSync(path)) throw new Error(`Python runtime is missing ${path}`);
    copyFileSync(path, join(destination, filename));
  }
  copyDirectory(join(source, "DLLs"), join(destination, "DLLs"));
  copyPythonStandardLibrary(join(source, "Lib"), join(destination, "Lib"));
  console.log("Prepared the bundled Python standard runtime for Tokei.");
}

function copyPythonStandardLibrary(source, destination, relativePath = "") {
  const excluded = new Set(["site-packages", "__pycache__", "test", "tests", "tkinter", "idlelib", "ensurepip", "venv"]);
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      copyPythonStandardLibrary(sourcePath, destinationPath, join(relativePath, entry.name));
    } else if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

function canReuseHomepageRuntime(source, destination) {
  const sourceBuildId = join(source, "apps", "homepage", ".next", "BUILD_ID");
  const destinationBuildId = join(destination, "apps", "homepage", ".next", "BUILD_ID");
  const helperPackage = join(
    destination,
    "apps",
    "homepage",
    "node_modules",
    "@swc",
    "helpers",
    "package.json"
  );
  if (!existsSync(sourceBuildId) || !existsSync(destinationBuildId) || !existsSync(helperPackage)) {
    return false;
  }
  if (!hasHomepageHealthcheckBypass(destination)) return false;
  if (readFileSync(sourceBuildId, "utf8") !== readFileSync(destinationBuildId, "utf8")) {
    return false;
  }
  return findSymbolicLinks(destination).length === 0;
}

function verifyHomepageHealthcheckBypass(runtime) {
  if (!hasHomepageHealthcheckBypass(runtime)) {
    throw new Error(
      "Homepage standalone middleware still intercepts /healthcheck.txt. Rebuild Homepage before packaging."
    );
  }
}

function hasHomepageHealthcheckBypass(runtime) {
  const manifest = join(
    runtime,
    "apps",
    "homepage",
    ".next",
    "server",
    "middleware-manifest.json"
  );
  return existsSync(manifest) && readFileSync(manifest, "utf8").includes("healthcheck.txt");
}

function listPackages(nodeModules) {
  const packages = [];
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = join(nodeModules, entry.name);
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      for (const scopedEntry of readdirSync(entryPath, { withFileTypes: true })) {
        const scopedPath = join(entryPath, scopedEntry.name);
        if (existsSync(join(scopedPath, "package.json"))) {
          packages.push({ name: `${entry.name}/${scopedEntry.name}`, path: scopedPath });
        }
      }
      continue;
    }
    if (existsSync(join(entryPath, "package.json"))) {
      packages.push({ name: entry.name, path: entryPath });
    }
  }
  return packages;
}

function installPackageDependencies(source, destination, topLevelModules, packageState) {
  const packageJson = readPackageJson(source);
  const state = packageState.get(destination.toLowerCase());
  if (!state) {
    throw new Error(`Package was not copied before dependency traversal: ${destination}`);
  }
  if (state.status === "installing" || state.status === "installed") return;
  state.status = "installing";

  const dependencies = new Map();
  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
    dependencies.set(dependencyName, false);
  }
  for (const dependencyName of Object.keys(packageJson.optionalDependencies ?? {})) {
    if (!dependencies.has(dependencyName)) dependencies.set(dependencyName, true);
  }
  for (const dependencyName of Object.keys(packageJson.peerDependencies ?? {})) {
    if (packageJson.peerDependenciesMeta?.[dependencyName]?.optional === true) continue;
    dependencies.set(dependencyName, false);
  }

  for (const [dependencyName, isOptional] of dependencies) {
    const dependencySource = resolveDependency(source, packageJson.name, dependencyName);
    if (!dependencySource) {
      if (isOptional) continue;
      throw new Error(`${packageJson.name} is missing required dependency ${dependencyName}`);
    }
    const dependencyJson = readPackageJson(dependencySource);
    const topLevelDestination = packagePath(topLevelModules, dependencyName);
    const topLevelJson = readPackageJsonIfPresent(topLevelDestination);
    const dependencyDestination =
      !topLevelJson || samePackage(topLevelJson, dependencyJson)
        ? topLevelDestination
        : packagePath(join(destination, "node_modules"), dependencyName);

    ensurePackageCopy(dependencySource, dependencyDestination, packageState);
    installPackageDependencies(
      dependencySource,
      dependencyDestination,
      topLevelModules,
      packageState
    );
  }
  state.status = "installed";
}

function ensurePackageCopy(source, destination, packageState) {
  const sourceJson = readPackageJson(source);
  const key = destination.toLowerCase();
  const existingState = packageState.get(key);
  if (existingState) {
    if (!samePackage(existingState.packageJson, sourceJson)) {
      throw new Error(
        `Dependency version collision at ${destination}: ${packageIdentity(existingState.packageJson)} vs ${packageIdentity(sourceJson)}`
      );
    }
    return;
  }

  const existingJson = readPackageJsonIfPresent(destination);
  if (existingJson && !samePackage(existingJson, sourceJson)) {
    throw new Error(
      `Dependency version collision at ${destination}: ${packageIdentity(existingJson)} vs ${packageIdentity(sourceJson)}`
    );
  }
  if (!existingJson) {
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, {
      dereference: true,
      filter: (path) => {
        const pathFromPackage = relative(source, path);
        return pathFromPackage !== "node_modules" && !pathFromPackage.startsWith(`node_modules${sep}`);
      },
      preserveTimestamps: true,
      recursive: true
    });
  }
  packageState.set(key, { packageJson: sourceJson, status: "seeded" });
}

function resolveDependency(sourcePackage, sourcePackageName, dependencyName) {
  const sourceModules = sourcePackageName.startsWith("@")
    ? dirname(dirname(sourcePackage))
    : dirname(sourcePackage);
  const dependency = packagePath(sourceModules, dependencyName);
  if (existsSync(join(dependency, "package.json"))) {
    return realpathSync(dependency);
  }

  const packageRequire = createRequire(join(sourcePackage, "package.json"));
  try {
    const packageJson = packageRequire.resolve(`${dependencyName}/package.json`);
    return dirname(packageJson);
  } catch {
    return undefined;
  }
}

function packagePath(nodeModules, packageName) {
  return join(nodeModules, ...packageName.split("/"));
}

function readPackageJson(packageDirectory) {
  return JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
}

function readPackageJsonIfPresent(packageDirectory) {
  const packageJson = join(packageDirectory, "package.json");
  return existsSync(packageJson) ? JSON.parse(readFileSync(packageJson, "utf8")) : undefined;
}

function samePackage(left, right) {
  return left.name === right.name && left.version === right.version;
}

function packageIdentity(packageJson) {
  return `${packageJson.name}@${packageJson.version}`;
}

function findSymbolicLinks(directory) {
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) matches.push(path);
    else if (entry.isDirectory()) matches.push(...findSymbolicLinks(path));
  }
  return matches;
}

function preservePackagedElectronNatives(electronNative) {
  const unpackedRoot = join(appDirectory, "release", "win-unpacked", "resources", "app.asar.unpacked");
  if (!existsSync(unpackedRoot)) return;
  const packagedNatives = findFiles(unpackedRoot, "better_sqlite3.node");
  if (packagedNatives.length === 0) {
    throw new Error("Packaged app does not contain better_sqlite3.node");
  }
  for (const packagedNative of packagedNatives) {
    rmSync(packagedNative, { force: true });
    copyFileSync(electronNative, packagedNative);
  }
  console.log(`Verified ${packagedNatives.length} packaged Electron better-sqlite3 native module(s).`);
}

function verifyPackagedHomepageRuntime() {
  const packagedHomepage = join(
    appDirectory,
    "release",
    "win-unpacked",
    "resources",
    "app-runtime",
    "homepage"
  );
  const helperPackage = join(
    packagedHomepage,
    "apps",
    "homepage",
    "node_modules",
    "@swc",
    "helpers",
    "package.json"
  );
  if (!existsSync(helperPackage)) {
    throw new Error(`Packaged Homepage runtime does not contain ${helperPackage}`);
  }
  const healthcheckFile = join(packagedHomepage, "apps", "homepage", "public", "healthcheck.txt");
  if (!existsSync(healthcheckFile) || readFileSync(healthcheckFile, "utf8").trim() !== "up") {
    throw new Error(`Packaged Homepage runtime does not contain a valid ${healthcheckFile}`);
  }
  verifyHomepageHealthcheckBypass(packagedHomepage);
  const links = findSymbolicLinks(packagedHomepage);
  if (links.length > 0) {
    throw new Error(`Packaged Homepage runtime contains a non-portable link: ${links[0]}`);
  }
  console.log("Verified portable packaged Homepage runtime.");
}

function verifyPackagedDesktopShell() {
  const resources = join(appDirectory, "release", "win-unpacked", "resources");
  if (!existsSync(join(resources, "app.asar"))) {
    throw new Error("Packaged desktop shell does not contain resources/app.asar");
  }
  if (existsSync(join(resources, "default_app.asar"))) {
    throw new Error("Packaged desktop shell still contains Electron default_app.asar");
  }
  const activityWatch = join(resources, "app-runtime", "activitywatch");
  for (const moduleName of ["aw-server", "aw-watcher-window", "aw-watcher-afk"]) {
    const executable = join(activityWatch, moduleName, `${moduleName}.exe`);
    if (!existsSync(executable)) {
      throw new Error(`Packaged desktop shell does not contain ${executable}`);
    }
  }
  if (!existsSync(join(activityWatch, "ACTIVITYWATCH-NOTICE.txt"))) {
    throw new Error("Packaged desktop shell does not contain the ActivityWatch license notice");
  }
  const tokei = join(resources, "app-runtime", "tokei");
  for (const filename of ["usage.30s.py", "pricing.json", "pricing_overrides.json", "TOKEI-NOTICE.txt"]) {
    if (!existsSync(join(tokei, filename))) {
      throw new Error(`Packaged desktop shell does not contain ${join(tokei, filename)}`);
    }
  }
  const python = join(resources, "app-runtime", "python");
  if (!existsSync(join(python, "python.exe")) || !existsSync(join(python, "LICENSE.txt"))) {
    throw new Error("Packaged desktop shell does not contain the Python runtime or its license");
  }
  console.log("Verified packaged desktop shell entrypoint.");
}

function removePackagedElectronDefaultApp() {
  const defaultApp = join(
    appDirectory,
    "release",
    "win-unpacked",
    "resources",
    "default_app.asar"
  );
  if (existsSync(defaultApp)) unlinkSync(defaultApp);
  console.log("Removed Electron default_app.asar before installer creation.");
}

function findFiles(directory, filename) {
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...findFiles(path, filename));
    else if (entry.isFile() && entry.name === filename) matches.push(path);
  }
  return matches;
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: appDirectory,
      env: {
        ...process.env,
        ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || builderCache
      },
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
