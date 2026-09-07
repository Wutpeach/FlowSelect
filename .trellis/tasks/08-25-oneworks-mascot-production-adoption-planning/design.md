# OneWorks Mascot Production Adoption Design

## Decision

Route A remains the recommended architecture. `@oneworks/avatar-react@1.0.0-rc.9` supplies renderer-only JavaScript and CSS exports, and its isolated consumer bundle excludes Editor runtime, persistence, `localStorage`, authoring locales, and editor CSS.

On 2026-09-07, Product/Lead explicitly accepted the remaining inert `avatar-controls__entity-preset-icon` string in the emitted JavaScript and dead saved-preset helpers in the installed shared renderer artifact. Gate A is unblocked for an exact rc.9 pin. This narrow exception does not permit executable Editor/persistence behavior, authoring controls, additional editor selectors, or Lab state in production and does not pivot to Route B/C.

## Evidence Summary

- Current production has one source-specific Compact host, one definition, one local rAF behavior runtime, and one pure pointer-attention recipe under `src/presentation/main-window/`.
- `MainWindowPresentationSurface.tsx` is the sole production Pointer Field writer and mounts the mascot only for Compact presence. Lifecycle, native interaction, Compact/Full transition, and visibility facts stay outside the mascot renderer.
- The archived candidate is deterministic definition data: `ameow-oneworks-cat-2026-08-25-v1`, schema `1`, checksum `fnv1a32:eb514f72`, registry `1.0.0-rc.6`, source revision `3ad2542ea4487e95884f313b84943df602c0e742`.
- Lab evidence proves direct OneWorks rendering, conservative pointer pose, action meanings, Reduced Motion settlement, and teardown in a browser graph.
- React rc.9 publishes `./renderer` and `./renderer.css`. An isolated exact-version Vite consumer emits 305,819 B JS / 86,649 B gzip and 1,682 B CSS / 580 B gzip with no Editor component, persistence key, `localStorage`, authoring locale, or editor CSS payload; only the accepted inert selector string remains.
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

- exact `@oneworks/avatar@1.0.0-rc.9` runtime dependency for types, parsing, serialization, and pure clip/frame helpers;
- exact `@oneworks/avatar-react@1.0.0-rc.9/renderer` plus `renderer.css` imports;
- no `AvatarEditor`, executable editor persistence, editor controls, authoring locales, Lab code, or Lab state in source or emitted production assets;
- a scan allowlist containing only `avatar-controls__entity-preset-icon`; any other editor-named selector or any persistence/localStorage code in the emitted consumer graph fails the gate.

The prior `@oneworks/avatar-react@1.0.0-rc.6` root entry did not meet this boundary. The rc.9 renderer subpaths and the explicit narrow residue decision supersede that blocker.

Recorded Gate A evidence:

- published renderer-only runtime and CSS subpaths are present in the immutable rc.9 tarball;
- the isolated consumer bundle has zero editor component, editor UI string, persistence-key, `localStorage`, authoring-locale, and editor CSS matches, subject only to the accepted selector allowlist;
- rc.9 package hashes, MIT license, exact core dependency, peer range, and consumer sizes are recorded in the dated research report;
- the existing pinned-mechanism equivalence check must be repeated against rc.9 before the production rewire.

## Diamond Retirement and Rollback

- The stable seam is the `CompactMascot` prop contract plus the existing Surface mount. Replace only the renderer internals and Compact-local pure leaves.
- No production feature flag, runtime switch, dual mount, or dual definition selector is allowed.
- A feature branch may retain old unreferenced files until the replacement gates pass, but the completed implementation must delete the diamond definition/runtime/tests that pin it and remove `@bible-strong/avatar-core`.
- Update `.trellis/spec/frontend/character-motion.md` in the implementation because it currently pins Kirby, diamond ears, and avatar-core.
- Rewrite, rather than remove, architecture/surface tests so they continue pinning the single pointer writer, no Product/lifecycle/native imports, one rAF, cleanup, and Reduced Motion.
- Rollback is a git revert of the adoption commits. There is no user-data migration or persistent format. The last safe rollback point is the verified OneWorks rewire commit before diamond deletion; final rollback restores the old dependency and files together.

## Compatibility and Risk Classification

### Resolved entry gate

- Gate A is unblocked for exact rc.9 renderer subpath imports under the explicit two-residue exception. Any broader Editor or persistence payload remains a blocker.

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
