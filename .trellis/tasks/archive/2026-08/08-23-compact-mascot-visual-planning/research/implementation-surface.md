# Research: Compact mascot implementation surface

- Query: Map the current Ameow Compact mascot production/Lab implementation surface, ownership boundaries, tests, and dependency touch points for an upstream-derived visual leaf.
- Scope: internal / mixed (repository code plus installed upstream package metadata)
- Date: 2026-08-23

## Findings

### Production composition and the only visual seam

- `src/presentation/main-window/MainWindowPresentationSurface.tsx:1190-1244` owns the Compact `AnimatePresence`, enter/settle/exit motion, 60px shell layout, and `CHARACTER_VISUAL_SIZE` frame. The only mascot mount is the `<CompactCatCharacter>` leaf at `:1232-1240`.
- The leaf prop contract at `src/presentation/main-window/CompactCatCharacter.tsx:49-78` is already narrow: rendered size, theme body/eye colors, explicit `reducedMotion`, read-only Pointer Field MotionValues, and geometry-derived attention center. It has no lifecycle, Product, native-window, IPC, or completion callback input.
- `characterRecipe.ts:1-15,50-66,119-170` is a pure renderer-local module. It owns 60 viewBox / 56px visual constants, centered body/ear/eye geometry, bounded pointer projection, reduced-motion amplitude, body squash, and the stable Motion 12 spring source gate. It must remain a pure helper if replaced by an avatar-core adapter.
- `characterBlinkRuntime.ts:16-98` is the consumer-local timer boundary: one pending timer, generation invalidation on stop, and permanent disposal. A source adapter may replace this runtime only if it preserves the same hidden/unmount/reduced-motion cancellation behavior.

### Inputs and authority boundaries

- `MainWindowPresentationSurface` is the sole Pointer Field writer and passes it read-only to the leaf. The compact hotspot and native interaction policy remain outside mascot geometry; the recipe explicitly documents that 38px hotspot and 80px reachable frame are independent (`characterRecipe.ts:7-15`).
- Theme colors are existing semantic fields in `src/contexts/ThemeContext.tsx:82-83,162-163,233-234`; both production and Lab callers read `colors.characterBody` and `colors.characterEye`. Palette tuning should touch these existing values only, not add a palette framework.
- The Compact visual is mounted only in compact mode. Full/MR9 graphics are composed separately by the same surface and are not in this leaf's prop path; no changes to `ExpandedPresentationSurface` or activation targets are required for a mascot replacement.

### UI Lab and test surface

- `src/lab/CompactPreviewStage.tsx` is the Lab caller. Its intended contract is the production 80/60/56 geometry with a Lab-local MotionValue pair and no native window. `compactPreviewStage.test.ts:16-30` pins direct reuse of the production leaf and existing theme tokens.
- `src/lab/rendererReuse.test.ts:197-214,246-249` protects production-leaf reuse and keeps environment/target pickers from importing the leaf. A direct upstream candidate temporarily mounted in Lab must be removed or superseded before production integration; these assertions should be updated atomically with any deliberate candidate boundary.
- `characterRecipe.test.ts`, `characterBlinkRuntime.test.ts`, and `characterSurface.test.ts` cover silhouette/attention bounds, reduced-motion and stable-source behavior, one-timer lifecycle, composition, writer ordering, no rAF, no completion callback, and no legacy `CatIcon`/`mascot.svg` mount.
- `src/architecture/import-guard.test.ts:605-657,668-747` includes the pure recipe and blink runtime in the MR0 renderer-local leaf set. It forbids Product/lifecycle/desktop/Electron imports, position/DOM coordinate reads, and IPC side channels. If a new adapter is split into pure core helpers and an SVG host, keep these rules on the pure modules and preserve the DOM-boundary exception only where visibility is genuinely read.

### Dependency and source-asset touch points

- The worktree currently declares `@bible-strong/avatar-core: 0.1.0` in `package.json` and lockfile. Installed metadata reports `@bible-strong/avatar-core@0.1.0`, AGPL-3.0-only, with an `ajv` runtime dependency and Node `>=22.12.0`; the core exports `validateAvatarDefinition`, playback state/advance/sample functions, scene rendering, and geometry primitives.
- Installed `@bible-strong/avatar-react@0.1.0` exports an `Avatar` component with `defaultAnimation`, `autoplay`, `size`, and accessibility props, but it is currently **extraneous** (`npm ls --depth=0` reports it outside `package.json`). Its API has no explicit Reduced Motion or continuous Pointer Field prop, matching the planning gap; it is suitable only as a disposable direct-reuse Lab candidate after dependency/license review.
- An in-progress untracked `src/presentation/main-window/strobiDefinition.ts` validates a pinned Strobi definition from upstream revision `175691ab32cefe5faec7828af62f3d50210a8eb2` and fixes the `proud` animation key. This is a source asset candidate, not a new registry or Product-state mapping. The task-local upstream report remains the source for renderer/dependency/license evidence.

### Implementation impact map

Minimum production replacement should be atomic across:

1. the current `CompactCatCharacter` leaf internals (and, if needed, `characterRecipe.ts` / `characterBlinkRuntime.ts`);
2. the pinned source definition or adapter module under `src/presentation/main-window/`;
3. existing focused tests and architecture/import guards;
4. package manifest/lockfile only for the exact production dependency.

`MainWindowPresentationSurface.tsx`, `geometry.ts`, `pointerField.ts`, lifecycle/projections, native hotspot/passthrough code, Full/MR9 targets, and Lab shell geometry should remain unchanged unless a test demonstrates a contract violation. The Lab should continue mounting the same production leaf directly after the disposable direct candidate is removed or superseded.

## External references

- Upstream repository: `smontlouis/bible-strong-avatar-lab`, pinned revision `175691ab32cefe5faec7828af62f3d50210a8eb2` (see task-local `research/upstream-bible-strong-avatar-lab.md`).
- Installed package metadata: `@bible-strong/avatar-core@0.1.0`, `@bible-strong/avatar-react@0.1.0`; both report `AGPL-3.0-only`.
- Project specs: `.trellis/spec/frontend/character-motion.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/state-management.md`.

## Caveats / Not Found

- The worktree is dirty while the implementation experiment is in progress (`package.json`, `package-lock.json`, `src/lab/CompactPreviewStage.tsx` modified; `strobiDefinition.ts` untracked). Findings above describe the committed production seam plus the observed candidate state; they do not constitute an implementation or Architecture PASS.
- The exact upstream license/governance decision is intentionally deferred by the task PRD. This report does not approve distribution of AGPL code/assets.
- No final derivative SVG host or source playback loop was present to review; direct candidate wiring currently imports an extraneous `avatar-react` package and therefore must not be treated as a reproducible production dependency.
