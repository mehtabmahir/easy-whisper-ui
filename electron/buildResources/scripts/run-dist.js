#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) {
    console.error(`[dist] Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

function hasCommand(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
  return result.status === 0;
}

if (process.platform === "linux") {
  const hasRpmBuild = hasCommand("rpmbuild");
  if (!hasRpmBuild) {
    console.warn("[dist] rpmbuild not found; building AppImage and deb only.");
    run("npx", ["electron-builder", "--linux", "AppImage", "deb"]);
  }
}

run("npx", ["electron-builder"]);
