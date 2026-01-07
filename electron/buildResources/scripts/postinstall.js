const { spawn } = require("node:child_process");
const { join } = require("node:path");
const { existsSync } = require("node:fs");

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`==> ${msg}`);
}

async function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...opts });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function checkLinuxBuildDeps() {
  const deps = ["cmake", "ninja", "gcc", "g++"];
  for (const dep of deps) {
    try {
      await run("which", [dep], { stdio: "ignore" });
    } catch {
      return false;
    }
  }
  return true;
}

async function main() {
  if (process.platform === "darwin") {
    const script = join(__dirname, "compile-whisper.sh");
    log("Compiling whisper.cpp (Metal) and staging mac binaries...");
    await run("bash", [script]);
  } else if (process.platform === "linux") {
    const hasDeps = await checkLinuxBuildDeps();
    if (!hasDeps) {
      log("Linux build dependencies missing; skipping whisper.cpp compile.");
      log("To build Linux binaries manually, install:");
      log("  Ubuntu/Debian: sudo apt-get install cmake ninja-build gcc g++ libsdl2-dev");
      log("  Fedora/RHEL: sudo dnf install cmake ninja-build gcc gcc-c++ SDL2-devel");
      log("  Arch: sudo pacman -S cmake ninja gcc sdl2");
      log("Then run: cd electron/buildResources/scripts && bash compile-whisper-linux.sh");
      return;
    }
    const script = join(__dirname, "compile-whisper-linux.sh");
    log("Compiling whisper.cpp and staging linux binaries...");
    await run("bash", [script]);
  } else {
    log("Non-Unix platform; skipping whisper.cpp compile.");
    return;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message || String(err));
  process.exit(1);
});
