#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "[error] npm is required but was not found in PATH."
  exit 1
fi

TAURI_PID=""
AGENTATION_PID=""

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "[shutdown] stopping dev services..."

  if [ -n "$TAURI_PID" ] && kill -0 "$TAURI_PID" 2>/dev/null; then
    kill "$TAURI_PID" 2>/dev/null || true
    wait "$TAURI_PID" 2>/dev/null || true
  fi

  if [ -n "$AGENTATION_PID" ] && kill -0 "$AGENTATION_PID" 2>/dev/null; then
    kill "$AGENTATION_PID" 2>/dev/null || true
    wait "$AGENTATION_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

echo "[start] Agentation MCP server"
npm run agentation:mcp &
AGENTATION_PID=$!

echo "[start] Tauri dev (frontend + backend)"
if [ "$#" -gt 0 ]; then
  npm run tauri dev -- "$@" &
else
  npm run tauri dev &
fi
TAURI_PID=$!

echo "[ready] frontend + backend + agentation are running"
echo "[hint] press Ctrl+C to stop all services"

EXIT_CODE=0

while :; do
  if ! kill -0 "$TAURI_PID" 2>/dev/null; then
    wait "$TAURI_PID" || EXIT_CODE=$?
    echo "[exit] tauri dev stopped"
    break
  fi

  if ! kill -0 "$AGENTATION_PID" 2>/dev/null; then
    wait "$AGENTATION_PID" || EXIT_CODE=$?
    echo "[exit] agentation MCP stopped"
    break
  fi

  sleep 1
done

cleanup
exit "$EXIT_CODE"
