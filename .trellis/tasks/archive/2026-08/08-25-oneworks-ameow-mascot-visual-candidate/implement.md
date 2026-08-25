# Implementation plan — Ameow OneWorks mascot visual candidate

1. Lock repository facts for the current Compact attention curve, Reduced Motion response, actions, 60 px shell, archived diamond baseline, and the completed Route A Inspector.
2. Add one canonical Lab-only Ameow candidate definition and deterministic export/round-trip contract with source/package/candidate identity metadata.
3. Extend the existing Inspector with a product-decision preview: true 60 px plus magnified view, exact production attention response/recenter semantics, and a labeled conservative Lab-only yaw/pitch envelope.
4. Expose deterministic idle, surprised, curious-short, and playful-short previews through the public OneWorks animation API; keep Reduced Motion static.
5. Use the actual upstream `AvatarEditor` and controlled calibration loop to converge head, rounded-cone ears, ear-root fusion, face/expression, palette, and framing into one final candidate.
6. Re-run the complete 360-degree sweep and candidate round-trip/import-isolation tests.
7. Capture tightly cropped evidence for front/moderate yaw/moderate pitch/60 px, pointer center/peak/recenter/Reduced Motion, actions, 360 mechanism integrity, and three-way candidate/default/diamond comparison.
8. Run focused tests, import guard, type-check, lint, production build/import scan, Lab build, browser validation, and evidence-review checks.
9. Write an implementation/visual validation report with the canonical candidate identity, calibration decisions, limitations, and GO/NO-GO for Production Adoption Planning; stop before migration or Architecture PASS.

## Expected change boundary

- `src/lab/**`: canonical candidate, production-like preview policy/UI, action fixtures, export/save path, and focused tests.
- Existing Lab isolation tests where needed.
- `.trellis/tasks/08-25-oneworks-ameow-mascot-visual-candidate/**`: calibration log, candidate export, capture scripts, tightly cropped evidence, and report.

Explicitly unchanged: `src/presentation/main-window/CompactMascot*`, production compact definition/runtime/recipe, lifecycle, `pointerField.ts`, Main Window surface, Electron/native, Product state, production entry/config, archived tasks/evidence, and public docs.

## Validation

- Focused Vitest for candidate identity/round-trip, exact production attention semantics, envelope bounds/recenter, actions, Inspector integration, and Lab isolation.
- `npx vitest run src/architecture/import-guard.test.ts`
- `npm run type-check`
- `npm run lint`
- `npm run build`
- Lab-only build and production `dist` scan.
- Browser evidence with zero task-caused page errors and tightly cropped sheets.

## Stop gates

- If candidate tuning reveals a mechanism-level upstream geometry/occlusion regression, report it instead of porting geometry.
- If no candidate reaches the 60 px/product-envelope visual bar after a bounded calibration loop, return visual NO-GO with evidence rather than changing production.
- Do not start Production Adoption Planning implementation, migration, Architecture Review/PASS, commit, or archive without separate authorization.
