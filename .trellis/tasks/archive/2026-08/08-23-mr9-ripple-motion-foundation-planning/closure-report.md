# MR9 Ripple Motion Foundation Closure Report

**Status:** PASS — Single-scene 200×200/r16 baseline PASS; evidence-artifact white-flash CLOSED; STOP.

## Stable checkpoint

- Worktree / branch: `D:/Ameow/.cindy-worktrees/mr9-ripple-source-fidelity` / `lab/mr9-ripple-source-fidelity`.
- Product baseline: `motion/compact-mascot-visual` at `2bb9a221708c211bdec8721e02d0e469de44ef89`.
- Work commit: `818057f664c7474ec1722b143fcc84dcf3ec67e9` (`feat(lab): checkpoint Ripple motion foundation`).
- Upstream visual kernel: `m1ckc3s/ripple` `99ee6e4412bcab34bcb4337f5f21845ae87c12d5`; normalized vertex / fragment digests remain `d5732e0bee6c81cef132f12d9778652d06ce47b16c3f962d8e68a7e21a08d579` / `09d02c4b0c0e7c36533982adaeba851b71b359ab4d22c1fea96f9b3f359ca3fa`.
- MIT/Mick Cesanek attribution, original-path modification header, and Minsang inspiration credit remain in the candidate source.

## Evidence-only white-frame repair

The original frame-0 VP8 white pre-roll is retained in `white-flash-verification/` as historical diagnosis. The final evidence files were deterministically re-encoded with FFmpeg 8.1 after dropping decoded frame zero only:

```text
ffmpeg -i <input> -vf "select=gte(n\\,1),setpts=N/(25*TB)" -fps_mode cfr -r 25 \
  -an -c:v libvpx -lossless 1 -b:v 0 -deadline good -cpu-used 0 -threads 1 \
  -row-mt 0 -pix_fmt yuv420p <output>
```

This leaves the live Lab implementation untouched and shortens each review asset by one 25-fps frame (40 ms).

| Evidence | SHA-256 | frames | duration | result |
| --- | --- | ---: | ---: | --- |
| `single-scene-center-full-duration.webm` | `1820ac97dac4e93ab8d04e50e9f5d4bf85dbf0cc68399f91906ae2438039b0a4` | 81 | 3.240 s | first frame normal; no anomaly |
| `single-scene-off-center-full-duration.webm` | `8de3d068f52f97bda16603ab700401b4379b5cb9d8fd917f5892edda77490e95` | 83 | 3.320 s | first frame normal; no anomaly |

The repaired review page embeds byte-identical copies of both files, retains four PNG data URIs, contains two `data:video/webm;base64` URIs, and has zero external `src`/`href` dependencies.

## Final verification

- Every repaired WebM frame was decoded and measured; timestamps are strictly monotonic. The center first frame has `meanY=.099277`, `bright90=.000225`, `bright98=0`; off-center has `meanY=.165719`, `bright90=.052250`, `bright98=.037900`. Neither file has a declared anomaly frame.
- Chromium/Edge startup and loop replay sampled both videos through their actual `<video>` elements (including a timestamp wrap for each). No white/bright playback transient or declared anomaly was observed.
- The live Browser Lab remained unchanged: center and off-center runtime probes report zero anomalies, and the implementation-only diff is absent from the evidence repair.
- Tight decoded-first-frame and playback sheets, plus full machine JSON/CSV, are in `white-flash-closure-verification/`.
- Focused Ripple tests, `rendererReuse`, type-check, lint, `build:renderer`, `git diff --check`, source digest/provenance checks, WebGL lifecycle probes, review-page self-containment, and Production artifact/import scans are recorded as final quality-gate evidence.

## Evidence paths

- Repaired review: `D:/Ameow/.cindy-worktrees/mr9-ripple-source-fidelity/evidence/mr9-ripple/single-scene-review.html`
- Motion assets: `single-scene-center-full-duration.webm`, `single-scene-off-center-full-duration.webm`
- Compact phase sheet: `single-scene-contact-sheet.png`
- Repair verification: `white-flash-closure-verification/input-hashes-and-facts.json`, `webm-frame-metrics.json`, `white-flash-summary.json`, `original-center-top-sheet.png`, `original-off-center-top-sheet.png`, `video-0-top-sheet.png`, `video-1-top-sheet.png`

## Retained risks and next-stage boundary

This is a Browser Lab feasibility checkpoint only. The static still does not establish a live Product scene-source contract. macOS and cross-GPU behavior remain unverified. Color, Hot Edge, Production integration, Electron snapshot latency, and first-FX-frame research are explicitly unopened. No code-spec update is needed: the repair changes only encoded review artifacts and task-local verification tooling, not a reusable Product contract.

**STOP — keep this branch/worktree as the clean stable checkpoint; do not merge or start a next stage.**
