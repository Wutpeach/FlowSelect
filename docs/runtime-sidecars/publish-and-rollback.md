# Runtime Sidecars Publish And Rollback

This document defines how FlowSelect publishes `pinterest-dl` runtime sidecar binaries and keeps a stable manifest URL for clients.

## Publish Workflow

Workflow file: `.github/workflows/publish-runtime-sidecars.yml`

### Trigger Modes

- Push tag: `runtime-sidecars-pinterest-dl-v*`
- Manual dispatch: `workflow_dispatch`

### What The Workflow Publishes

- Sidecar binaries for:
  - `x86_64-pc-windows-msvc`
  - `x86_64-apple-darwin`
  - `aarch64-apple-darwin`
- `runtime-sidecars-manifest.json` generated from `desktop-assets/pinterest-sidecar/lock.json`

### Manifest URLs

- Stable latest URL (always refreshed):
  - `https://github.com/<owner>/<repo>/releases/download/runtime-sidecars-manifest-latest/runtime-sidecars-manifest.json`
- Versioned URL (immutable per release tag):
  - `https://github.com/<owner>/<repo>/releases/download/<runtime-sidecars-tag>/runtime-sidecars-manifest.json`

## Failure Gates

Publishing is blocked when any condition fails:

- Any target sidecar build fails
- Any target sidecar smoke test fails
- Asset checksum/size mismatch vs metadata
- Manifest schema validation fails
- `lock.json` misses required version fields

## Rollback Procedure

Use this when a newly published sidecar manifest must be reverted.

1. Find the previous good sidecar release tag (`runtime-sidecars-pinterest-dl-v...`).
2. Re-run `publish-runtime-sidecars.yml` from the commit that produced that known-good release.
3. Set `release_tag` to a new rollback tag (example: `runtime-sidecars-pinterest-dl-v0.1.0-dev-r1`).
4. Confirm the workflow updates `runtime-sidecars-manifest-latest` with the rollback manifest.
5. Verify the stable latest URL returns the rollback manifest content.

## Notes

- `flowselectSidecarVersion` and `upstreamVersion` must always come from `desktop-assets/pinterest-sidecar/lock.json`.
- Rollback is manifest-pointer based; clients fetch latest manifest and naturally follow the rollback target URLs.
