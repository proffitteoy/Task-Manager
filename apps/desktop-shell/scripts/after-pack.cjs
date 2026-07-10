const { rmSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async function removeElectronDefaultApp(context) {
  rmSync(join(context.appOutDir, "resources", "default_app.asar"), { force: true });
};
