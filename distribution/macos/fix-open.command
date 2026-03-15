#!/bin/bash
set -euo pipefail

APP_NAME="FlowSelect.app"
DEFAULT_PATHS=(
  "/Applications/$APP_NAME"
  "$HOME/Applications/$APP_NAME"
)

say() {
  printf '%s\n' "$*"
}

is_interactive() {
  [ -t 0 ] && [ -t 1 ]
}

choose_app_path() {
  for candidate in "${DEFAULT_PATHS[@]}"; do
    if [ -d "$candidate" ]; then
      printf '%s' "$candidate"
      return 0
    fi
  done

  say ""
  say "FlowSelect.app was not found in /Applications or ~/Applications."
  say "Drag FlowSelect.app to Applications first, then run this helper again."
  say "If you installed it somewhere else, choose the app manually."

  local chosen_path=""
  chosen_path="$(osascript <<'APPLESCRIPT'
try
  return POSIX path of (choose application with prompt "Choose FlowSelect.app to repair")
on error
  return ""
end try
APPLESCRIPT
)"

  if [ -n "$chosen_path" ] && [ -d "$chosen_path" ]; then
    printf '%s' "$chosen_path"
    return 0
  fi

  return 1
}

run_repair_command() {
  local app_path="$1"
  shift

  if [ -w "$app_path" ]; then
    "$@" "$app_path"
    return 0
  fi

  sudo "$@" "$app_path"
}

prompt_for_codesign() {
  local app_path="$1"
  local answer=""

  if ! is_interactive; then
    say "Non-interactive terminal detected. Skipping optional local ad-hoc codesign."
    return 0
  fi

  say ""
  say "Optional: apply a local ad-hoc codesign repair on this Mac."
  say "This is not Apple Developer signing or notarization."
  read -r -p "Apply local ad-hoc codesign too? [y/N] " answer

  case "$answer" in
    y|Y|yes|YES)
      run_repair_command "$app_path" codesign --force --deep --sign -
      say "Applied local ad-hoc codesign."
      ;;
    *)
      say "Skipped local ad-hoc codesign."
      ;;
  esac
}

main() {
  say "FlowSelect macOS repair helper"
  say ""
  say "This helper repairs an already installed copy of FlowSelect.app."
  say "It does not copy the app into Applications for you."

  local app_path=""
  if ! app_path="$(choose_app_path)"; then
    say ""
    say "No FlowSelect.app was selected."
    exit 1
  fi

  say ""
  say "Target app:"
  say "  $app_path"
  say ""
  say "Removing com.apple.quarantine..."
  run_repair_command "$app_path" xattr -dr com.apple.quarantine || true
  say "Quarantine cleanup attempted."

  if command -v codesign >/dev/null 2>&1; then
    prompt_for_codesign "$app_path"
  else
    say "codesign is not available on this Mac. Skipping optional local codesign."
  fi

  say ""
  say "Opening FlowSelect.app..."
  open "$app_path"
  say "Done."
}

pause_before_exit() {
  if is_interactive; then
    say ""
    read -r -p "Press Enter to close this window. " _
  fi
}

trap pause_before_exit EXIT

main "$@"
