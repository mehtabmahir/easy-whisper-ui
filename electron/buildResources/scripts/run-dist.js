#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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

if (process.platform === "win32") {
  // npx is a .cmd shim on Windows and cannot be spawned with shell: false.
  run(process.execPath, [require.resolve("electron-builder/cli.js"),
    "--win", "nsis", "--x64", "--publish", "never"]);
}

if (process.platform === "linux") {
  const hasRpmBuild = hasCommand("rpmbuild");
  if (!hasRpmBuild) {
    console.warn("[dist] rpmbuild not found; building AppImage and deb only.");
    run("npx", ["electron-builder", "--linux", "AppImage", "deb"]);
  }
}

if (process.platform === "darwin") {
  // Cloud-synced checkout folders can reattach FinderInfo even after xattr cleanup.
  // Build/sign the app and DMG locally, then copy only finished release artifacts.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "easy-whisper-mac-dist-"));
  const result = spawnSync("npx", ["electron-builder", "--mac", "dmg", "--arm64", "--publish", "never",
    `-c.directories.output=${staging}`], { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) {
    console.error(`[dist] Packaging failed; diagnostic files remain in ${staging}`);
    process.exit(result.status ?? 1);
  }
  const output = path.resolve(__dirname, "../../../build/electron-dist");
  fs.mkdirSync(output, { recursive: true });
  for (const entry of fs.readdirSync(staging, { withFileTypes: true })) {
    if (entry.isFile()) fs.copyFileSync(path.join(staging, entry.name), path.join(output, entry.name));
  }
  fs.rmSync(staging, { recursive: true, force: true });
  console.log(`[dist] macOS release artifacts ready in ${output}`);
  process.exit(0);
}

run("npx", ["electron-builder"]);
