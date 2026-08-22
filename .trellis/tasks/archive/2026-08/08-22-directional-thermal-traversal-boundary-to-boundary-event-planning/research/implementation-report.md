# MR9 Localized Boundary Interaction Response — Implementation Report

Date: 2026-08-22  
Worktree: `D:\Ameow\.cindy-worktrees\mr9-fullscreen-activation-fx`  
Baseline: `motion/mr9-fullscreen-activation-fx` at `4db7722`

Status: **single Browser Lab falsification spike complete; no configured falsification gate
observed. This is not an Architecture PASS. Candidate is frozen for GPT Architecture Lead
Implementation Architecture Review.**

No commit, archive, Production Integration, traversal/Entry/Exit work, timing redesign, or native
resize was performed.

## Implementation

The rejected absolute `E × boundaryBand` candidate was not reused. Its source/test diff remains
preserved at:

`08-22-unified-thermal-energy-panel-boundary-response/research/unified/rejected-unified-source-test.diff`

The spike starts from the restored accepted Thermal + Refraction checkpoint and makes one
Lab-gated addition:

1. The accepted frontier distance, `warm`, boundary band, and contact equations are factored into
   shared shader helpers. Existing inward `capture = contact * 0.6`, color/material projection,
   2D interior topology, Refraction direction/strength/envelope/resample, lifecycle `energy`, and
   production activation grammar retain their accepted constants and roles.
2. Exterior pixels project to the nearest point on the exact 200×200/r16 rounded SDF using an
   analytic normal. The normal is geometry only. The boundary-foot sample consumes the same
   accepted `heatmapFrontierWarm` and `heatmapBoundaryContact` helpers; there is no second contact,
   topology, clock, phase, noise, palette, mask, or animation state.
3. Halo response is `accepted boundary contact × accepted lifecycle energy × compact falloff`.
   Support ends at `0.06` panel units = 12 CSS px. Alpha is `response × 0.28`, with no floor. Color
   uses the existing `HEAT_STOP[7]` ramp.
4. The Lab-only outer composition is exactly 228×228, with the production 200×200/r16 shell at
   `(14,14)`, one production CSS shadow owner below the FX canvas, and a transparent clipped UI
   interaction layer above it. The canvas remains `pointer-events:none`; the clip is
   `pointer-events:auto` and does not require descendant opt-in.
5. Two Lab presets expose the moving and Reduced Motion variants. Production callers do not set
   `boundaryHalo`; `expandedPresentationRuntime.ts` is unchanged.

No texture, framebuffer, preprocessing pass, second renderer/canvas/program/draw, Paper shader,
Paper palette, processed silhouette, traversal carrier, or scheduler was added.

## Actual-component hard gate

The Windows evidence runner installs WebGL2 prototype counters before the real Lab page mounts,
then operates the actual `ExpandedPresentationSurface`. It does not compile a copied shader.

- Fragment and vertex compile: 4/4 successful across React StrictMode's install/dispose/reinstall.
- Program links: 2/2 successful; empty shader/program logs.
- Live authority after StrictMode settles: 1 program, 1 DOM canvas.
- StrictMode lifecycle: 2 lifetime program creates, 1 delete, 1 live program.
- Textures: 0. Framebuffers: 0.
- The renderer source still contains exactly one `gl.drawArrays` call; each runtime render is one
  draw.
- Page exceptions: none. The recorded browser console messages are the favicon 404 and existing
  browser warnings for shared Electron/style properties, not shader or runtime failures.

## Visual and measurement result

Direct review of the compact composite sheet and channel sheet supports the hypothesis:

- `boundaryBand` is a geometric full boundary band, but the consumed `contact` and resulting
  `halo` remain visibly localized at only the points where the accepted warm frontier reaches the
  real rounded boundary.
- Across six moving observations, contact-lit perimeter fraction ranges from 0 to 0.12; maximum
  single-side fraction is 0.28. Reduced Motion is 0.13 perimeter / 0.308 maximum side. No state
  approaches the configured 0.35 near-complete-perimeter stop threshold, and no continuous outline
  is visible.
- Halo maximum alpha is 19/255 while interior reaches 255/255. It is subordinate, attached to the
  localized contact, and disappears when contact disappears.
- The final 2px on all four sides have max alpha 0 in every captured state. All four outer corners
  are alpha 0. No clipped outer-edge response was observed.
- The accepted 200px Reduced Motion view and the 228px panel-mapped view have identical visible
  alpha. RGB differences are limited to 6/255 from the pre-existing per-canvas pixel grain being
  sampled through the 228→200 mapping; no topology, material, coverage, or Refraction structure
  changes. Mode-off keeps the exact accepted equations and allocates no resource.
- Visual review shows the existing Thermal/Refraction material unchanged inside the panel; the
  new response reads as a faint local boundary leakage, not a detached decoration or inset/second
  silhouette.

## Geometry, layering, interaction, shadow

Real DOM measurements:

- outer frame: 228×228;
- panel clip: x=14, y=14, 200×200, radius 16;
- center hit: `panel-clip`; gutter hit: outer `frame`;
- click at panel-local `(40,70)` maps the marker to approximately `(39.73,69.25)` CSS px;
- clip: `pointer-events:auto`, `overflow:hidden`, no background, no shadow;
- FX canvas: `pointer-events:none`;
- shadow owners: exactly 1, on the real panel shell;
- FX on/off captures show the same shell and CSS shadow; hiding only the canvas leaves the shell,
  clip, and interaction layer intact.

The native-alpha canvas captures verify transparent gutter/corner output on Windows. macOS is
**NOT VERIFIED** because no macOS runtime host is available.

## Reduced Motion and fallback

- Reduced Motion draw count stayed 11 → 11 over 500ms: zero continuing frames.
- Runtime source is unchanged.
- Boundary mode is Lab-only and default-off. When off, the panel mapping/halo branch is inert, the
  accepted 200px surface remains active, and resource allocation remains one program / zero
  texture / zero framebuffer.

## Evidence

All evidence is under `research/localized-boundary/`:

- `review-sheet.png` / `review-sheet.html` — compact landscape A/B and six observed states; no
  tall full-page capture or large blank page region;
- `channel-sheet.png` / `channel-sheet.html` — warm, boundaryBand, accepted contact, and halo at
  the same Reduced Motion phase;
- `measurements.json` — actual compile/link/resource counters, per-state contact fractions, alpha,
  geometry, hit testing, shadow ownership, RM frame counts, and equivalence measurements;
- `*-canvas.png` — exact 228×228 native-alpha WebGL readbacks captured immediately after the real
  component's draw;
- `*-composite.png`, `fx-on-shadow.png`, `fx-off-shadow.png` — exact element-sized composites;
- `capture-localized-boundary.mjs` — reproducible actual-component instrumentation and compact
  evidence generation.

The scalar channel images are explicitly auxiliary analytic views of the accepted equations at
the actual captured uniform state. Compile/link and final pixels come from the real component.

## Validation

- Focused Vitest: **73/73 PASS** across surface, Lab scenarios/reuse, and runtime.
- `npm run type-check`: **PASS**.
- `npm run lint -- --quiet`: **PASS**.
- `git diff --check`: **PASS** (repository reports existing LF→CRLF conversion warnings only).
- Trellis context validation: **PASS** (`implement.jsonl` 5 entries, `check.jsonl` 4 entries).
- Full Vitest: **1775/1776 PASS**. The sole failure is the known unrelated baseline at
  `browser-extension/architecture-guard.test.js:277`.

## Falsification decision

None of the immediate-stop conditions fired: no near-complete perimeter, detached/independent
halo, duplicate contact/energy authority, nonzero outer edge, Interior/Refraction structural
drift, actual shader compile/link failure, new graphics/runtime authority, or layer/interaction/
shadow/Reduced Motion regression was observed.

The implementation and evidence are frozen here. Await GPT Architecture Lead Implementation
Architecture Review; do not infer Production Integration approval from this report.

## Execution channels

- **Orca Worker (`developer-2`)**: blocked/abnormal termination; no implementation or validation.
- **Cindy Lead (Windows host)**: baseline restore, implementation, actual-component Browser Lab
  evidence, visual inspection, validation, and this report.
