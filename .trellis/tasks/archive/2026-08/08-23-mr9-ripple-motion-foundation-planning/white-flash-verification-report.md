# MR9 Ripple baseline transient white-flash verification

**Date:** 2026-08-24  
**Scope:** read-only verification of the center and representative off-center paths in `D:/Ameow/.cindy-worktrees/mr9-ripple-source-fidelity`. No Ripple implementation, fixture, WebM, review HTML, or production files were changed. The source-fidelity worktree was already dirty before this verification (`HEAD 2bb9a221708c211bdec8721e02d0e469de44ef89`; pre-existing `src/lab/lab-main.tsx`, `src/lab/ripple/`, and `evidence/` changes).

## Anomaly criterion (declared before verdict)

Luminance is Rec.709 `Y = (0.2126R + 0.7152G + 0.0722B) / 255`. A suspect is an isolated transient when either:

1. whole-frame `deltaMean >= 0.20` and suspect `meanY` exceeds both adjacent frames by `>= 0.10`; or
2. `bright90Fraction >= 0.50` or `bright98Fraction >= 0.10`, with the chosen bright fraction at least `0.05` above both adjacent frames.

`deltaMean` is mean absolute luma change; `deltaMaxTile` is the largest 40x40 tile mean change. A sequence-boundary first frame has no preceding neighbor, so it is additionally reported when its absolute bright-area metrics and the following-frame drop identify a pre-roll frame.

## Environment and locked inputs

- Windows Chromium path: Microsoft Edge `151.0.4129.59`, executable `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; headless Chromium user agent; viewport 960x900, device scale 1.
- Node `v22.17.1`; package-local Playwright; Vite Lab URL `http://127.0.0.1:4173`.
- `ffmpeg`/`ffprobe` `8.1-full_build-www.gyan.dev`.
- Review HTML SHA-256: `e75ee7d8363deff9f1228f1ef7f78cfc9b8b24203d80ef29f740b90c6900a994` (372,066 bytes).

| payload | SHA-256 | bytes | ffprobe stream/container facts |
| --- | --- | ---: | --- |
| `evidence/mr9-ripple/single-scene-center-full-duration.webm` | `46c981a6f0b2f7f4ca7924804354f1acc4e64c9a3f780217d3ba52f3ba45b2f8` | 56,846 | VP8, 200x200, `yuv420p`, progressive, 25/25 fps, time base 1/1000, start 0, duration 3.280 s, 82 decoded frames; Matroska/WebM, encoder Lavc61.3.100/libvpx, Lavf61.1.100 |
| `evidence/mr9-ripple/single-scene-off-center-full-duration.webm` | `780e27e411bdc541d65ae52573d87405fc144e69362f87a546b448246af69694` | 58,406 | VP8, 200x200, `yuv420p`, progressive, 25/25 fps, time base 1/1000, start 0, duration 3.360 s, 84 decoded frames; Matroska/WebM, encoder Lavc61.3.100/libvpx, Lavf61.1.100 |

The two inline `data:video/webm;base64` payloads in `evidence/mr9-ripple/single-scene-review.html` were extracted and probed. `video-0` is byte-for-byte equal to the center original (56,846 bytes, same hash); `video-1` is byte-for-byte equal to the off-center original (58,406 bytes, same hash). There is no review-page transcode or altered payload.

## Results

### 1. Live Browser Lab runtime (`lab.html?ripple=scene`)

The actual WebGL canvas was sampled with `requestAnimationFrame`/`gl.readPixels` for the full 1.4 s trigger phase plus setup and settlement, at center `(0.50, 0.50)` and off-center `(0.31, 0.63)`. Center produced 145 samples and off-center 144. Raw phase is trigger elapsed / 1400 ms; easing is the runtime-equivalent `power3Out`; pinch is recorded from the source keyframes.

- No rows meet the declared anomaly criterion.
- Highest active mean Y: center `0.13923` (raw phase `0.1424`, eased `0.3693`); off-center `0.13229` (raw phase `0.1301`, eased `0.3418`).
- `bright90Fraction` never exceeds `0.00025`; `bright98Fraction` is always `0` in the active runtime capture.
- Active frame-to-frame changes are localized/small (apart from the first post-setup delta around `0.11`); no full-frame or large-area bright transient occurs.
- Around phase 0, the initial setup delta is dark fixture initialization, not white. After phase 1 the default WebGL back buffer is not preserved and the runtime does not redraw continuously after settlement (`src/lab/ripple/RippleCanvas.tsx`; see also `evidence/mr9-ripple/single-scene-runtime-facts.json`). The resulting zero `readPixels` settlement samples are a readback artifact, excluded from the visual verdict. Tight compositor crops at pre-start, 0, 30, 120, 300, 600, 1000, 1300, 1450, and 1700 ms show the settled visible canvas (mean Y about `0.11`, no white frame).

**Live-runtime answer:** **No.** The runtime canvas does not generate the suspected full-frame white flash.

### 2. Original WebM decode path

Every frame of both originals was decoded with FFmpeg and measured. The first encoded frame is an all-white VP8 keyframe:

- Center frame 0, `t=0.000 s`: `meanY=p50Y=p95Y=p99Y=maxY=1.000`, `bright90=1.000`, `bright98=1.000`; frame 1 at `0.040 s` drops to mean Y `0.09924` (`deltaMean 0.90076`, bright fractions `0.000225/0`).
- Off-center frame 0, `t=0.000 s`: all Y metrics `1.000`, `bright90=bright98=1.000`; frame 1 at `0.040 s` is mean Y `0.16570`, `bright90=0.052125`, `bright98=0.037975`, `deltaMean 0.83430`; frame 2 then drops to mean Y `0.07108`.

The compact original sheets visibly show `f0 t=0.000 Y=1.000 Y90=1.000` followed by Ripple imagery. Timestamps are monotonic at 40 ms; no duplicate/drop timestamp, alpha stream, or non-progressive/background color-range anomaly was found. The white frame is in the source payload itself.

**Raw-WebM answer:** **Yes, genuine in the encoded evidence files.** It is the first frame at `t=0`, before the Ripple's 1.4 s phase, not a peak-glow/pinch frame.

### 3. Review-page/browser video playback path

Both videos were captured from the actual `<video>` element through a 200x200 canvas during autoplay and loop playback. Attributes are `autoplay=true`, `controls=true`, `loop=true`, `muted=true`, empty poster, `preload=metadata`, `playsInline=true`; `readyState=4`, dimensions 200x200, CSS background `rgb(8, 7, 11)`, opacity 1 and visible.

- Center startup sample (`currentTime≈0.020 s`) is the all-white encoded frame (`meanY≈1`, bright90/98 `1`), followed at `≈0.051 s` by dark Ripple (`deltaMean≈0.897`). At the observed loop boundary (`3.28 s -> ≈0.03 s`) playback resumes with a dark post-zero frame; there is no additional decoder-generated white frame.
- Off-center's first sampled browser frame (`currentTime≈0.021 s`) is the localized bright raw-frame-1-like image (`meanY≈0.172`, bright90 `0.05285`, bright98 `0.03815`), followed by dark Ripple (`deltaMean≈0.097`). The loop boundary (`3.36 s -> ≈0.02 s`) repeats that same post-zero frame. Capture cadence did not land exactly on off-center f0, but the raw f0 remains byte-identical and is available to the browser at t=0.

No white/bright frame appears from CSS background, poster, loading, compositing, or a decoder-only insertion. Playback exposes whatever source frame is selected at the sampled timestamp; center demonstrates the source white frame at startup.

**Playback-only answer:** **No playback-only defect.** The browser can show the source's f0 (and did for center); observed loop/startup differences are timestamp/capture scheduling, not a new frame synthesized by the review page or decoder.

### 4. Exact phase/cause and minimal recommendation

The genuine bright transient is exactly the encoded sequence-boundary frame at `t=0.000 s` (VP8 I-frame), before any live click trigger or raw/eased Ripple phase. The evidence proves an upstream capture/export pre-roll (or equivalent white initialization) was encoded into both WebMs; it does not identify the recorder/export step that produced it.

Minimal repair recommendation: regenerate or trim the first all-white frame from both evidence WebMs, then rerun SHA-256/ffprobe, per-frame metrics, and review playback checks. Do not change the Ripple shader, parameters, fixture, controller, runtime, or review HTML for this verification.

## Evidence index

All paths below are under `D:/Ameow/.trellis/tasks/08-23-mr9-ripple-motion-foundation-planning/white-flash-verification/` unless absolute:

- `input-hashes-and-facts.json` — original/embedded hashes, byte equality, ffprobe facts.
- `webm-frame-metrics.json`, `original-center-frame-metrics.csv`, `original-off-center-frame-metrics.csv` — every decoded raw frame and metrics.
- `embedded-video-0-frame-metrics.csv`, `embedded-video-1-frame-metrics.csv` — extracted embedded copies.
- `live-metrics.json`, `live-compositor-captures.json` — dense WebGL runtime samples and tight 200x200 compositor captures.
- `review-playback-metrics.json`, `video-0-frame-metrics.csv`, `video-1-frame-metrics.csv` — browser video-element samples including loop boundary.
- Compact labelled sheets: `original-center-top-sheet.png`, `original-off-center-top-sheet.png`, `embedded-video-0-top-sheet.png`, `embedded-video-1-top-sheet.png`, `video-0-top-sheet.png`, `video-1-top-sheet.png`, `live-center-compositor-sheet.png`, `live-off-center-compositor-sheet.png`.

Screenshots are tight 200x200 crops or compact labelled sheets; raw measurements remain in JSON/CSV.

**STOP — verification complete. No implementation, evidence, review-page, production, commit, archive, push, or PR action was taken.**

## Closure addendum — 2026-08-24

The diagnosis above remains historical evidence. The approved evidence-only repair dropped the single all-white decoded frame 0 from each final VP8 review asset and losslessly re-encoded the remaining 25-fps decoded sequence. No Ripple implementation, shader, parameter, fixture, controller, live Browser Lab behavior, or Product file changed.

- Center repaired asset: `1820ac97dac4e93ab8d04e50e9f5d4bf85dbf0cc68399f91906ae2438039b0a4`, 81 frames, `3.240 s` (from 82 / `3.280 s`).
- Off-center repaired asset: `8de3d068f52f97bda16603ab700401b4379b5cb9d8fd917f5892edda77490e95`, 83 frames, `3.320 s` (from 84 / `3.360 s`).
- The two `data:video/webm;base64` payloads in `single-scene-review.html` are byte-identical to those repaired files; the page retains four embedded PNGs and no external dependencies.
- Fresh full-frame decode, strict timestamp, Chromium startup, and Chromium loop checks find no declared anomaly or white/bright playback transient. Machine results and tight first-frame/playback sheets are in `white-flash-closure-verification/`.

**Closed:** evidence-artifact white flash. The static Product-scene fixture and platform coverage risks remain unchanged.
