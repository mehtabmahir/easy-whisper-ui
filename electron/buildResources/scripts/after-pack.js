const { execFileSync } = require("node:child_process");
const path = require("node:path");

module.exports = async ({ electronPlatformName, appOutDir, packager }) => {
  if (electronPlatformName !== "darwin") return;
  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  // Finder/iCloud metadata on generated files can invalidate code signing.
  execFileSync("xattr", ["-cr", appPath]);
  // ARM64 requires valid signatures after Electron's bundle is renamed.
  // A configured Developer ID can replace this local signature in the next stage.
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath]);
};
