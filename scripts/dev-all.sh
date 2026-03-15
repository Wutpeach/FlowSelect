#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "[error] npm is required but was not found in PATH."
  exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "[error] lsof is required but was not found in PATH."
  exit 1
fi

FRONTEND_PORT="${FLOWSELECT_FRONTEND_PORT:-1420}"

TAURI_PID=""

port_listeners() {
  port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true
}

wait_for_port_free() {
  port="$1"
  max_checks="${2:-25}"
  checks=0

  while [ "$checks" -lt "$max_checks" ]; do
    if [ -z "$(port_listeners "$port")" ]; then
      return 0
    fi
    checks=$((checks + 1))
    sleep 0.2
  done

  echo "[error] port $port is still in use."
  return 1
}

kill_pid_tree() {
  pid="$1"
  [ -z "$pid" ] && return 0

  if kill -0 "$pid" 2>/dev/null; then
    if command -v pkill >/dev/null 2>&1; then
      pkill -TERM -P "$pid" 2>/dev/null || true
    fi
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}

ensure_port_available() {
  port="$1"
  owner_hint="$2"

  pids=$(port_listeners "$port")
  [ -z "$pids" ] && return 0

  for pid in $pids; do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
    case "$cmd" in
      *"$owner_hint"*)
        echo "[cleanup] reclaiming port $port from PID $pid"
        kill "$pid" 2>/dev/null || true
        ;;
      *)
        echo "[error] port $port is occupied by an unrelated process:"
        echo "        PID $pid: $cmd"
        echo "        stop it manually or set another port."
        return 1
        ;;
    esac
  done

  wait_for_port_free "$port"
}

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "[shutdown] stopping dev services..."

  kill_pid_tree "$TAURI_PID"

  # Best effort: reclaim common dev ports from stale processes after fast Ctrl+C.
  ensure_port_available "$FRONTEND_PORT" "vite" || true
}

trap cleanup INT TERM EXIT

ensure_port_available "$FRONTEND_PORT" "vite"

echo "[start] Tauri dev (frontend + backend)"
if [ "$#" -gt 0 ]; then
  npm run tauri dev -- "$@" &
else
  npm run tauri dev &
fi
TAURI_PID=$!

echo "[ready] frontend + backend are running"
echo "[hint] press Ctrl+C to stop all services"

EXIT_CODE=0

while :; do
  if ! kill -0 "$TAURI_PID" 2>/dev/null; then
    wait "$TAURI_PID" || EXIT_CODE=$?
    echo "[exit] tauri dev stopped"
    break
  fi

  sleep 1
done

cleanup
exit "$EXIT_CODE"
