# OneWorks Avatar Route A, Lab-only implementation report

Date: 2026-09-07 (current-source evidence refresh)

## Scope and stop point

This is a browser-only UI Lab source-fidelity spike. It mounts the published OneWorks `Avatar` and `AvatarEditor` inside the existing Lab. It does not change `CompactMascot*`, Compact definitions/recipes/runtime, production Pointer Field/lifecycle, Electron/native code, Product state, `src/main.tsx`, public docs, or archived mascot work.

**Stop:** this checkpoint does not authorize a production migration, Route B/C, package adoption, or Architecture PASS.

## Consumption path and mechanism equivalence

- Required source baseline: `oneworks-ai/avatar` revision `3ad2542ea4487e95884f313b84943df602c0e742`.
- Direct Lab dependency: exact registry `@oneworks/avatar-react@1.0.0-rc.6` and `@oneworks/avatar@1.0.0-rc.6`, both in `devDependencies`.
- [`verify-oneworks-mechanism-equivalence.mjs`](./verify-oneworks-mechanism-equivalence.mjs) fetches the four pinned source files, reads the installed React artifact/declarations, and writes [machine-readable results](./evidence/provenance-mechanism-equivalence.json).
- The check passed. It verifies the exact three-part cat values, procedural cone and roundness path, shared pose/depth sorting, `occludedByFace` mask/depth behavior, and public `Avatar`/`AvatarEditor` exports. The installed package versions are both `1.0.0-rc.6`.
- This is **mechanism equivalence for the paths used by the spike**, not artifact provenance: byte identity was not checked, and the registry artifact is not claimed to be a build of the pinned revision. The source and artifact SHA-256 values are retained in the JSON only to identify the checked inputs.

## Implementation and simplification

- [`src/lab/oneworksMascot.ts`](../../../../src/lab/oneworksMascot.ts) owns one controlled upstream cat definition, deterministic front/yaw/pitch/tangent/sweep views, a bounded Lab-local pointer adapter, and a public animation-library fixture. It does not port geometry or read production Pointer Field authority.
- [`src/lab/OneWorksMascotInspector.tsx`](../../../../src/lab/OneWorksMascotInspector.tsx) directly imports upstream `Avatar`, `AvatarEditor`, and upstream CSS. The controlled definition feeds the true 60px view, magnified view, and Editor. Editor updates remain Inspector-local.
- [`src/lab/PresentationLab.tsx`](../../../../src/lab/PresentationLab.tsx) adds only the Lab-mode entry and return action. [`vite.lab.config.ts`](../../../../vite.lab.config.ts) explicitly builds `lab.html`; production Vite remains index-only.
- The simplification pass removed the redundant remount key, lifecycle counter component/state, and memoized static animation lookup. Remount now relies on the actual conditional unmount/remount. The permanent UI reports neutral mounted/torn-down state only. It no longer claims a hardcoded loop count.
- The existing Lab isolation guard was extended for the direct renderer/editor/CSS route and production exclusion. Focused tests retain the direct-upstream, shared-definition, browser-only, dev-only, pointer-authority, and cleanup-boundary checks.
- The current candidate attention host intentionally retains `data-oneworks-pointer-adapter` alongside its candidate-specific marker. This stable Lab-only capture contract is asserted by the focused Inspector test; it does not change pointer behavior or production authority.

## Browser lifecycle evidence

[`capture-oneworks-browser-evidence.mjs`](./capture-oneworks-browser-evidence.mjs) was rerun on 2026-09-07 against the current browser Lab and installs Playwright instrumentation before any page code. It wraps `requestAnimationFrame`, `setTimeout`, and `setInterval`; results are recorded in [lifecycle instrumentation JSON](./evidence/oneworks-lifecycle-instrumentation.json).

| State | rAF | intervals | timeouts | Finding |
| --- | ---: | ---: | ---: | --- |
| Lab baseline | 0 | 2 | 0 | Vite HMR at 30,000ms and Agentation at 120ms already exist. |
| `Play sweep` | 2 | 2 | 0 | Both rAF callbacks originate in the direct OneWorks bundle. |
| Reduced Motion | 0 | 2 | 0 | Playback rAF settles to baseline. |
| Explicit unmount | 0 | 2 | 0 | No spike-owned scheduled work remains beyond baseline. |
| Explicit remount | 0 | 2 | 0 | Reconstructed Inspector is idle. |
| Hidden visibility teardown | 0 | 2 | 0 | Lab visibility handler returns to baseline. |
| Visible remount | 0 | 2 | 0 | Reconstructed Inspector remains idle. |

The two remaining intervals existed before the Inspector opened and remain after it unmounts. Their owner stacks identify Vite HMR and the existing Agentation Lab toolbar, not the spike. No OneWorks rAF, timeout, or interval remains after Reduced Motion, explicit unmount, or the simulated hidden-visibility teardown. The [instrumentation sheet](./evidence/oneworks-lifecycle-instrumentation.png), [JSON](./evidence/oneworks-lifecycle-instrumentation.json), and neutral [remount control](./evidence/oneworks-remount-lifecycle.png) are the reviewable lifecycle record.

## Visual evidence

All images below were regenerated on 2026-09-07 from the current source as element-level captures or compact composition sheets. The stable pointer marker captures the candidate product panel; the separate mechanism preview captures yaw, pitch, and tangent after changing its scoped pose control, so those screenshots cannot silently remain at the pointer panel's front pose.

| State | Evidence | Finding |
| --- | --- | --- |
| Front, true 60px and magnified | [front](./evidence/oneworks-front-60-magnified.png) | One definition and pose drive both upstream views. |
| Key yaw | [yaw](./evidence/oneworks-yaw-60-magnified.png) | Ear attachment and depth remain coherent. |
| Key pitch | [pitch](./evidence/oneworks-pitch-60-magnified.png) | No detached ear wedges appear. |
| Tangent | [tangent](./evidence/oneworks-tangent-60-magnified.png) | Expected face/silhouette behavior, not a renderer failure. |
| Complete 360° yaw sweep | [sweep](./evidence/oneworks-pose-sweep-sheet.png) | −180°, −135°, both tangents, front, +135°, and +180° closure are compactly reviewable with no cropped blank area. Rear/tangent views retain attached ears, stable depth/occlusion, and no unexpected face leakage. ±180° are intentionally duplicated to show rotation closure. |
| Pointer adapter | [pointer](./evidence/oneworks-pointer-follow.png) | Lab-local input drives bounded upstream yaw/pitch only. |
| Reduced Motion | [reduced](./evidence/oneworks-reduced-motion.png) | Static front state after optional playback stops. |
| Editor geometry and presets | [geometry/presets](./evidence/oneworks-editor-geometry-presets.png) | Actual upstream Editor stage, saved presets, face controls, and editable geometry values. |
| Editor animation | [animation](./evidence/oneworks-editor-animation.png) | Actual upstream Playback selector lists its built-ins and the injected `Yaw sweep` public-library clip. |
| Archived baseline comparison | [comparison sheet](./evidence/oneworks-vs-approved-diamond-front.png) | Direct review only. It uses the archived approved neutral/front 1× image and the new true-60px OneWorks capture. The archived diamond has no pose-matched sweep. |

At magnified scale, the direct OneWorks renderer materially exceeds the archived diamond in silhouette fidelity, rounded ear shoulders/tips, and face-derived partial ear-root masking; shared transformed depth remains coherent through the recorded yaw/pitch/tangent poses. At the true 60px front specimen, the source-fidelity improvement remains visible but subtler and does not by itself establish a user-visible production win. The approved diamond-ear result remains frozen and valid for its existing Compact gate. This comparison does not imply production adoption or recalibration.

## Validation

| Command / check | Result |
| --- | --- |
| `node .trellis/tasks/08-25-oneworks-avatar-cat-source-fidelity/verify-oneworks-mechanism-equivalence.mjs` | PASS, `mechanismEquivalent: true`; byte/build provenance explicitly not proven. |
| `npx vitest run src/lab/oneworksMascot.test.ts src/lab/OneWorksMascotInspector.test.ts src/lab/rendererReuse.test.ts src/architecture/import-guard.test.ts` | PASS on 2026-09-07, 10 files and 176 tests. |
| `npx vitest run src/architecture/import-guard.test.ts` | PASS, 5 files and 102 tests. |
| `npm run type-check` | PASS. |
| `npm run lint` | PASS. |
| `npx eslint vite.lab.config.ts --ext .ts` | PASS. |
| `npm run build:renderer` | PASS on 2026-09-07. The current normal `dist/` scan finds no `@oneworks/avatar`, `AvatarEditor`, `OneWorksMascotInspector`, or `src/lab` identifiers. |
| `npm run build` | Not rerun: its `prebuild` locale-sync can overwrite an unrelated dirty generated locale artifact. Renderer build isolation is covered by the passing `build:renderer` command; Electron type safety is covered by `npm run type-check`. |
| `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/08-25-oneworks-avatar-cat-source-fidelity/lab-build` | PASS. |
| `node .trellis/tasks/08-25-oneworks-avatar-cat-source-fidelity/capture-oneworks-evidence.mjs` | PASS, zero page errors. The current built-Lab capture records baseline settlement after Reduced Motion and explicit unmount. |
| `node .trellis/tasks/08-25-oneworks-avatar-cat-source-fidelity/capture-oneworks-browser-evidence.mjs` | PASS, zero page errors. The evidence records two playback rAF callbacks; the script asserts playback exceeds baseline, then that Reduced Motion, unmount, remount, hidden visibility teardown, and visible remount return rAF/timeouts/intervals to the two-interval Lab baseline. |
| `npx vitest run src/lab/oneworksAmeowCandidate.test.ts` | Unavailable: its startup reads the missing `.trellis/tasks/08-25-oneworks-ameow-mascot-visual-candidate/canonical-candidate.json`. That historical task is outside this spike and was not recreated or changed. |

## Cost and isolation

- Published installed `@oneworks/avatar-react` artifact: `318,589 B` JavaScript and `65,529 B` CSS.
- Final Lab-only build: `1,356,706 B` main JavaScript (`lab-CyBnhGRt.js`) plus `199,566 B` lazy `html2canvas` JavaScript, and `65,368 B` CSS. This includes the existing Lab/editor graph and is not a production adoption estimate.
- Normal production renderer entry build: `884,970 B` JavaScript and `18,508 B` CSS. The production isolation scan passed.
- Upstream CSS is imported only by `src/lab/OneWorksMascotInspector.tsx`; production `index.html`, `src/main.tsx`, and Vite build input remain free of the editor/Lab graph.

## Mechanism verdict and limits

**Route A mechanism in the browser Lab: GO.** The direct registry renderer preserves the pinned cat mechanisms verified above, accepts Lab-local pose/pointer input, reaches deterministic Reduced Motion, and tears down Inspector-owned scheduled work. The upstream Editor is usable for visual geometry, preset, and animation inspection without recreating its control panel.

**NOT VERIFIED:** byte/build provenance of registry artifacts to the pinned revision; Electron/native or macOS behavior; actual production Compact lifecycle/pointer integration; production package/adoption decision; and Editor persistence/storage behavior. No Architecture PASS, migration, commit, or archive was created.

## Changed files

- `package.json`, `package-lock.json`
- `vite.lab.config.ts`
- `src/lab/PresentationLab.tsx`
- `src/lab/OneWorksMascotInspector.tsx`
- `src/lab/oneworksMascot.ts`
- `src/lab/OneWorksMascotInspector.test.ts`
- `src/lab/oneworksMascot.test.ts`
- `src/lab/rendererReuse.test.ts`
- Task-local report, reproducible equivalence/evidence scripts, JSON evidence, images, and Lab build output

No unrelated files were intentionally changed, committed, or archived.
