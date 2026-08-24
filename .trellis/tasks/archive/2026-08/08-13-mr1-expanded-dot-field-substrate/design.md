# MR1 Expanded Dot Field - Approved Design

## Ownership

```text
presentation projection + theme + stable geometry
  -> MainWindowPresentationSurface
     -> Surface-owned Dot Field Canvas consumer
        -> local rAF runtime -> pixels
```

The runtime receives plain baseline inputs and Dot Field-local interaction intents. It cannot dispatch lifecycle, mutate Product/Download, access desktop/Electron/IPC/native state, write Pointer Field, or publish completion.

## Baseline and transient

Persistent baseline is deterministic grid geometry plus current theme material, logical size, bounded DPR, eligibility, and reduced-motion preference. Transient state is private per-dot response values, one current intent, one frame handle, and local generation/sleep/dispose flags. Transients add to and settle back to the latest baseline.

## Interactions

Surface Click reuses the existing pointer gesture path and submits only after drag, cancel, interactive control, compact expansion, context-close, and double-click shortcut paths are excluded. Context Open captures synchronous client coordinates before continuing the existing App/native menu callback. Origins stay local normalized snapshots.

## Lifecycle

Eligibility uses the existing visual projection: `mode === "full" && transitionEpoch === null`. Wake rebuilds and draws once. Active runtime has at most one rAF. Latest intent replaces and retargets from current values. Settle cancels scheduling. Eligibility exit invalidates/cancels and sleeps. Re-entry rebuilds from current inputs. Unmount permanently disposes; captured stale generations no-op.

## Rendering and motion

Canvas 2D is consumer-specific. Brightness dominates scale; displacement may be omitted. Use a soft local front and boundary attenuation, no collision/reflection/wrap/radar ring. Reduced motion uses localized brightness without travel. No new dependency or generic graphics/runtime abstraction.

## Validation

Pure policy and fake-scheduler tests run under existing Node Vitest; Canvas/scheduler primitives are narrow injected collaborators, not a framework. Extend MR0 import guards and run Windows Electron/manual performance evidence. Existing Windows correctness risks remain out of scope.
