#!/usr/bin/env bash
set -euo pipefail

if [[ "${OSTYPE:-}" != linux* ]]; then
  echo "This script is intended for Linux only."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Only apt-based distributions are supported by this script right now."
  exit 1
fi

MODE="remove"
if [[ "${1:-}" == "--purge" ]]; then
  MODE="purge"
fi

PACKAGES=(
  git
  ffmpeg
  libvulkan-dev
  vulkan-tools
  glslc
  shaderc
  glslang-tools
  build-essential
  cmake
  ninja-build
  pkg-config
  curl
  libsdl2-dev
  rpm
)

echo "[reset] Preparing to ${MODE} test dependencies installed for EasyWhisperUI Linux bootstrap/testing."
echo "[reset] Package candidates: ${PACKAGES[*]}"

echo "[reset] Updating apt package index..."
sudo apt-get update

INSTALLED=()
for pkg in "${PACKAGES[@]}"; do
  if dpkg-query -W -f='${Status}\n' "$pkg" 2>/dev/null | grep -q "install ok installed"; then
    INSTALLED+=("$pkg")
  fi
done

if [[ ${#INSTALLED[@]} -eq 0 ]]; then
  echo "[reset] None of the target packages are currently installed. Skipping package removal."
else
  echo "[reset] Installed packages to ${MODE}: ${INSTALLED[*]}"

  if [[ "$MODE" == "purge" ]]; then
    sudo apt-get purge -y "${INSTALLED[@]}"
  else
    sudo apt-get remove -y "${INSTALLED[@]}"
  fi

  echo "[reset] Running autoremove to clean unneeded dependencies..."
  sudo apt-get autoremove -y
fi

WORKSPACE_CANDIDATES=(
  "$HOME/.config/Electron/whisper-workspace"
  "$HOME/.config/easy-whisper-electron/whisper-workspace"
)

for workspace in "${WORKSPACE_CANDIDATES[@]}"; do
  if [[ -d "$workspace" ]]; then
    echo "[reset] Removing cached workspace: $workspace"
    rm -rf "$workspace"
  fi
done

echo "[reset] Done."
