# MR2 repository baseline and planning evidence

## Baseline selection

- Root `main` is still `e40f5fe` and does not contain the approved Presentation architecture.
- `D:/Ameow/.cindy-worktrees/mr1-dot-field` is clean at `b84e13c`; commits `a906589`, `a7ecc53`, and `8326f0e` contain the approved MR0 contracts, MR1 implementation, and MR1 archive respectively.
- Use that committed post-MR1 tree as planning evidence. Paused M3 work is not part of this baseline.

## Compact composition and legacy icon

- `src/presentation/main-window/MainWindowPresentationSurface.tsx:514-614` owns projection, geometry, stable DOM refs, and the one local Pointer Field instance.
- `MainWindowPresentationSurface.tsx:977-1101` keeps a stable viewport, a Magnetic outer wrapper, the shadow layer, and the morphing shell.
- `MainWindowPresentationSurface.tsx:1145-1190` composes application children plus a compact-only `AnimatePresence`; `CatIcon` is mounted only when `isCompact` and unmounted as soon as the target visual projection becomes full.
- `src/components/CatIcon.tsx:1-24` is only an `<img>` around `src/assets/mascot.svg`, with no runtime state or lifecycle beyond React mount/unmount.
- `src/presentation/main-window/projections.ts:43-55,96-132` maps collapsing to compact and expanding to full. Thus Character mounts at collapse target acquisition and exits at expansion target acquisition; the shell transition epoch remains lifecycle-owned.

## Geometry, hotspot, passthrough, and reachability

- `src/constants/windowMetrics.ts:1-3,17-33` defines 60px compact shell, 80px compact reachable outer frame, and platform full-outer metrics.
- `src/presentation/main-window/geometry.ts:51-112` centers the 60x60 shell at `(10,10)` in the 80px reachable frame and keeps hotspot geometry separate. Windows/Linux currently use the legacy 38px hotspot frame; macOS uses 60px.
- `src/presentation/main-window/projections.ts:73-113` enables compact reachability in compact/collapsing, but compact passthrough only after the matching lifecycle completion.
- `MainWindowPresentationSurface.tsx:729-778` owns Windows compact forwarded `mousemove` hotspot evaluation and hysteresis.
- `src/App.tsx:372-408` translates lifecycle native effects into semantic interaction mode and compact reachability operations. No Character input belongs on this path.
- MR0 Lead review records renderer-only compact/full morphing over a stable native Main Window viewport. In current code “80x80 outer” is a compact reachable-frame contract, not a BrowserWindow resize operation.

## Pointer Field reachability

- `src/presentation/main-window/pointerField.ts:4-13,37-47` defines one pair of instance-local MotionValues initialized at stable-root center.
- `pointerField.ts:49-99` owns pure finite/clamped client-to-root conversion plus center reset helpers.
- `MainWindowPresentationSurface.tsx:610-644` creates the field and centralizes semantic leave reset.
- `MainWindowPresentationSurface.tsx:379-390,1062-1074` writes full/collapsing DOM pointer points and initial enter points.
- `MainWindowPresentationSurface.tsx:687-727` turns native pointer-boundary/DOM loss into lifecycle and center-reset facts while the interactive pointer boundary is active.
- Current Windows settled compact forwarded `mousemove` at `MainWindowPresentationSurface.tsx:729-778` evaluates the hotspot but does not write Pointer Field. MR2 must feed those same coordinates through the existing Surface writer before hotspot evaluation. This is an adapter on the sole authority, not a second tracker.
- Compact attention is bounded: forwarded events may arrive over the stable transparent viewport, so the Character projection needs a compact response-radius falloff to neutral. The first point entering the smaller hotspot dispatches `pointerEnter` and immediately targets full/expanding; MR2 can preserve that point for the Character exit/transition cue but cannot provide sustained inside-hotspot hover without violating the approved immediate-expansion contract.
- Windows passthrough forwards `mousemove` but not `mouseleave`. An exit that the platform does not report may leave the last Pointer Field point in place; the Character must clamp it, settle, and perform zero further work. Observable blur/hide/replacement/reset returns neutral. Adding a loss timer or new native event is not justified for MR2.
- `src/architecture/import-guard.test.ts:815-837` pins `MainWindowPresentationSurface.tsx` as the only production Pointer Field writer and excludes module-level mutable field state.

## Renderer and execution evidence

- `package.json` already provides React 19, Motion 12.35, and browser-native SVG; no other animation or graphics dependency is installed or needed.
- The Character has fewer than ten persistent vector primitives and only transform/opacity/eye-shape targets. Inline SVG is smaller and more testable than Canvas, avoids raster scaling, and keeps theme colors declarative.
- MotionValues and `useSpring` execute outside React render updates and naturally retarget a spring from its current condition. Springs stop their internal scheduling after settlement.
- A Character-local timer/controller is justified only for blink cleanup/generation tests. It must remain consumer-specific and may not become a scheduler abstraction.
- Continuous breathing and stochastic expression add permanent or unpredictable idle work without being required for identity. MR2 should omit them.

## Windows risk chain

- `src/architecture/windows-risk-path.test.ts:5-98` explicitly states the native argument-conversion/reachability chain remains reachable and that the test does not certify repair.
- `src/App.tsx:382-393` constructs finite plain numeric reachability data and catches failures.
- `src/desktop/runtime.ts:72-76` forwards the request; `electron/preload.mts:98-102` invokes IPC.
- `electron/main.mts:3430-3447` converts and finite-checks the numeric request before calling policy.
- `electron/mainWindowSurfacePolicy.mts:192-250` owns position-only reachability and calls `win.setPosition`; it never resizes the window.
- MR0 final review reports Windows manual validation PASS, while the later risk guard deliberately leaves the chain OPEN/reachable. Static evidence therefore supports a preflight/manual-validation gate, not a claim that Character code cannot begin.

## Normative contracts and tests

- `presentationCompositionContract.test.ts` is the MR0 normative test-only model for pure projections, current-condition retarget, zero scheduled frames at settle, sleep/wake, permanent disposal, stale no-ops, and Reduced Motion.
- `src/architecture/import-guard.test.ts:580-837` defines the leaf restrictions and authority-writer uniqueness to extend for Character.
- Existing focused coverage includes `lifecycle.test.ts`, `projections.test.ts`, `presentationCompletion.test.ts`, `geometry.test.ts`, `motionRecipes.test.ts`, `pointerField.test.ts`, `magnetic.test.ts`, `compactPointerHotspot.test.ts`, `electron/mainWindowSurfacePolicy.test.mts`, `electron/preloadBridgeContract.test.mts`, and `src/architecture/windows-risk-path.test.ts`.

## Planning conclusion

Use a compact-only inline SVG Character leaf, mounted through the existing presence boundary. Keep Body/Ears/Eyes persistent. Derive clamped attention from the one Pointer Field, use MotionValue/spring transforms only while retargeting, use one deterministic low-duty blink timer when eligible and not reduced/hidden, and dispose all local work on replacement. Do not add Canvas, a shared runtime, a gesture/expression engine, or any native/Electron frame path.
