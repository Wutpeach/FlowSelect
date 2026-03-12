#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="${1:-/tmp/workspace}"

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GH_TOKEN is required to publish GitHub releases."
  exit 1
fi

if [[ -z "${CIRCLE_TAG:-}" || "${CIRCLE_TAG}" != v* ]]; then
  echo "CIRCLE_TAG must be set to a tag like v0.2.6. Current: '${CIRCLE_TAG:-}'"
  exit 1
fi

VERSION="${CIRCLE_TAG#v}"
TAG="v${VERSION}"
TITLE="FlowSelect v${VERSION}"
RELEASE_NOTES_PATH="release-notes/v${VERSION}.md"

if [[ ! -f "${RELEASE_NOTES_PATH}" ]]; then
  echo "Missing release notes file: ${RELEASE_NOTES_PATH}"
  echo "Create and commit the versioned release note before pushing the tag."
  exit 1
fi

shopt -s nullglob
ASSETS=(
  "${WORKSPACE_ROOT}/windows/msi/"*.msi
  "${WORKSPACE_ROOT}/windows/nsis/"*.exe
  "${WORKSPACE_ROOT}/windows/portable/"*.zip
  "${WORKSPACE_ROOT}/macos-arm/dmg/"*.dmg
)

if [[ "${#ASSETS[@]}" -eq 0 ]]; then
  echo "No release assets found under ${WORKSPACE_ROOT}"
  exit 1
fi

for asset in "${ASSETS[@]}"; do
  if [[ ! -f "${asset}" ]]; then
    echo "Asset path is not a file: ${asset}"
    exit 1
  fi
done

PRERELEASE_FLAG=()
if [[ "${VERSION}" == *"-"* ]]; then
  PRERELEASE_FLAG+=(--prerelease)
fi

if gh release view "${TAG}" >/dev/null 2>&1; then
  echo "Release ${TAG} already exists. Updating notes/title and uploading assets with --clobber."
  gh release edit "${TAG}" \
    --title "${TITLE}" \
    --notes-file "${RELEASE_NOTES_PATH}"
  gh release upload "${TAG}" "${ASSETS[@]}" --clobber
else
  echo "Creating release ${TAG} with ${#ASSETS[@]} assets."
  gh release create "${TAG}" "${ASSETS[@]}" \
    --verify-tag \
    --title "${TITLE}" \
    --notes-file "${RELEASE_NOTES_PATH}" \
    "${PRERELEASE_FLAG[@]}"
fi
