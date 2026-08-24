# MR1 Expanded Dot Field Substrate

## Goal

Implement the first real MR0 consumer: a quiet Expanded Window Dot Field that is Surface-owned, disposable, sleep/wake capable, current-condition retarget capable, reduced-motion compliant, performance-bounded, and zero-idle-frame when settled.

## Requirements

- Use the committed clean baseline at `3429917`, which contains M0-M2 plus MR0 contracts. Paused M3 dirty changes remain isolated in `D:/Ameow/.cindy-worktrees/auto-o3p8cr` and are not dependencies.
- `MainWindowPresentationSurface` remains composition/event wiring; lifecycle and Pointer Field authorities remain unique.
- Use a consumer-specific Canvas 2D + local rAF runtime. No global bus, manager, renderer abstraction, generic scheduler, FIFO, graphics dependency, or M3 visual migration.
- Render a deterministic, bounded, low-weight regular dormant grid with theme-derived material and no business semantics.
- Surface Click and Context Open create finite/clamped Dot Field-local discrete origins after existing gesture exclusions; no second continuous pointer authority.
- Maintain persistent baseline separately from one latest-replaces transient. Retarget from current rendered values and settle to the latest baseline.
- Implement mount/wake, active one-frame scheduling, settle, sleep, rebuild, permanent dispose, and stale-generation no-op semantics.
- Reduced motion keeps a brief localized brightness acknowledgement and removes travel/displacement/continuous deformation.
- Hard-bound dot count, DPR/backing store, material magnitude, duration, transient count, and pending frame count.
- Dormant, settled, sleeping, and disposed states have zero pending Dot Field frames. React/Main/preload/IPC/native policy do not participate per-frame.

## Acceptance criteria

- [ ] Real Canvas consumer tests prove deterministic bounded topology, normalized origins, baseline/transient separation, latest-baseline restoration, bounded material, soft absorption, latest-replaces/current-condition retarget, reduced motion, lifecycle, dispose, stale no-op, and zero idle frames.
- [ ] Surface tests prove click exclusions and context origin capture without changing existing drag/shortcut/menu behavior.
- [ ] Architecture guards prove no Product/Download/lifecycle/native/IPC authority leakage and preserve lifecycle/Pointer Field writer uniqueness.
- [ ] Full test, type-check, lint, build, and diff checks pass.
- [ ] Executable Windows validation covers both themes, motion/reduced motion, bursts, exclusions, sleep/wake, disposal, DPR, and no per-frame cross-layer path.

## Out of scope

Download/Progress/Intake/Terminal semantics, Flat Blob Cat, compact Character, Pointer Field replacement, lifecycle rewrite, Windows correctness repairs, paused M3 migration, shared motion/renderer infrastructure, MR2 or later work.
