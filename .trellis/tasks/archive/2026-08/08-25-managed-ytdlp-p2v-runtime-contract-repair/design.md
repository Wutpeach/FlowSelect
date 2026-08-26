# P2-V Runtime Contract Repair Design

## Boundary

Preserve `AmeowElectronDownloadRuntime`, `DownloadJobService`, `DownloadOrchestrator`, engine adapters, and the existing process runner as execution authority. Repair only the runtime inputs and lifecycle protection they already consume.

Do not add candidate or selection abstractions. The repair establishes the deterministic current-runtime contract that P2-A may later wrap in a bundled-baseline identity.

## Authoritative runtime set

For each target, resolution returns one complete set:

```text
yt-dlp  = <userData>/runtimes/yt-dlp/<target>/venv/<platform-entrypoint>
python  = <application resources>/python-<target>/<platform-entrypoint>
ffmpeg  = <userData>/runtimes/ffmpeg/<target>/real/<platform-entrypoint>
ffprobe = <userData>/runtimes/ffmpeg/<target>/real/<platform-entrypoint>
deno    = <userData>/runtimes/deno/<target>/real/<platform-entrypoint>
```

Windows has no root proxy-front binaries. Pure Diagnostics inspection, readiness, bootstrap/repair, command construction, and packaged verification use the same resolver-owned paths.

## yt-dlp execution policy

- Pass the FFmpeg `real/` directory through `--ffmpeg-location` and the existing bounded PATH prepend.
- Pass exactly one JS runtime binding: managed Deno with its absolute path. Do not pass bare `deno` or `node`.
- Remove `ejs:github`; the managed Python package set installs an exact `yt-dlp-ejs` version alongside yt-dlp.
- Disable user plugin directories with yt-dlp's supported command policy.
- Keep `--ignore-config` and no self-update behavior.

The repair may still use the existing managed bootstrap network install. Offline packaged wheels and immutable baseline materialization belong to P2-A.

## Lifecycle invariant

Use one target-scoped coordinator in the existing Electron runtime boundary:

1. Mutating bootstrap/repair operations take the exclusive mutation side.
2. Resolve/validate/acquire for a runtime consumer is atomic with respect to mutation.
3. Download attempts and every probe/transcode path using the shared tools hold a lease through process-tree settlement.
4. Cancellation releases only after the runner's kill/settlement completes.
5. Mutation while leased returns a typed busy/deferred outcome or waits only within an existing bounded Repair flow; it never partially replaces the set.

Prefer the smallest code that makes all current mutators and consumers participate. Do not build future candidate/refcount/GC infrastructure.

## Packaging contract

The Windows build input must contain the exact bundled Python referenced by the target manifest. Restore it through the repository's approved runtime acquisition/verification flow or another provenance-checked source; update source manifest and verifier together if the current manifest is wrong.

Generated validation packages are evidence, not canonical source assets.

## Compatibility and failure behavior

- Missing or invalid managed Deno/EJS fails the existing runtime gate explicitly; it does not fall back to the machine.
- Missing FFmpeg/FFprobe follows the existing managed bootstrap/repair error path.
- Busy mutation is observable and non-destructive.
- No change to attempt, retry, fallback ladder, cancel, or terminal semantics.
- Diagnostics remains read-only and never ensures or mutates runtime files.

## External gates retained

- Clean installed/portable userData retention if the current Windows environment cannot complete it safely.
- Fresh-quarantined arm64 package, offline baseline child execution, bundled EJS with explicit Deno, and Gatekeeper/quarantine behavior for P2-A release closure.
