# Repository Isolation Evidence

Checked against clean `D:/Ameow/.cindy-worktrees/mr9-fullscreen-activation-fx` at `431114a`.

## Stable Line

- Branch/worktree: `motion/mr9-fullscreen-activation-fx`
- HEAD: `431114af4f44619483f1b700554f3f47f1b86619`
- Production localized Thermal work commit: `0e24a7a`
- Worktree status during planning: clean

Implementation must use a new branch/worktree from 431114a. The stable worktree is evidence and
comparison input only.

## Browser Lab Isolation

- `package.json` exposes `npm run dev:lab`.
- `vite.lab.config.ts` serves only on `127.0.0.1:1421`.
- `lab.html` loads `src/lab/lab-main.tsx`.
- `lab-main.tsx` has no Electron bridge and mounts `PresentationLab` under existing Lab providers.
- Production `vite.config.ts` keeps `index.html` as the production input; Lab sources are excluded.

## Current Normal Preview Contract

`PresentationLab` renders one `LabOverlayStage`, which renders one
`ExpandedPresentationSurface`. `rendererReuse.test.ts` asserts that Lab code authors no canvas,
shader, runtime, or draw call and only introspects the production WebGL2 program.

The official Paper scenario deliberately does not fit that contract: source fidelity requires
Paper's imported `ShaderMount` to create its own canvas and own preprocessing/RAF lifecycle. The
minimal exception is a mutually exclusive sibling branch in `PresentationLab`. Existing scenario
tests and renderer-reuse assertions remain unchanged in meaning; only their scope is clarified so
the imported official component is allowed in its one isolated file/scenario.

## Constraints That Still Apply

- Browser-only, dev-only, no Electron/desktop bridge.
- Excluded from production build and package behavior.
- No Product, Application, Download, extension, native-window, lifecycle, or policy state.
- No production renderer or presentation file changes.
- No second visible silhouette or UI geometry.
- Existing Production Thermal, Refraction, boundary, palette, motion, timing, and reduced-motion
  behavior remains untouched.

## Historical Spike Boundary

The archived 08-21 Paper geometry/rendering-domain task used an Ameow-authored static processed
texture and Paper-derived scalar composition. Lead review rejected its visible perimeter, clipped
outer field, shadow coexistence, and interaction evidence. Those findings do not authorize tuning
in this task. The new experiment tests the official moving component before any adaptation and
must not reuse that implementation.
