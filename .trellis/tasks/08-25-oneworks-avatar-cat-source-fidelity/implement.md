# Implementation plan — OneWorks Avatar Lab-only source-fidelity spike

1. Verify package/source provenance for the cat preset, renderer, public `Avatar`/`AvatarEditor` exports, and exact revision; choose the smallest reproducible direct-consumption path.
2. Add exact upstream packages in development-only scope and keep their stylesheet reachable only from the Lab entry.
3. Add one Lab-owned Mascot Inspector that shares a controlled definition/pose across 60 px and magnified `Avatar` views plus the upstream `AvatarEditor`.
4. Add deterministic front/yaw/pitch/tangent presets, a Lab-local pointer adapter, Reduced Motion behavior, animation inspection, and mount/remount controls without importing production authority modules.
5. Extend Lab/import tests for upstream direct reuse, cleanup, browser-only boundaries, dev-only dependency placement, and production graph exclusion.
6. Run focused tests, type-check, lint, production build, Lab build/bundle inspection, and browser validation.
7. Capture tightly cropped evidence and write an implementation/validation report with mechanism-level findings, actual cost, limitations, and an explicit stop before production migration or Architecture PASS.

## Expected change boundary

- `package.json` / `package-lock.json`: exact development-only upstream packages.
- `src/lab/**`: Inspector, minimal Lab integration, Lab-only styles/state/tests.
- Existing Lab isolation/import tests: prove production exclusion.
- `.trellis/tasks/08-25-oneworks-avatar-cat-source-fidelity/**`: evidence and report.

Explicitly unchanged: `src/presentation/main-window/CompactMascot*`, Compact definitions/runtime/recipe, lifecycle, production Pointer Field, Electron/native code, Product state, production Vite entry, archived tasks/evidence.

## Validation commands

- Focused Vitest for new Inspector and existing Lab isolation/Compact authority tests.
- `npx vitest run src/architecture/import-guard.test.ts`
- `npm run type-check`
- `npm run lint`
- `npm run build`
- A Lab-only Vite production build or equivalent bundle report that identifies OneWorks/editor cost separately.
- Browser evidence capture at `http://127.0.0.1:1421/lab.html`.

## Stop gates

- Stop and report if exact-revision source cannot be consumed reproducibly without widening production scope.
- Stop and classify, rather than porting geometry, if a mechanism-level renderer/authority/lifecycle incompatibility appears.
- Do not begin production migration, Route B/C work, archived ear recalibration, Architecture Review, commit, or archive unless separately requested.
