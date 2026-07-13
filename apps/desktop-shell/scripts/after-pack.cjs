const { existsSync, unlinkSync } = require("node:fs");
const { join } = require("node:path");

module.exports = async function removeElectronDefaultApp(context) {
  const defaultApp = join(context.appOutDir, "resources", "default_app.asar");
  if (existsSync(defaultApp)) unlinkSync(defaultApp);
  console.log("Removed Electron default_app.asar from the packaged application.");
};
