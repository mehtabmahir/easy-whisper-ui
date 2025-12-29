const { spawn } = require("node:child_process");
const { join } = require("node:path");

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

async function main() {
  if (process.platform !== "darwin") {
    log("Non-macOS platform; skipping whisper.cpp compile.");
    return;
  }

  const script = join(__dirname, "compile-whisper.sh");
  log("Compiling whisper.cpp (Metal) and staging mac binaries...");
  await run("bash", [script]);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message || String(err));
  process.exit(1);
});
