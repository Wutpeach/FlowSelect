# Ameow OneWorks Mascot Visual Candidate, Lab-only implementation report

Date: 2026-08-25

## Decision and stop point

**Visual GO for entering Production Adoption Planning.** The single candidate clears this stage's visual bar: it is recognizable at the real 60 px decision size, coherent at the conservative moderate yaw and pitch, and retains attached ears, sane depth ordering, and face masking through the retained 360° mechanism sweep.

This is not a production migration or package-adoption approval. It grants no Architecture PASS and makes no change to the production Compact renderer, its definition/runtime/recipe, Pointer Field, lifecycle, native/Electron path, Product state, production entry/build graph, or archived diamond-ear baseline. No commit or archive was created.

## Canonical candidate and reproducibility

The only canonical Lab candidate is [`canonical-candidate.json`](./canonical-candidate.json):

| Fact | Value |
| --- | --- |
| Candidate ID | `ameow-oneworks-cat-2026-08-25-v1` |
| Schema | `1` |
| Stable checksum | `fnv1a32:eb514f72` |
| Upstream source reference | `oneworks-ai/avatar` `3ad2542ea4487e95884f313b84943df602c0e742` |
| Installed Lab packages | `@oneworks/avatar` and `@oneworks/avatar-react` `1.0.0-rc.6` |

`src/lab/oneworksAmeowCandidate.ts` creates the definition, canonicalizes it through the public upstream `serializeAvatarDefinition` / `parseAvatarDefinition` path, stable-sorts the export payload, and checks its FNV-1a checksum on reload. The Inspector's **Export current candidate JSON** action produces the deterministic current definition; **Reload canonical candidate** recreates and reloads the canonical payload without `localStorage`, Product state, desktop storage, or an Electron bridge. `oneworksAmeowCandidate.test.ts` proves deterministic repeated serialization, browser-export artifact equality, upstream-parser round trip, and checksum tamper rejection.

## Visual calibration

The calibrated definition preserves the upstream three-part cat mechanism: two rounded procedural `cone` ears with `occludedByFace`, and one face-bearing `ellipse` head. No cone geometry, projection, depth sorting, mask, or Editor control was copied or reimplemented.

- Ameow blue body/ears/head: `#b9ccff`, against a restrained dark `#121827` frame.
- Head: `0.78 × 0.70`; ears: `0.27 × 0.31`, `roundness: 64`, roots at `±61/-82/-10`.
- Face: 40-unit gap, 26-unit width, 60-unit height, small enabled nose; camera scale `1.28`.
- The actual upstream `AvatarEditor` remains the controlled, Inspector-local calibration host. Its updates feed all previews and the current export only.

The short [`calibration notes`](./calibration-notes.md) retain the rationale; there are no alternate candidate definitions or generic configuration infrastructure.

## Product-decision and motion evidence

All captures are element crops or compact sheets, not full-page images.

| Review surface | Evidence | Result |
| --- | --- | --- |
| Canonical front | [front](./evidence/candidate-product-front.png) | Clear Ameow-specific cat read and rounded ear tips. |
| Moderate yaw, `0.22 rad` | [moderate yaw](./evidence/candidate-product-moderate-yaw.png) | Root fusion remains coherent; no detached ears or face leakage. |
| Moderate pitch, `-0.13 rad` | [moderate pitch](./evidence/candidate-product-moderate-pitch.png) | Silhouette and face remain legible. |
| Actual 60 px decision specimen | [true 60 px](./evidence/candidate-true-60-front.png) | Recognizable at the intended size; ear tips retain a readable separation. |
| Production-input pointer policy | [normal and Reduced Motion](./evidence/candidate-pointer-normal-reduced.png) | Center/dead-zone and outer radius recenter to neutral; normal peak reaches the moderate pose; Reduced Motion returns the static canonical candidate. |
| Action meanings | [idle and actions](./evidence/candidate-action-previews.png) | `surprised` broadens the eye read, `curious-short` tilts face/view, and `playful-short` exposes the mouth. |
| Complete rotation regression | [360° yaw sweep](./evidence/candidate-360-yaw-sweep.png) | Nine compact samples cover rear, rear-left/right, tangents, and front. Ears remain attached and depth/masking stays coherent. Rear/tangent personality is not evaluated as front-facing. |
| Source and existing baseline comparison | [source / candidate / diamond](./evidence/candidate-source-candidate-diamond-comparison.png) | The candidate is visibly distinct from the pinned Route A cat reference and from the frozen diamond-ear production baseline. The source column is normalized from the prior Route A pinned-cat fixture, not a byte-identical package-default framing. The archived diamond does not have pose-matched evidence. |
| Upstream authoring surface | [Editor calibration](./evidence/candidate-editor-calibration.png) | Direct upstream editor exposes the selected candidate geometry and calibration controls. |

## Production-like attention, actions, and Reduced Motion

The Lab imports the existing pure `resolveCompactMascotAttention` recipe. Its production input facts are unchanged: 3 px dead zone, 46 px response radius, cosine approach/recenter, normal eye bounds `X=11/Y=7.5`, and Reduced Motion eye bounds `X=6/Y=4` in the 300-unit Compact viewBox.

Production remains eye-only. For visual evaluation only, normal input is projected into the explicitly Lab-local conservative envelope `±0.28 rad` yaw and `±0.16 rad` pitch. Reduced Motion still invokes the production reduced branch for the readout but displays zero yaw/pitch, stops decorative playback, and restores the static canonical candidate. This mapping is not current production head-pose authority.

The four Inspector controls are `idle`, `surprised`, `curious-short`, and `playful-short`. The three actions use public upstream animation-library clips (`once` playback); the capture applies each public clip's meaningful middle keyframe as a deterministic review still. This preserves meaning and bounded inspectability, not the archived renderer's pixel or timing identity.

## 360° and lifecycle result

The retained sweep is `−180°, −135°, −90°, −55°, 0°, +55°, +90°, +135°, +180°`. The duplicated `±180°` cells deliberately show rotation closure. The browser review found no detached ear, broken depth/occlusion, or unexpected face leakage; rear/tangent views have the expected non-front-facing face behavior.

The Inspector remains Lab-local and conditionally tears down its upstream region. It stops upstream handles on Reduced Motion, explicit unmount, visibility-hidden, and component cleanup. It reports only mounted/torn-down state, not an invented loop metric. Prior Route A browser instrumentation remains the lifecycle mechanism record: OneWorks playback rAF returns to non-spike baseline after Reduced Motion, unmount, and hidden-visibility teardown; the residual Vite HMR and Agentation intervals pre-existed the Inspector and are not attributed to the spike.

## Comparison with the frozen diamond baseline

The frozen approved diamond-ear Compact remains a valid production result and was not modified. At true 60 px the difference is necessarily subtle, but the candidate retains readable rounded tips and a compact recognizable silhouette. At magnified and moderate pose it visibly demonstrates the representation fidelity that the prior Route A research identified: cone shoulders, shared-pose depth, and face-derived partial root masks. The comparison supports a visual-planning GO, not replacement of the production diamond, tuning of its geometry, or adoption of a new renderer.

## Isolation, cost, and preservation

- `@oneworks/avatar` and `@oneworks/avatar-react` remain exact `1.0.0-rc.6` **devDependencies**.
- `Avatar`, `AvatarEditor`, upstream CSS, candidate, and Inspector enter only through `lab.html` / `vite.lab.config.ts`. The production `index.html` build does not contain OneWorks, `AvatarEditor`, Inspector, candidate, or Lab-only identifiers.
- Lab build output: `lab-N8-nYQ4w.js` is 1,356,671 B; CSS is 65,368 B; existing lazy `html2canvas` chunk is 199,566 B. These are Lab-only artifact costs, not a production adoption estimate.
- [`protected-baseline.json`](./protected-baseline.json) records pre-edit SHA-256 hashes for every protected production file and representative unrelated dirty files. Final hash verification confirms all recorded values remain unchanged.

## Validation

| Command / check | Result |
| --- | --- |
| `npx vitest run src/lab/oneworksMascot.test.ts src/lab/oneworksAmeowCandidate.test.ts src/lab/OneWorksMascotInspector.test.ts src/lab/rendererReuse.test.ts src/architecture/import-guard.test.ts` | PASS, 11 files / 184 tests. |
| `npx vitest run src/architecture/import-guard.test.ts` | PASS, 5 files / 102 tests. |
| `npm run type-check` | PASS. |
| `npm run lint` | PASS. |
| `npm run build` | PASS. |
| `npx vite build --config vite.lab.config.ts --outDir .trellis/tasks/08-25-oneworks-ameow-mascot-visual-candidate/lab-build` | PASS. |
| Production `dist/` identifier scan | PASS, zero OneWorks / AvatarEditor / Inspector / candidate / Lab matches. |
| `node .trellis/tasks/08-25-oneworks-ameow-mascot-visual-candidate/capture-candidate-browser-evidence.mjs` | PASS in Edge, zero page errors; [`candidate-browser-result.json`](./evidence/candidate-browser-result.json) records the candidate checksum and evidence set. |
| Task-scoped `git diff --check` | PASS. |

## Not verified

- Registry artifacts are mechanism-equivalent for the Route A paths used, but byte/build provenance to the pinned revision is not claimed.
- Electron/native, macOS, packaged `file://`, real production lifecycle, production Pointer Field integration, and production head-pose policy were not exercised.
- Package adoption, bundle tradeoff for production, migration/rollback architecture, action pixel/timing identity, and Editor persistence behavior are intentionally not decided here.
