# OneWorks Mascot Production Adoption Design

## Decision

Route A remains the recommended architecture. It is mechanism-compatible, but the current published React artifact is not ready for implementation under the fixed requirement that Editor and authoring controls stay out of production.

Implementation may begin only after one of these conditions is evidenced:

1. Upstream publishes a renderer-only entry/package, including renderer-only CSS, at a pin that Ameow can lock and audit; or
2. the user explicitly changes the byte-level Editor exclusion and accepts the measured inert editor payload.

This plan does not authorize condition 2 implicitly and does not pivot to Route B/C.

## Evidence Summary

- Current production has one source-specific Compact host, one definition, one local rAF behavior runtime, and one pure pointer-attention recipe under `src/presentation/main-window/`.
- `MainWindowPresentationSurface.tsx` is the sole production Pointer Field writer and mounts the mascot only for Compact presence. Lifecycle, native interaction, Compact/Full transition, and visibility facts stay outside the mascot renderer.
- The archived candidate is deterministic definition data: `ameow-oneworks-cat-2026-08-25-v1`, schema `1`, checksum `fnv1a32:eb514f72`, registry `1.0.0-rc.6`, source revision `3ad2542ea4487e95884f313b84943df602c0e742`.
- Lab evidence proves direct OneWorks rendering, conservative pointer pose, action meanings, Reduced Motion settlement, and teardown in a browser graph.
- The installed React package publishes one 318,589-byte `dist/index.js` and one 65,529-byte `dist/style.css`; an Avatar-only bundle still retains editor code. Worker measurement attributes about 219 KB minified JS and 64.9 KB CSS increment to the current direct import path.
- Production uses Vite `base: "./"` and Electron loads `dist/index.html` through `file://`; OneWorks CSS has no external `url()` assets. This makes packaged loading plausible but not yet verified.

## Authority and Dependency Model

```text
App reduced-motion fact + lifecycle/native authority
                    |
                    v
MainWindowPresentationSurface
  - sole Pointer Field writer
  - Compact presence and shell choreography
  - no renderer mechanics
                    |
                    v
CompactMascot host
  - reads pointer values
  - owns one local rAF clock, visibility pause/resume, static Reduced Motion, dispose
                    |
          +---------+----------+
          |                    |
          v                    v
pure attention -> pose     pure action/frame composer
          |                    |
          +---------+----------+
                    v
production canonical definition
                    |
                    v
@oneworks/avatar pure helpers + renderer-only React entry
  - controlled definition
  - interactive=false
  - upstream playback/autoplay disabled
  - no write-back callbacks
```

### Ownership table

| Concern | Sole owner after adoption | OneWorks responsibility |
| --- | --- | --- |
| Product and Presentation phase | existing Ameow reducers/adapters | none |
| Native visibility and interaction mode | existing effect executor/Electron bridge | none |
| Pointer input truth | `pointerField.ts` written by `MainWindowPresentationSurface.tsx` | none |
| Pointer-to-attention policy | existing `compactMascotRecipe.ts` | none |
| Attention-to-head-pose projection | new pure Compact-local adapter | consumes the resulting definition only |
| Quiet deadline/action selection | one Ameow Compact-local rAF runtime | pure clip/frame mechanics only |
| Rendering | controlled OneWorks renderer | SVG/geometry/depth/masking |
| Canonical visual definition | one production definition module | parses/renders the value |
| Mount, hidden/visible, Reduced Motion, dispose | `CompactMascot` host | must stop when the host stops feeding frames/unmounts |

## Canonical Candidate Promotion

- Promote the archived JSON verbatim into a typed production definition module under `src/presentation/main-window/`.
- The module records candidate id, schema, checksum, registry version, and source revision, validates through public OneWorks parsing, and exports the only production definition constant.
- The archive remains immutable provenance and must never be imported at runtime; `.trellis/` is not a packaged application layer.
- `src/lab/oneworksAmeowCandidate.ts` must stop constructing an independently maintained candidate. Lab imports/re-exports the production definition and keeps only Lab preview/control glue.
- A checksum test compares stable serialization to `fnv1a32:eb514f72`; a changed definition requires a new candidate identity and a new visual Gate.
- Actions are separate production behavior data. Promote the approved `surprised`, `curious-short`, and `playful-short` public clips into one production-owned action library rather than adding them to the visual-definition JSON.

## Pointer, Pose, Actions, and Reduced Motion

### Pointer and pose

1. Keep the existing pointer writers and reset paths unchanged.
2. Reuse `resolveCompactMascotAttention` for dead zone, response radius, and bounded normalized attention.
3. Add one pure projection from attention to candidate `scene.view` pose. The normal envelope is the already reviewed conservative Lab envelope: yaw `±0.28 rad`, pitch `±0.16 rad`.
4. The renderer never listens to pointer events and never calls `onDefinitionChange`; `interactive` stays false.

### Actions

- Keep one Ameow-owned rAF clock, the existing 18–32 second quiet window, one action at a time, and no immediate repeat.
- Evaluate OneWorks clips with pure `@oneworks/avatar` helpers and compose the frame into the controlled definition.
- Do not call `AvatarHandle.play` or enable `autoplay`: upstream playback would compete with per-frame controlled-definition updates and create a second runtime authority.
- During an action, the action patch wins for fields it owns; pointer pose fills only untouched view fields. Pointer input never starts, cancels, extends, or prioritizes an action.

### Reduced Motion and lifecycle

- Reduced Motion cancels decorative action, deadline, animation rAF, and blink work and renders the deterministic canonical neutral pose.
- It does not create a second reduced-motion scheduler. Normal re-entry starts a fresh baseline/deadline, matching the current Compact contract.
- Hidden pauses exact local progress and cancels rAF; visible resumes; unmount/dispose invalidates stale callbacks; Compact re-entry is a fresh visual session.
- Native visibility, window interaction, Compact/Full state, settle epochs, and shell motion stay unchanged and outside OneWorks.

## Production Host and Size Boundary

- Keep the existing 60 px Compact shell and 56 px holder unchanged.
- Do not carry the old renderer-specific `0.95` scale into OneWorks by assumption. Start with the OneWorks box filling the existing 56 px holder and verify it against the approved 60 px specimen plus a magnified capture.
- No candidate-definition tuning is allowed. If the fixed candidate cannot pass at the exact production holder size, stop at the visual integration gate and return for a separate product decision.
- Use the candidate's fixed dark presentation/theme mapping; do not connect upstream theme state to Product or App theme authority.

## Dependency Boundary and Route A Blocker

The acceptable production boundary is:

- exact `@oneworks/avatar` runtime dependency for types, parsing, serialization, and pure clip/frame helpers;
- exact upstream renderer-only React dependency/entry for `Avatar` plus renderer-only CSS;
- no `AvatarEditor`, editor persistence, editor controls, authoring locales, Lab code, or Lab state in source or emitted production assets.

The current `@oneworks/avatar-react@1.0.0-rc.6` root entry does not meet this boundary. Its only shipped runtime module contains both `Avatar` and `AvatarEditor`, and its only CSS contains renderer and editor rules. Source-level non-use is insufficient for the stated production constraint.

Required unblock evidence:

- a published export/package whose installed files actually contain a renderer-only runtime and CSS path;
- an Avatar-only production bundle scan with zero editor component, editor UI string, persistence-key, authoring-locale, and editor-selector matches;
- exact-version lock and license metadata;
- a repeat of the existing pinned-mechanism equivalence check for the renderer path.

## Diamond Retirement and Rollback

- The stable seam is the `CompactMascot` prop contract plus the existing Surface mount. Replace only the renderer internals and Compact-local pure leaves.
- No production feature flag, runtime switch, dual mount, or dual definition selector is allowed.
- A feature branch may retain old unreferenced files until the replacement gates pass, but the completed implementation must delete the diamond definition/runtime/tests that pin it and remove `@bible-strong/avatar-core`.
- Update `.trellis/spec/frontend/character-motion.md` in the implementation because it currently pins Kirby, diamond ears, and avatar-core.
- Rewrite, rather than remove, architecture/surface tests so they continue pinning the single pointer writer, no Product/lifecycle/native imports, one rAF, cleanup, and Reduced Motion.
- Rollback is a git revert of the adoption commits. There is no user-data migration or persistent format. The last safe rollback point is the verified OneWorks rewire commit before diamond deletion; final rollback restores the old dependency and files together.

## Compatibility and Risk Classification

### Implementation blocker

- The current published React root entry brings Editor code/CSS into production. Route A implementation is blocked until the renderer-only boundary is available or the user explicitly changes the exclusion.

### Required implementation gates, not current blockers

- packaged Electron `file://` load and console-clean render;
- Windows Compact pointer/native visibility behavior;
- macOS package/runtime behavior on macOS hardware or CI;
- exact production bundle and packaged-size delta after removing avatar-core;
- production-size performance under pointer movement and action playback;
- Node import smoke proving no module-top-level DOM requirement;
- lifecycle instrumentation returning rAF/timeouts/intervals to baseline after Reduced Motion, hidden, and unmount;
- visual comparison at the actual 56 px holder with the fixed candidate.

### Additional risks

- pre-1.0 upstream churn: exact pin and re-review every upgrade;
- CSS custom-property bleed: renderer-only CSS must stay namespaced and be checked in the full app;
- existing avatar-core is AGPL-3.0-only while OneWorks is MIT; notices and dependency removal require explicit cleanup during retirement;
- current dirty `electron/main.mts` can contaminate Electron build results, so packaging evidence must run after the unrelated yt-dlp work settles or in a clean worktree/CI.

## Architecture Invariants

1. Exactly one production Compact renderer and one production candidate definition exist at completion.
2. No OneWorks module writes lifecycle, Product, native, Pointer Field, or Presentation state.
3. Surface remains the sole pointer writer; pose is a pure one-way projection.
4. One local rAF runtime owns quiet timing, actions, pause/resume, Reduced Motion, and stale callback invalidation.
5. Upstream interactive handlers and playback remain disabled in production.
6. No per-frame React state, timer queue, high-frequency IPC, BrowserWindow motion, or shared animation framework is introduced.
7. Editor, authoring controls/locales/persistence, Lab source, and Lab state are absent from production source and emitted assets.
8. Existing Compact/Full lifecycle, native interaction, shell geometry, and settle-epoch authority remain unchanged.
9. The fixed candidate checksum does not change in this adoption.
10. Diamond code and avatar-core are removed before implementation completion; rollback remains commit-level, not runtime dual authority.
