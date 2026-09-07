# OneWorks Mascot Production Adoption — Repository-Grounded Research

Date: 2026-08-25
Scope: planning/research only. No production code, manifests, configs, tests, or
existing task artifacts were modified. This document is the only artifact of
this task. No Architecture PASS is granted.

Evidence legend:
- **[OBSERVED]** — read directly from repository files / installed packages /
  measured builds on this machine.
- **[INFERRED]** — derived from observed facts with stated reasoning.
- **[MEASURED]** — numbers produced by a build/bundle experiment run during
  this research (temp dir only, repo untouched).
- **[RECOMMENDED]** — proposed design/decision for the Lead/product to adopt
  or reject.

Primary sources:
- Candidate/diamond provenance: `.trellis/tasks/archive/2026-08/08-25-oneworks-ameow-mascot-visual-candidate/`
  (`canonical-candidate.json`, `implementation-report.md`, `calibration-notes.md`)
- Prior Route A Lab spike: `.trellis/tasks/08-25-oneworks-avatar-cat-source-fidelity/`
  (`research/oneworks-cat-source-fidelity.md`, `implementation-report.md`)
- Production Compact renderer: `src/presentation/main-window/{CompactMascot.tsx,compactMascotDefinition.ts,compactMascotBehaviorRuntime.ts,compactMascotRecipe.ts,MainWindowPresentationSurface.tsx}`
- Architecture guards: `src/architecture/import-guard.test.ts`,
  `src/lab/rendererReuse.test.ts`

---

## 0. Verdict summary

**Route A is mechanism-viable and has NO repository evidence of a hard
blocker, but it is not "exact runtime dependency, zero side effects" today:
the published `@oneworks/avatar-react@1.0.0-rc.6` artifact is a single
pre-bundled module that cannot be tree-shaken, so a production `Avatar` import
carries the full `AvatarEditor` (and editor CSS) into the production bundle
(measured ≈ +219 KB min JS / +64.9 KB CSS).** That is the single most
important decision point for the Lead. It is a **blocker-by-decision**, not a
mechanism blocker: Route A remains viable if the product accepts the editor
bytes (documented, inert) or if upstream publishes a renderer-only entry; it
is blocked only if "no editor code in production bundle, byte-level" is a hard
invariant of this project.

The rest of the architecture (presentation authority, Pointer Field,
lifecycle, Reduced Motion, mount/dispose, 60px shell) can stay Ameow-owned
with a thin host/adaptor swap; the canonical candidate is definition-only and
can become the single production definition authority; the current
`avatar-core` diamond renderer can be retired atomically behind that host
contract.

---

## 1. Current production Compact renderer / definition / lifecycle / presentation authority

### 1.1 Compact renderer stack (exactly five production files)

| Layer | File | Role |
| --- | --- | --- |
| Definition | `src/presentation/main-window/compactMascotDefinition.ts` | Pinned Kirby-via-avatar-core definition; the two `diamond` body nodes are the current "cat ears" |
| Pure recipe | `src/presentation/main-window/compactMascotRecipe.ts` | viewBox/scale constants + pointer→eye-offset attention projection (pure) |
| Behavior runtime | `src/presentation/main-window/compactMascotBehaviorRuntime.ts` | avatar-core playback scheduler (idle loop + once actions + quiet timing), frame renderer |
| SVG host | `src/presentation/main-window/CompactMascot.tsx` | renderer-local DOM leaf; owns rAF wiring, document visibility, Reduced Motion, dispose |
| Mount/wiring | `src/presentation/main-window/MainWindowPresentationSurface.tsx` | mounts CompactMascot only in compact mode; owns Pointer Field + icon choreography |

No other production file references the Compact mascot
([OBSERVED] grep: only these 5 production files + their tests + Lab
`src/lab/CompactPreviewStage.tsx`; the only other "avatar" match in `src/`
is an unrelated regex in `src/utils/imageDrag.ts:7`).

### 1.2 Definition authority (current diamond)

- `compactMascotDefinition.ts:1-7` imports `validateAvatarDefinition` / `AvatarDefinition` from `@bible-strong/avatar-core`; `KIRBY_UPSTREAM_REVISION = "175691ab32cefe5faec7828af62f3d50210a8eb2"` (line 4).
- Head: sphere `240×240×240`, roundness 1 (lines 21-23 / `KIRBY_SOURCE_BODY.primary`).
- Ears: two `diamond` surfaces `76×135×78`, positions `[-70,-76,-82]`/`[70,-76,-82]`, mirrored rotations `[0,-5,-10]`/`[0,5,10]` (lines 31-62).
- Colors: body `#ffc2e9`, eyes `#3e4e65` (line 64); animations: `idle` loop + `surprised`/`curious-short`/`playful-short` once clips built from 8 pinned Kirby expressions (lines 66-103).
- Production validation at module load: `validateAvatarDefinition(compactMascotSourceDefinition)` throws on invalid (lines 105-107); `COMPACT_MASCOT_DEFINITION` is the exported constant (line 109).
- [OBSERVED] This is the *current* production authority and equals the frozen approved "diamond-ear" baseline; the ear values were set by the archived repair task (`08-24-compact-mascot-ear-geometry-repair/implementation-report.md`: final values `76×135×78`, `±70/-76/-82`, `[0,∓5,±10]`; only that task's definition + its test changed).

### 1.3 Render path (avatar-core, whole-node binary layering)

- `compactMascotBehaviorRuntime.ts:14-21` imports the full avatar-core playback API (`advanceAvatarPlayback`, `applyAmbientMotion`, `bodyFromDefinition`, `createAvatarPlaybackState`, `pauseAvatarPlayback`, `playAvatarAnimation`, `poseFromExpression`, `renderAvatar`, `resumeAvatarPlayback`, `sampleAvatarFrame`, types).
- `renderCompactMascotScene` (lines 33-51) renders the head (`bodyNodes: []`) and then a second `renderAvatar` with `bodyNodes: BODY.nodes`, then splices `backPaths/backNodeIds/frontPaths/frontNodeIds` into one `AvatarScene`; `BODY` is built once at module scope (line 31).
- `CompactMascot.tsx:7-9` imports `renderAvatarDefinition` for the one-time initial scene (`initialScene`, lines 49-57) and `createCompactMascotBehaviorRuntime` for live frames; `applyScene` (lines 59-81) writes `d`/`fill`/`opacity` attributes into **four fixed ear slots** (`backPaths[0/1]`, `frontPaths[0/1]`) + head path + clip + two eye paths.
- [OBSERVED] `CompactMascot.tsx:70` comment: "These are fixed slots for the two pinned diamond ears, not a body-node renderer." `compactMascotArchitecture.test.ts:10-16` pins `data-compact-mascot="kirby-cat"`, `data-compact-mascot-ear=` × 4, and absence of `@bible-strong/avatar-react`/`<canvas`.
- [OBSERVED] avatar-core geometry classifies each accessory as whole-node front/back by one center depth + projected depth radius (`packages/avatar-core/src/geometry.ts:1155-1234` in the vendored `.cindy-upstream/bible-strong-avatar-lab-175691a`); there is no per-part face mask, so partial ear-root occlusion by the head is impossible — this is the representation gap identified by the Route A research (`.trellis/tasks/08-25-oneworks-avatar-cat-source-fidelity/research/oneworks-cat-source-fidelity.md`, §2).

### 1.4 Pointer Field authority (one writer)

- **One writer:** `pointerField.ts` (pure module: `useMainWindowPointerField` line 56, `updatePointerFieldFromClientPoint` line 91, `resetPointerFieldToCenter` line 111). `import-guard.test.ts` pins: writers of `updatePointerFieldFromClientPoint|resetPointerFieldToCenter` == exactly `["src/presentation/main-window/MainWindowPresentationSurface.tsx"]`, and no module-level mutable state in `pointerField.ts`.
- **Writes** happen only in `MainWindowPresentationSurface.tsx`:
  - pointer move forwarding: `syncPointerFieldFromClientPoint` (lines 380-383);
  - Windows compact-passthrough mousemove (no `mouseleave`): `evaluateCompactHotspot` writes the field *before* hotspot evaluation (lines 725-727; pinned by `compactMascotSurface.test.ts` "keeps the Windows forwarded point write before hotspot evaluation");
  - pointer leave → center (line 611), window blur → center (line 787), `document.hidden` → center (lines 790-791), drop-session end → center (line 854).
- **Native pointer boundary** enters via `desktopCurrentWindow.onPointerBoundaryChanged` (line 680) → `handlePointerFact` (lines 603-616), which also dispatches lifecycle `pointerEnter/pointerLeave`.
- **Semantics:** consumer reads `pointerField.x/y` as read-only props (`CompactMascot.tsx:18-21`); `pointerField.ts` is pure runtime data, no lifecycle/React/native state.

### 1.5 Attention projection (pure leaf)

`compactMascotRecipe.ts`:
- viewBox 300 (line 3), visual size 56px (line 6), render scale `0.95` (line 8 → actual SVG size 53.2px), response radius 46px (line 14), dead zone 3px (line 15), cosine approach/recenter `resolveAttentionIntensity` (lines 32-41), eye bounds normal `X=11/Y=7.5`, reduced `X=6/Y=4` (lines 21-24), `resolveCompactMascotAttention` returns `{x,y}` eye offset (lines 44-75).
- **Production remains eye-only**: the validated candidate Lab explicitly maps the *eye* offset into a Lab-local pose envelope (`src/lab/oneworksAmeowCandidate.ts:55-58` `ONEWORKS_AMEOW_LAB_POSE_ENVELOPE = {maxPitchRadians: 0.16, maxYawRadians: 0.28}`, and `resolveOneWorksAmeowAttentionPreview` lines 300-325; the comment says "This is intentionally not production authority … production remains eye-only" lines 41-46, 292-298).

### 1.6 Lifecycle: mount/dispose, hidden/visible, Compact→Full (motion ownership)

- **Phase machine:** `lifecycle.ts` (`createMainWindowPresentationState` line 38, `reduceMainWindowPresentation` line 256): states `compact`/`expanding`/`full`/`collapsePending`/`collapsing`; writers pinned to `lifecycle.ts` + `reactAdapter.ts` only (`import-guard.test.ts`).
- **Effects:** `effectExecutor.ts:41-70` — `collapseTimer.start/cancel`, `native.prepareCompactReachability` (→ `desktopCurrentWindow.ensureMainWindowCompactReachable`, `App.tsx:380-392`; `presentationDependencies` at `App.tsx:370`), `native.cancelCompactReachability`, `native.setInteraction` (compact-passthrough / interactive), `focus.request`. Native mode switching is lifecycle-owned; the renderer never requests it.
- **Phase→visual:** `projections.ts` (via `resolveMainWindowPresentationProjections`) → `isCompact` (`MainWindowPresentationSurface.tsx:558`). While `isCompact`, the icon subtree is mounted inside `AnimatePresence`; otherwise `null` (lines 1195-1244: `{isCompact ? <motion.div key={\`compact-icon-${settlePulseKey}\`}…> … }`).
- **Remount per settle:** the compact icon subtree is keyed by `settleEpoch` (`compact-icon-${settlePulseKey}` line 1196 and `compact-icon-settle-${settlePulseKey}` line 1215), so **every completed collapse→compact transition remounts `CompactMascot`** ([OBSERVED] keys; settleEpoch increments in `lifecycle.ts` `visualTransitionCompleted`→compact, ~line 330). This means the upstream Avatar will be constructed/remounted on every compact entry — mount cost is a measured gate (§6.4).
- **Icon choreography** (enter/settle/exit, reduced-motion variants): `motionRecipes.ts:99-142` (`icon.animate/exit/settleAnimate/…`), `MAIN_WINDOW_MINIMIZED_ICON_*` constants lines 7-18; shell scale recipes lines 68-97. This stays Ameow-owned and is orthogonal to the renderer.
- **Host-internal visibility:** `CompactMascot.tsx:85-135` — `document.hidden` at mount → `runtime.pause()`; `visibilitychange` → `pause()/start()`; `reducedMotion` → `runtime.renderStatic()` + pointer `on("change")` re-renders a static frame (no rAF loop); unmount → `runtime.dispose()` (plus listener removal). Its `style` uses `overflow: visible`, `pointerEvents: none`, `aria-hidden` (lines 152-164).
- **Reduced Motion source:** `App.tsx:2` imports `useReducedMotion` from `motion/react`; `useReducedMotion()` line 352 → `environment.reducedMotion` (line 387 in deps; line 2715 passed to surface); also used for native reachability (line 388) and shell recipes.
- **Shell sizing:** `MainWindowPresentationSurface.tsx:1236` renders `<CompactMascot size={COMPACT_MASCOT_VISUAL_SIZE * COMPACT_MASCOT_RENDER_SCALE}` = 53.2px inside a 56px holder inside the 60px compact shell (`windowMetrics.ts:2` `MAIN_WINDOW_COMPACT_SHELL_SIZE = 60`, `geometry.ts:56-59` compact visual shell inset, `COMPACT_MASCOT_VISUAL_SIZE = 56`). The "true 60 px" candidate evidence was a 60px container (`OneWorksMascotInspector.tsx` `data-oneworks-candidate-avatar-60` width 60) — **production renders at 53.2px, not 60px**; this is a size-fidelity gate item (§7).

### 1.7 Action/motion ownership today

- Action *semantics*: `idle` (loop baseline, 2 steps of 5200ms hold / 500ms transition); `surprised`, `curious-short`, `playful-short` (once, 2300ms holds, 500ms smooth, from `compactMascotDefinition.ts:66-103`), playable in any order, never twice in a row (`compactMascotBehaviorRuntime.ts:78-99` `chooseAction`).
- Action *timing*: quiet window 18–32 s random (`COMPACT_MASCOT_QUIET_MIN_MS/MAX_MS` lines 17-18), deadline armed after baseline start/after each action (lines 61-75, 113-116).
- Pointer continues to act during actions today (eyeOffset passed on every frame, `renderCompactMascotScene` line 33/76) — i.e., actions and pointer are composited every tick.
- [OBSERVED] The runtime owns no `setTimeout/setInterval` (pinned by `compactMascotSurface.test.ts`), uses only the injected rAF scheduler; lifecycle/native state is never touched (pinned by `compactMascotArchitecture.test.ts`).

---

## 2. OneWorks direct upstream/package consumption (Lab-proven)

### 2.1 Exact dependency versions & placement

- [OBSERVED] `package.json:55-56` — `"@oneworks/avatar": "1.0.0-rc.6"` and `"@oneworks/avatar-react": "1.0.0-rc.6"`, both under `devDependencies` (Lab-only); `package.json:48` — `"@bible-strong/avatar-core": "0.1.0"` under `dependencies` (production).
- [OBSERVED] lockfile: `@oneworks/avatar-react` is MIT, depends on `@oneworks/avatar@1.0.0-rc.6`, peer React `>=18.3 <20` (Ameow ships React 19.1 — satisfies). `@oneworks/avatar` core: MIT, `sideEffects: false`, ESM (`"type":"module"`, `exports` map with `default`→`dist/index.js`). React package: MIT, `sideEffects: ["./dist/style.css"]`, exports `"."`→`dist/index.js` and `"./style.css"`→`dist/style.css`.
- [OBSERVED] npm artifacts: `@oneworks/avatar` = 28,310 B `dist/index.js` (single file); `@oneworks/avatar-react` = 318,589 B `dist/index.js` + 65,529 B `dist/style.css` (single pre-bundled file; **`src/` is NOT shipped**, only `dist/`, `README*`, `LICENSE`).
- [OBSERVED] source anchor: `oneworks-ai/avatar` revision `3ad2542ea4487e95884f313b84943df602c0e742` (main, 2026-08-24), recorded in `oneworksMascot.ts:14-15`, `canonical-candidate.json`, and verified by `verify-oneworks-mechanism-equivalence.mjs` (source-fidelity task). Provenance note: mechanism equivalence to the pinned revision is verified **for the paths used**; byte/build provenance of the registry artifact to that revision is **not claimed** (explicit in the source-fidelity report §“Not verified”).

### 2.2 Exported APIs (from `dist/index.d.ts`)

- `@oneworks/avatar` (core, pure): `createDefaultAvatarDefinition`, `createSeededAvatarDefinition`, `parseAvatarDefinition`/`serializeAvatarDefinition`/`isAvatarDefinition`, `parseAvatarAnimationClip`, `mergeAvatarAnimationLibraries`, `resolveAvatarAnimationClip`, `anchorAvatarAnimationClip`, `easeAvatarAnimationProgress`, `applyAvatarScenePatch`, `resolveAvatarAnimationFrame`, plus `AVATAR_*_RANGES` and `DEFAULT_AVATAR_*` constants (index.d.ts:554-567).
- `@oneworks/avatar-react`: `Avatar` (forwardRef; `AvatarHandle` = `capture/getDefinition/pause/play/resume/seek/setDefinition/stop`), `AvatarEditor` (focus/getDefinition/setDefinition), props incl. `definition` (controlled), `animation`, `animationLibraries`, `autoplay`, `interactive` (default `false`), `onAnimationEnd/Start/Loop`, `onDefinitionChange`, `onError`, `theme`; types re-exported. Style: `@oneworks/avatar-react/style.css`.

### 2.3 Lab consumption path (proof it works in this codebase)

- `src/lab/OneWorksMascotInspector.tsx:7-10` imports `Avatar`, `AvatarEditor`, `@oneworks/avatar-react/style.css` — Lab entry only (`rendererReuse.test.ts` pins `import "@oneworks/avatar-react/style.css"` in the Inspector only).
- `src/lab/oneworksMascot.ts` owns: pinned revision/version constants, deterministic poses/sweep, `createOneWorksCatDefinition` (source cat preset via `createDefaultAvatarDefinition`), `withOneWorksPose` (definition + `scene.view` patch), Lab-local pointer→pose mapper (`resolveOneWorksPointerPose`, bounded `±0.96 yaw / ±0.49 pitch`), sample animation library.
- `src/lab/oneworksAmeowCandidate.ts` owns: canonical candidate generator/serializer/loader with FNV-1a checksum (`serializeOneWorksAmeowCandidate`, `loadOneWorksAmeowCandidate`, `ONEWORKS_AMEOW_CANDIDATE_CHECKSUM`), ACTION_CLIPS (`surprised` 720ms once, `curious-short` 820ms once, `playful-short` 760ms once — lines 66-120), Lab pose envelope, and the production-recipe reuse (`resolveOneWorksAmeowAttentionPreview` calls `resolveCompactMascotAttention` unchanged, lines 300-325).
- [OBSERVED] Lab lifecycle evidence (prior spike): `requestAnimationFrame` from OneWorks playback returns to baseline after Reduced Motion, unmount, and hidden-visibility teardown; the two residual intervals are pre-existing Vite HMR + Agentation toolbar. `@oneworks/avatar-react` has no module-top-level `localStorage`/`matchMedia` access ([OBSERVED] all occurrences are inside functions/hooks: `localStorage` lines 200/210/2818/2826/5151/5172/6288/6294/7106 with `typeof window` guard at 200; `matchMedia` lines 2127/6939/7081/8089/8120).
- [OBSERVED] prod exclusions verified in prior spike: `npm run build` dist scan contains zero `@oneworks/avatar`, `AvatarEditor`, `OneWorksMascotInspector`, `src/lab` identifiers; production Vite input is `index.html` only (`vite.config.ts:13-16`), Lab input is `lab.html` only (`vite.lab.config.ts`).

### 2.4 Can Route A enter production as an exact runtime dependency without copying the candidate or bringing the editor/Lab graph?

- **Exact runtime dependency:** YES — move the two packages to `dependencies` at the exact pinned versions and import `Avatar` from `@oneworks/avatar-react` in the production host; no candidate copy is needed because the candidate is *data* (a definition), and the production definition module will hold it (see §4).
- **Editor/Lab graph (source-level):** YES — production code would import only `Avatar` (+ `@oneworks/avatar` pure helpers); `AvatarEditor`, `src/lab/*`, inspector, candidate exporter stay unreferenced by production entry, preserving the existing import-guard/lab-isolation tests (which are source-level).
- **Editor/Lab graph (byte-level):** **NO — [MEASURED] the published react artifact cannot be tree-shaken; `Avatar`-only import still emits `oneworks-avatar-editor` class, `Animation editor` strings, `createRoot`, and `localStorage` into the output bundle.** This is the core Route A caveat. Options:
  - Accept as documented inert bytes (recommended if the invariant is source-level, which it currently is — the *existing* lab-isolation test `rendererReuse.test.ts` asserts source-level exclusion only);
  - Require upstream to publish a renderer-only entry/condition (`__oneworks__` source condition exists in the export map but `src/` is not published, [OBSERVED] package files);
  - Vendor/bundle upstream sources (conflicts with "no copying" preference and requires keeping an upstream sync process — not recommended now).

---

## 3. Recommended ownership / authority / dependency model

### 3.1 Dependency direction (one-way, no cycles)

```
App.tsx (shouldReduceMotion) ──► MainWindowPresentationSurface
        │ (lifecycle/effects/native)          │ (sole Pointer Field writer; icon choreography;
        ▼                                     ▼  mounts host only when isCompact)
     lifecycle.ts / reactAdapter.ts       CompactMascot.tsx  (HOST: rAF clock, visibility,
        │ effectExecutor.ts                   reduced-motion, dispose; reads pointerField)
        │                                     │
        ▼                                     ▼
                     compactMascotRecipe.ts  (pure pointer→attention)  ─┐
                     oneworksCompactPose.ts  (pure attention→pose)     ─┤ (NEW, pure)
                     oneworksCompactMascotMotion.ts (NEW: quiet/action │  scheduler + frame composer, pure)
                     oneworksCompactMascotDefinition.ts (NEW: canonical│  definition authority)
                     │                                                │
                     ▼                                                ▼
        @oneworks/avatar (pure helpers: parse/serialize, clip resolve/frame)   [dependencies]
                     │
                     ▼
        @oneworks/avatar-react  Avatar (controlled definition; interactive=false)  [dependencies]
```

- No production module may import `@oneworks/avatar-react` `AvatarEditor` (new import-guard rule), `src/lab/*`, `oneworksAmeowCandidate.ts`, or any `.trellis/` path.
- Upstream cannot write back: `Avatar` is used with `interactive={false}` (its `interactive` prop defaults to false and is forwarded as `interactive: i` to the internal `Va` stage — `dist/index.js:8097-8098, 8232`), so upstream pointer handlers and `onViewStateChange` (which would call `setDefinition`) are not armed; `onDefinitionChange` is not wired.
- The host keeps the **same component contract** (`size/bodyColor/eyeColor/reducedMotion/pointerField/attentionCenterX/Y`, `CompactMascot.tsx:17-27`) so `MainWindowPresentationSurface.tsx:1235-1243` and Lab `CompactPreviewStage.tsx:142-150` do not change, and the `data-compact-mascot` marker can be preserved (tests pin it).

### 3.2 Pointer truth → head pose, one-way

[RECOMMENDED] Keep `pointerField.ts`/`MainWindowPresentationSurface.tsx` as the **sole** pointer writer (unchanged). Inside the host:
1. Read `pointerField.x/y` (read-only props; `MotionValue.get()` or `.on("change")` like today).
2. `resolveCompactMascotAttention(point, center, reducedMotion)` unchanged → attention offset (dead zone 3px / radius 46px / cosine; normal 11/7.5, reduced 6/4).
3. NEW pure leaf `oneworksCompactPose.ts`: `attentionOffset → {yaw, pitch}` with the SAME normalized shape (offset/max * envelopeMax), envelope constants frozen at **product decision** (Lab evidence used ±0.28 rad yaw / ±0.16 rad pitch; see §7 blocker B2).
4. Compose into `scene.view` of the canonical definition (`withViewPatch`) → single new definition object per tick → `Avatar definition={…}`.

Properties: the field is never written by the renderer; upstream has no pointer channel; reduced motion zeroes the pose (or reduced-scaled per product decision); one-way means any upstream renderer internals cannot influence Ameow state (verified: `onViewStateChange` not armed, no `onDefinitionChange`).

### 3.3 idle / surprised / curious / playful fit — no second authority

[RECOMMENDED] Keep the **existing Ameow clock as the single authority** (the current runtime already owns rAF, quiet 18–32 s scheduling, once-actions, pause/resume/visibility):
- Replace `compactMascotBehaviorRuntime.ts` with `oneworksCompactMascotMotion.ts` that keeps the same contract surface (`start/pause/renderStatic/dispose/isRunning/getPendingFrameCount/getCurrentAction/getNextActionAt`, `COMPACT_MASCOT_QUIET_MIN_MS/MAX_MS` 18 000/32 000) but composes OneWorks frames:
  - Baseline: canonical definition (+ pointer pose).
  - Action: at the deadline, pick `surprised`/`curious-short`/`playful-short` (never same twice), evaluate the public clip at elapsed time with **pure** `@oneworks/avatar` `resolveAvatarAnimationFrame(clip)` (clip anchored via `anchorAvatarAnimationClip`/`resolveAvatarAnimationClip` from the Ameow action library — the candidate ACTION_CLIPS are already public-clip shaped), merge `scene` patch (`applyAvatarScenePatch`) into the definition; per-field merge rule: **the active clip wins per merged field; pointer pose fills fields the clip does not patch** (mirrors today's pointer-during-action composition).
  - Reduced Motion: no rAF; static canonical definition; pointer change → static re-render (policy per §7 B4).
  - This deliberately does **not** use `AvatarHandle.play`: upstream's `definition`-change effect cancels its own playback rAF on every new definition object (`dist/index.js` `useEffect([v])` → `cancelAnimationFrame; H.current=null; C(v); P(v)`), so mixing upstream-owned playback with Ameow pointer/definition ticks would fight. Owning the clock keeps exactly one authority and makes `pause/resume/seek/stop/capture` unused in production.
- Actions remain **semantics + timing owned by Ameow** (same as today: quiet window, once, composition) while the *renderer* is upstream — this satisfies "no second authority" because the second authority (upstream runtime) is never activated (`animation={null}`, `autoplay={false}`).

### 3.4 Mount/dispose/visibility ownership (unchanged surface)

- Host owns `document.hidden` → stop rAF (start on visible), Reduced Motion, unmount dispose, `aria-hidden`, `pointerEvents: none` (same lines as today `CompactMascot.tsx:85-135`).
- Surface owns presence (AnimatePresence + settle-key remount) and native modes; the renderer never requests native/lifecycle events ([OBSERVED] existing guards and tests pin this; keep them for the host even after the swap).

### 3.5 Bundle/labelling

- `@oneworks/avatar` + `@oneworks/avatar-react` move to `dependencies` (exact versions); `@bible-strong/avatar-core` removed **only after** the replacement gate (§5).
- `THIRD_PARTY_NOTICES.md` must add `@oneworks/avatar(-react)` MIT notice (and remove/adjust the AGPL-3.0-only notice for `@bible-strong/avatar-core` if the dep is retired — note: **currently the unavoidable AGPL-3.0-only avatar-core has NO notice entry** [OBSERVED] `THIRD_PARTY_NOTICES.md` covers only the historical Paper/Apache research; this is a pre-existing compliance gap that Route A would improve).

---

## 4. Canonical candidate → single production source of truth

### 4.1 What the candidate is

[OBSERVED] `canonical-candidate.json` (archived task): `candidateId: ameow-oneworks-cat-2026-08-25-v1`, `candidateSchemaVersion: 1`, `checksum: fnv1a32:eb514f72`, `registryVersion: 1.0.0-rc.6`, `sourceRevision: 3ad2542e…`; definition = oneworks scene with `preset "cat"`, 3 parts (cone ears `0.27×0.31`, `roundness 64`, `±61/-82/-10`, `occludedByFace: true`; ellipse head `0.78×0.70`), face (gap 40, width 26, height 60, nose), `view {scale 1.28, yaw/pitch 0}`, palette `ameow-indigo`, camera bg `#121827`, frame rounded + shadow, effects (avatarShadow/outline). It is **definition data only** — no renderer code, no editor state, no animation clips (clips live in `src/lab/oneworksAmeowCandidate.ts` ACTION_CLIPS; they are part of the candidate's *behavior*, not the JSON).

### 4.2 Options and recommendation

| Option | Verdict |
| --- | --- |
| Import task-archive JSON at runtime | **Rejected.** `.trellis/` is not shipped (`electron-builder.config.mjs:53-62` files list); production must not depend on task/archive paths; layer violation. |
| Promote/move the JSON into production constants | **[RECOMMENDED].** Production module `src/presentation/main-window/oneworksCompactMascotDefinition.ts` embeds the canonical payload as a typed constant, runs `parseAvatarDefinition` at module load (mirrors today's module-load validation, `compactMascotDefinition.ts:105-107`), exports `ONEWORKS_COMPACT_MASCOT_DEFINITION`, plus pins `candidateId/candidateSchemaVersion/checksum/registryVersion/sourceRevision`. |
| Generate at runtime | **Rejected for production.** Generate once at authoring time (the archive `canonical-candidate.json` already is the generated canonical); runtime generation adds drift surface and a deps on the upstream core at runtime for zero benefit (core is still needed for clip resolution anyway — the pure helpers are small and used for animation composition). |

### 4.3 Duplication prevention

- **Single authority:** production module is the ONLY definition holder. `src/lab/oneworksAmeowCandidate.ts` (`createOneWorksAmeowCandidateDefinition`) must be gutted to import/re-export the production definition (Lab keeps only its Inspector-local pose envelope/preview glue), so both Lab and production converge on one source. The archived `canonical-candidate.json` stays as provenance only.
- **Drift guard:** a production unit test asserts `serialize(ONEWORKS_COMPACT_MASCOT_DEFINITION)` checksum === `fnv1a32:eb514f72`, candidateId, schema, registry version, source revision; a Lab test may additionally compare against the archive JSON (test-time file read is fine — it is not a runtime dependency). If the checksum/facts change, the change must be a deliberate product decision (new candidate id/version), not silent drift.
- **Fixed visual definition:** per task boundary, no visual tuning of the candidate in this path; the definition module is a verbatim promotion.

---

## 5. Atomic retirement of the archived/current diamond renderer

### 5.1 Retirement boundary (keep the seam, replace the body)

The host contract (`CompactMascot` props + `data-compact-mascot` markers) and `compactMascotRecipe` (attention authority) are the **stability seam**. Everything behind the host is replaced atomically in one PR; the host file itself is the only production file that must change alongside the new leaves.

### 5.2 Ordered migration (single reviewable PR; rollback = revert)

1. **Add** (production): `oneworksCompactMascotDefinition.ts`, `oneworksCompactMascotMotion.ts`, `oneworksCompactPose.ts`; move `@oneworks/*` to `dependencies`; add `src/architecture/import-guard.test.ts` rules (host may import `@oneworks/avatar-react` `Avatar` + CSS; forbid `AvatarEditor` in production; keep MR0 leaf rules for the new pure leaves; keep Pointer-Field/one-writer rules).
2. **Rewire** `CompactMascot.tsx` internals to mount `<Avatar definition={frame} interactive={false} animation={null} autoplay={false} theme="dark" …/>` + rAF/composer loop; keep the component name, props, `data-*` attributes, `aria-hidden`, `pointerEvents: none`, visibility/reduced-motion/dispose logic. **Old modules remain in tree and old dependency remains installed** in this step (so the diff is revertible and `git revert` is a full rollback).
3. **Verify** the full gate matrix (§7.2) — including the Lab side-by-side at the true production size (53.2px) vs the 60px approved specimen, lifecycle instrumentation (rAF baseline after Reduced Motion/unmount/hidden), bundle+packaged size, file:// packaged smoke.
4. **Delete** (same PR or immediate follow-up commit, still same feature branch): `compactMascotDefinition.ts`, `compactMascotBehaviorRuntime.ts`, `compactMascotDefinition.test.ts`, `compactMascotBehaviorRuntime.test.ts`; **rewrite** `compactMascotArchitecture.test.ts` and `compactMascotSurface.test.ts` for the new host (they pin `kirby-cat`, 4 ear slots, `@bible-strong/avatar-react` absence, 56px/RENDER_SCALE, `if (reducedMotion)` + `renderStatic` etc.); remove `@bible-strong/avatar-core` from `package.json` + lockfile; update `THIRD_PARTY_NOTICES.md`; update `src/lab/CompactPreviewStage.tsx` if it hard-codes render-size assumptions (it passes `size={COMPACT_MASCOT_VISUAL_SIZE}` — verify Lab still matches production size semantics) and `rendererReuse.test.ts` accordingly.
5. **Post-deletion acceptance:** zero references to `avatar-core`/`Kirby`/`diamond` in `src/`; exactly one Compact renderer authority (the OneWorks host) and exactly one definition authority; `npm run build` + packaged smoke pass.

### 5.3 Rollback boundary

- No persistence, no data migration, no native/lifecycle change → **the revert boundary is the PR itself** (git revert of the feature branch restores avatar-core renderer + definition + dependency in one operation).
- Insurance: because step 4 deletes files, keep step 4 deletions in a commit whose parent is the verified rewire commit; if the gate fails between steps, revert only step 4 (old files restored) or the whole PR.
- Rollback is NOT a migration: the rendered art is stateless; no user data is involved.

### 5.4 Files deletable only after the replacement gate

- `src/presentation/main-window/compactMascotDefinition.ts` (diamond definition + KIRBY body/revision)
- `src/presentation/main-window/compactMascotBehaviorRuntime.ts` (avatar-core playback)
- `src/presentation/main-window/compactMascotDefinition.test.ts`, `compactMascotBehaviorRuntime.test.ts`
- `@bible-strong/avatar-core` (package.json + package-lock.json) + its bundled `ajv` tree
- `compactMascotArchitecture.test.ts` / `compactMascotSurface.test.ts` (rewrite, not delete)
- AGPL notice bookkeeping in `THIRD_PARTY_NOTICES.md`

Nothing may be deleted before: (a) replacement host + new leaves pass all focused tests; (b) `npm run build` (renderer + electron) passes; (c) browser Lab V&V at production size + lifecycle instrumentation passes; (d) packaged `file://` smoke passes on the target OS available. (macOS is a not-yet-verified gate — see §7.4.)

---

## 6. Route A package / runtime constraints (repository-evidenced)

### 6.1 Dependency placement

- Move to `dependencies` (exact `1.0.0-rc.6`): `@oneworks/avatar`, `@oneworks/avatar-react`. electron-builder packages production deps ([OBSERVED] `NODE_MODULES_JUNK_EXCLUDES` in `electron-builder.config.mjs:38-43` evidence that `node_modules` content is packaged; `asar: false` line 49; app ships `dist/**` + `dist-electron/**` + locales + binaries, lines 53-62). Today `@bible-strong/avatar-core` (AGPL) + its `ajv` subtree (≈2.1 MB on disk, node_modules) is already in `dependencies` → packaged. Net packaged-size effect of the swap: −(avatar-core+ajv) +(@oneworks 453 KB) ≈ likely a **reduction**, but must be measured in the packaging gate.
- `@oneworks/avatar` core is used by the new pure motion/definition leaves (parse/serialize/clip resolve) — same package both sides, no extra dep.

### 6.2 Bundle cost ([MEASURED], same pipeline as the real app)

Experiment (temp dir, junction to the repo `node_modules`, Vite 8 = the app's bundler, production build of an entry that mounts `Avatar` + `style.css`):

| Item | JS (min) | JS gzip | CSS (min) | CSS gzip |
| --- | ---: | ---: | ---: | ---: |
| `Avatar` + `style.css` build | 409,329 B | 122,28 KB | 64,875 B | 9,08 KB |
| React 19 + react-dom client baseline | 190,120 B | 59,85 KB | — | — |
| **Incremental (what the app adds)** | **≈ 219.2 KB** | **≈ 62.4 KB** | **≈ 64.9 KB** | **≈ 9.1 KB** |

- Comparator: current production renderer bundle = 884,970 B JS + 18,080 B CSS ([OBSERVED] `dist/assets/index-mgluFMT8.js` 884,970 B, `index-DlULy6e5.css` 18,080 B from `npm run build` on 2026-08-25 15:03). So the production JS would grow roughly 885 KB → ~1.06 MB (+~20%), CSS 18 KB → 83 KB (+~4.6×); gzip growth ≈ +62 KB JS. After removing avatar-core (raw ≈65 KB dist; minified credit ≈35–45 KB — **not precisely measured**, estimate) the net is ≈ +180–190 KB min JS. The exact final delta must be captured in the build gate (§7.2) — treat numbers above as measured increments, net delta as estimate.
- **Tree-shaking: [MEASURED] ineffective for the react artifact.** `Avatar`-only bundle still contains `oneworks-avatar-editor`, `Animation editor`, `createRoot`, `localStorage`. Root cause: single pre-bundled `dist/index.js`; `src/` not published ([OBSERVED] package files).
- `@oneworks/avatar` core is `sideEffects: false` + ESM → tree-shakable; its runtime index is 28,310 B (raw).

### 6.3 CSS / import shape

- Import: `import "@oneworks/avatar-react/style.css"` in the production host (JS import; Vite inlines into the app CSS asset — works with `base: "./"` under `file://`, no asset urls: **[OBSERVED] style.css has zero `url()` references** → self-contained; no fonts/images).
- Scope: classes `.oneworks-avatar`, `.oneworks-avatar-editor`, `:root` custom props `--oneworks-*` ([OBSERVED] `style.css`). Namespaced; low collision risk; editor rules inert without the editor class. Optional future hardening: purge editor selectors via a small CSS postprocess (not in scope now, note only).
- Host sizing: `.oneworks-avatar { width:100%; aspect-ratio:1; overflow:hidden; background: var(--oneworks-avatar-background,…) }` and `.oneworks-avatar>.interactive-avatar{width:100%;height:100%}` — the host gives the box its size (53.2px today). **`overflow:hidden` on `.oneworks-avatar` clips at the box** (unlike the current SVG's `overflow:visible`), so ear-overhang behavior differs; the approved 60px specimen already treats the Avatar box as the canvas, so the production box should be sized to the shell (see blocker B3).

### 6.4 Browser APIs / renderer mechanics

- [OBSERVED from dist] `Avatar` uses: React (19.x OK), `requestAnimationFrame/cancelAnimationFrame` (its own playback, plus we supply ours), `ResizeObserver`, `matchMedia` (theme system only), `performance.now`, SVG DOM (`createElementNS` in capture path), `XMLSerializer`/`Blob`/`Image`/`URL.createObjectURL` (capture path, not used in production), `document`/`window` (within functions/hooks, `typeof window` guarded at the locale helper line 200); `localStorage` only in editor persistence paths (inside functions).
- **No module-top-level DOM/storage access** — import in a DOM-less/non-browser context should not throw ([INFERRED] from the guard patterns; still list as a not-yet-verified gate with a Node import smoke test).
- Upstream renders an SVG (`interactive-avatar__canvas`, `viewBox 0 0 420 420`) inside the host div; the candidate's `scene.camera.frame`/`frameShadow`/`background` are painted by the same root div (`box-shadow` inline + `--oneworks-avatar-background`) — so the approved frame/shadow styling comes along with the definition (part of the fixed visual definition).
- ResizeObserver on a 53–60px host: fine.
- `interactive={false}` default disables the drag/rotate/zoom handlers; `interactionMode: "move"` in the candidate definition does not arm handlers when `interactive` is false ([OBSERVED] `Va` receives `interactive: i`, and internal `onViewStateChange`→`setDefinition` loop is only reachable through interactive handlers).

### 6.5 Electron packaged runtime & file://

- Packaged main window: `electron/windowRouting.mts:41-54` — packaged `buildRendererRoute` returns `pathToFileURL(<repoRoot>/dist/index.html)#/<route>`; dev uses `http://127.0.0.1:1420`. So production renderer is a **file:// page**; Vite `base: "./"` (`vite.config.ts:8`) makes all emitted assets relative → bundled OneWorks code/CSS load correctly ([INFERRED] standard; still a packaged smoke gate).
- WebPreferences: `contextIsolation: true`, `sandbox: false`, `nodeIntegration: false` (`electron/main.mts:701-705`); no CSP header/meta ([OBSERVED] `index.html` has none; no `webRequest` CSP injection found). So `style`/`script` restrictions are not imposed; `localStorage` behavior on `file://` in Electron is available by default — verify in packaged smoke.
- `asar: false` (electron-builder.config.mjs:49) → packaged app is a plain folder; no asar path semantics. Production deps are copied to the app folder; the renderer doesn't need node_modules at runtime (all bundled) — but the electron-builder license/junk filters still process them.
- Windows/macOS: no platform-specific code in the OneWorks path; Ameow already ships 0.3.1 Windows + macOS builds. macOS remains unverified for this adoption (no mac evidence pipeline in this session).

### 6.6 Licensing / metadata

- [OBSERVED] `@oneworks/avatar` + `@oneworks/avatar-react` = **MIT** (package.json license fields + per-package LICENSE).
- [OBSERVED] `@bible-strong/avatar-core@0.1.0` = **AGPL-3.0-only** (package.json `"license": "AGPL-3.0-only"`; LICENSE is the GNU Affero GPL v3 text). Ameow is **MIT** (`LICENSE` line 1).
- [OBSERVED] `THIRD_PARTY_NOTICES.md` contains no avatar-core/AGPL notice (only the historical Paper/Apache research text) → **pre-existing compliance gap**; Route A (MIT) would remove the AGPL dependency entirely. Flag for the Lead/product: adopting OneWorks is legally cleaner, but the license decision belongs to product/legal, not this research.

---

## 7. Implementation phase boundary, verification, blockers/risks

### 7.1 Phase boundary

| Phase | Contains | Exits when |
| --- | --- | --- |
| **P0 (done — this report)** | All repository/runtime evidence above | Report delivered |
| **P1 — Production rewire (code)** | Deps to `dependencies`; new definition/pose/motion leaves; host swap behind identical props; import-guard/lab-isolation updates; new unit tests for leaves (checksum, clip evaluation, composition, quiet timing, reduced motion); Lab fixture re-pointed to production definition | All focused tests + `npm run type-check` + `npm run lint` pass |
| **P2 — Visual & runtime gates** | Browser Lab V&V at TRUE production size (53.2px vs 60px shell + magnified), pointer/actions/reduced-motion, lifecycle instrumentation (rAF baseline), performance profile (pointer at 60Hz vs current), `npm run build` (identifier scan: zero `src/lab`/`AvatarEditor`/`oneworksAmeowCandidate`; upstream editor strings documented), bundle size before/after, `package:win:dir` + portable packaged `file://` smoke, Windows native smoke; macOS if hardware/CI available | Gates pass; P2 evidence appended to task |
| **P3 — Atomic retirement** | Delete old renderer/definition/runtime + tests; drop `@bible-strong/avatar-core`; notices update; final `npm run build` + package + full `npm test` | Only one Compact renderer/definition authority remains |
| **P4 — Docs/communications** | Update docs-site pages ONLY if user-facing behavior documented (currently no mascot/compact docs exist — [OBSERVED] no matches in `site/src/content/docs/` or READMEs), release notes mention if warranted | n/a |

### 7.2 Verification matrix / commands

| Gate | Command | Pass criterion |
| --- | --- | --- |
| Focused unit | `npx vitest run src/presentation/main-window src/lab/oneworksMascot.test.ts src/lab/oneworksAmeowCandidate.test.ts src/lab/OneWorksMascotInspector.test.ts src/lab/rendererReuse.test.ts` | 0 failures |
| Architecture guard | `npx vitest run src/architecture/import-guard.test.ts` | 0 failures; new editor-forbid rule active |
| Types | `npm run type-check` | clean |
| Lint | `npm run lint` | clean |
| Production build | `npm run build` | succeeds; `dist/` identifier scan rejects `src/lab`, `AvatarEditor`, `oneworksAmeowCandidate`, `PresentationLab` (our identifiers); accepts documented upstream editor strings |
| Bundle delta | record `dist/assets/*.js/css` bytes before vs after + gzip | report; expected ≈ +180–220 KB JS / +65 KB CSS |
| Lab build | `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/lab-build` | succeeds; OneWorks cost separable |
| Lifecycle instrumentation | existing capture scripts pattern (`capture-*-browser-evidence.mjs`) | rAF/timeouts return to baseline after Reduced Motion, unmount, hidden |
| Pointer/reduced/actions V&V | browser Lab captures at production size | matches approved semantics |
| Packaged file:// | `npm run package:win:dir` (or `package:portable:skip-build` after `npm run build`) then launch, toggle compact, pointer, reduced motion | no console errors; mascot renders in packaged app; `file://` works |
| macOS | `npm run package:mac:zip` (needs macOS) | same, on macOS |
| Full regression | `npm test` | 0 failures (excluding known unrelated worktree copies) |

### 7.3 Blocker (must be resolved by Lead/product before P1 is authorized)

**B1 — Editor bytes in the production bundle (decision).** The published react artifact cannot be tree-shaken ([MEASURED]); importing `Avatar` ships `AvatarEditor` + editor CSS (~219 KB JS / 65 KB CSS incremental). The project's current invariant is source-level (lab isolation test), so this is a **decision**, not a defect: (a) accept and document, (b) request upstream renderer-only entry, or (c) vendor sources (not recommended). Research cannot decide it.

### 7.4 Not-yet-verified gates (NOT blockers, must be proven in P2)

- **G1 — byte/build provenance** of registry `rc.6` to the pinned source revision (never claimed; mechanism-equivalence only). Mitigation: pin exact version; audit on upstream releases.
- **G2 — Electron packaged `file://` behavior** of the OneWorks DOM/CSS + `localStorage` availability (smoke in P2).
- **G3 — macOS** packaged behavior (no mac evidence path in this session).
- **G4 — real production Compact lifecycle/pointer integration** (Lab ≠ production mount; P2 browser Lab + native smoke).
- **G5 — performance at production size**: per-tick definition object → full Avatar React reconciliation (vs today's direct attribute writes). Mitigations: rAF-aligned pointer sampling (pointer events → one tick per frame), memoized patch objects, possible 30 Hz pose-only update tier, profile before/after. Acceptable target: no dropped frames vs current.
- **G6 — final net bundle/packaged size** (avatar-core removal credit is estimated, not measured).
- **G7 — import-time browser-API access** (guarded pattern suggests none; add Node-import smoke to the test suite: `await import("@oneworks/avatar-react")` must not throw without DOM).

### 7.5 Risks (non-blocking, track)

- **R1 — size/visual fidelity at 53.2px vs 60px approved specimen.** The approved evidence is 60px; production is 53.2px today. Decision (B3) needed: keep 53.2px (re-verify) or size the Avatar box to 56/60px (changes `COMPACT_MASCOT_RENDER_SCALE` usage; surface+Lab tests refer to it). No visual tuning of the candidate itself.
- **R2 — action + pointer field-composition semantics** (clip patches vs pointer view): rule defined in §3.3; behavior tests must pin it (action won, pointer fills, reduced motion zeroes).
- **R3 — upstream definition-change cancels its own playback**: irrelevant only because we do not use `AvatarHandle.play`; if any future code calls `play`, pointer updates kill actions — forbid handle.play in production and test-guard it.
- **R4 — upstream churn** (`rc.6` pre-1.0): pinned exact version; re-evaluate stable release separately.
- **R5 — theme/background coupling**: pass a fixed `theme` (e.g. `"dark"`) matching the candidate evidence; the candidate's own camera background already provides its look.
- **R6 — AGPL → MIT transition**: verify with legal/product; notices update is mandatory either way.
- **R7 — CSS leakage via `:root --oneworks-*`**: name-spaced, low risk; verify no style bleed in the full app after import.

### 7.6 Unresolved product decisions (explicitly out of research scope)

- B1 (editor bytes), B2 (production pose envelope: normal + reduced-motion values), B3 (production render box size 53.2/56/60px), B4 (reduced-motion pose policy: fully static vs reduced-scaled eye/bounds parity), B5 (theme mapping), and whether the compact icon keeps `data-compact-mascot="kirby-cat"` (rename to oneworks? cosmetic, tests pin it).

---

## 8. Dirty worktree and implementation overlap warnings

[OBSERVED] `git status --short` (main, HEAD `fadb225`) — unrelated in-progress work, NOT touched by this research:
- Modified (unrelated yt-dlp/managed-runtime work): `electron/main.mts`, `electron/managedPythonPackageManifest.mts`, `electron/managedRuntimeBootstrap.mts` (+ test), `src/electron-runtime/{advancedQualityProbe,contracts,engineExecutionContext,engineManifest,galleryDlEngineAdapter,service,ytDlpCommandPlan(+test),ytDlpDownload(+test),ytDlpEngineAdapter,ytDlpMetadata(+test)}.ts`, `scripts/ensure-capability-probe-runtime.mjs`, `browser-extension/locales/contract.json`, `.trellis/spec/backend/*`, `AGENTS.md`.
- Untracked: `.cindy-upstream/`, `.cindy-worktrees/`, `.trellis/tasks/08-25-diagnostics-backend-managed-ytdlp-planning/`, `.trellis/tasks/08-25-managed-ytdlp-p2v-evidence-gates/`, `.trellis/tasks/08-25-managed-ytdlp-p2v-runtime-contract-repair/`, `.trellis/tasks/08-25-managed-ytdlp-update-rollback-planning/`, `.trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/`, `agentation-placement-package-output/`, `electron/runtimeSetLifecycle.mts` (+ test), `spike-package-output/`.

**Overlap guidance for implementation:**
- Files this adoption touches (`src/presentation/main-window/…`, `package.json`, `package-lock.json`, `src/architecture/import-guard.test.ts`, `src/lab/*`, `vite*`, `electron-builder.config.mjs`, `THIRD_PARTY_NOTICES.md`) are **clean** today — no conflict with the dirty set, except:
  - `electron/main.mts` is dirty → P2 `npm run build`'s electron step (`tsc -p tsconfig.electron.json`) compiles in their in-progress code; build gates may transiently fail for unrelated reasons. Coordinate/sequence P2 after the yt-dlp work settles, or run gates on a clean worktree/CI.
  - `tsconfig.electron.json`/`package-lock.json` changes from the other work must not be reverted; adoption PRs should branch from current main with these dirty files excluded (they are not ours).
- `.trellis/tasks/08-25-oneworks-mascot-production-adoption-planning/` is this task's own untracked dir; only `research/production-adoption-research.md` was added here (no other task artifacts were modified).

---

## 9. Quick-reference evidence index (file:line)

- `src/presentation/main-window/compactMascotDefinition.ts:4` (Kirby revision), `:21-23` (sphere), `:31-62` (diamond ears), `:64` (colors), `:66-103` (animations), `:105-109` (validation/export)
- `src/presentation/main-window/compactMascotBehaviorRuntime.ts:17-18` (quiet window), `:33-51` (renderCompactMascotScene), `:55-127` (runtime API)
- `src/presentation/main-window/CompactMascot.tsx:17-27` (props), `:49-57` (initialScene), `:59-81` (applyScene fixed slots), `:85-135` (lifecycle/reduced/visibility), `:152-164` (svg attrs)
- `src/presentation/main-window/compactMascotRecipe.ts:3-8` (300/56/0.95), `:14-24` (49px/3px dead/11-7.5/6-4), `:32-41` (cosine), `:44-75` (resolve)
- `src/presentation/main-window/MainWindowPresentationSurface.tsx:25-26` (imports), `:380-383` (field write), `:558` (isCompact), `:597` (field), `:603-616` (pointer fact), `:680` (native boundary), `:714-749` (hotspot + pre-eval write 725-727), `:786-793` (blur/visibility reset), `:1195-1244` (icon mount/remount/CompactMascot)
- `src/presentation/main-window/motionRecipes.ts:99-142` (icon recipe), `src/constants/windowMetrics.ts:1-4` (200/60/80/14), `src/presentation/main-window/geometry.ts:55-59` (compact shell)
- `src/App.tsx:2,352` (useReducedMotion), `:387,2715` (environment)
- `src/architecture/import-guard.test.ts:52` (forbidden pkg prefixes = electron only), `:861-938` (CompactMascot host rules), `:876-886` (Pointer field one-writer)
- `package.json:47-56` (deps), `electron-builder.config.mjs:38-62` (packaging), `electron/main.mts:701-705` (webPreferences), `electron/windowRouting.mts:41-54` (file://)
- `vite.config.ts:8,13-16` (base ./ + index.html only), `vite.lab.config.ts` (lab only), `index.html` (no CSP)
- `src/lab/oneworksAmeowCandidate.ts:55-58` (Lab envelope), `:66-120` (ACTION_CLIPS), `:157-…` (candidate builder), `:300-325` (attention preview)
- `oneworks-ai/avatar@3ad2542…` pinned in `oneworksMascot.ts:14-15`, `canonical-candidate.json`
- `dist/assets/index-mgluFMT8.js` 884,970 B / `index-DlULy6e5.css` 18,080 B (current production build)
- `@oneworks/avatar-react/dist/index.js:8097-8265` (Avatar component internals, definition-controlled, interactive default false, definition-change cancels playback), `:1778` (viewBox 420), `style.css` (`.oneworks-avatar` aspect-ratio/overflow/width, `:root --oneworks-*`)

---

## 10. Route A verdict (with caveats)

- **Mechanism: GO** (browser-proven, source-mechanism-verified; no repository/runtime evidence of a hard mechanism blocker).
- **Production adoption: CONDITIONAL GO — decision B1 required.** With B1 accepted (editor bytes documented) and B2–B5 settled, Route A is implementable as an exact runtime dependency with Ameow owning all authority, pointer, lifecycle, timing, Reduced Motion, and shell; no candidate copy is needed (definition promotion, §4); Lab/editor graph stays out of production at the source level.
- **Do not proceed to Route B/C:** there is no concrete evidence that Route A fails; the only material constraint is bundle bytes (B1), which is a product decision, not a mechanism failure. Route B ("port geometry") remains the fallback if B1 is rejected AND upstream cannot provide a renderer-only entry.
