# Shape Ameow OneWorks mascot visual candidate

## Goal

Use the validated OneWorks renderer and upstream `AvatarEditor` to converge the mechanism sample into one reproducibly saved, Lab-local Ameow mascot definition, then decide from production-like Compact evidence whether it has reached the visual threshold for Production Adoption Planning.

## Background

- Route A browser-Lab mechanism is already GO at upstream revision `3ad2542ea4487e95884f313b84943df602c0e742` with registry packages `1.0.0-rc.6`.
- The existing Inspector directly mounts upstream `Avatar` and `AvatarEditor`, supports a complete 360-degree yaw sweep, and remains excluded from the production import graph.
- Current production Compact pointer attention is eye-only. It uses a 3 px dead zone, 46 px response radius, cosine approach/recenter curve, normal bounds X=11/Y=7.5 in a 300-unit viewBox, and smaller Reduced Motion bounds X=6/Y=4. It does not define a production head yaw/pitch range.
- The archived diamond-ear mascot remains a valid frozen production baseline and is not modified in this task.

## Requirements

### R1 — Ameow candidate definition

- Produce one Ameow-specific OneWorks definition using the upstream renderer and `AvatarEditor`, without modifying or recreating upstream geometry/projection/masking mechanisms.
- Tune head silhouette, rounded-cone ear dimensions/position/rotation, ear-root fusion, face placement/expression, palette, and framing for recognizability at true 60 px and moderate pose.
- Treat the upstream default cat as the mechanism source, not the required final visual identity.
- Keep exactly one final candidate; intermediate calibration variants may be retained only in task-local evidence/logs.

### R2 — Reproducible candidate persistence

- Store the final candidate as one canonical Lab-only, reviewable definition artifact with upstream revision/package metadata and a stable checksum or equivalent identity.
- Provide an explicit Inspector export/save path for the current Editor definition and prove it round-trips back into the same Lab renderer.
- Do not persist the candidate into production config, Product state, desktop storage, or production presentation modules.

### R3 — Production-like Compact preview

- Preserve the complete 360-degree yaw sweep as a geometry/occlusion inspection tool.
- Add a distinct product-decision preview centered on a true 60 px Compact specimen plus a magnified companion.
- Reuse the production attention dead zone, response radius, cosine approach/recenter behavior, and Reduced Motion branch as repository authority.
- Because production has no head yaw/pitch range, calibrate and label one conservative Lab-local OneWorks yaw/pitch envelope. It must stay within moderate poses that preserve 60 px identity and must not be represented as existing production authority.
- Evidence must show center/dead-zone, approach peak, outer-radius recenter, moderate yaw, moderate pitch, and normal-versus-Reduced-Motion behavior.

### R4 — Idle and existing action semantics

- Make idle and the existing Compact action meanings observable: `surprised`, `curious-short`, and `playful-short`.
- Preserve their product meaning and bounded preview timing where practical, while expressing them through the public upstream animation/definition API rather than porting the old renderer.
- Reduced Motion resolves to a deterministic static candidate and suppresses decorative playback.
- Lab playback owns no production lifecycle, timer, pointer, native, Product, or Presentation authority.

### R5 — Visual evaluation

- Evaluate true 60 px first, then magnified front/moderate-yaw/moderate-pitch evidence; extreme 360-degree views inspect mechanism integrity but are not required to look front-facing.
- Compare the final candidate briefly against both the upstream default cat and archived approved diamond mascot.
- The final report must state whether the candidate reaches the visual threshold for entering Production Adoption Planning, with concrete evidence and remaining visual risks.

## Acceptance Criteria

- [ ] One canonical Ameow OneWorks candidate is saved reproducibly, identifiable, exportable, and round-trip tested.
- [ ] The final candidate has tightly cropped front, moderate-yaw, moderate-pitch, and true-60px evidence.
- [ ] The Inspector exposes a production-like pointer preview using the real dead-zone/response/recenter semantics and a clearly Lab-local moderate yaw/pitch envelope.
- [ ] Evidence covers pointer center, approach peak, outer recenter, normal motion, and Reduced Motion side by side.
- [ ] Idle, `surprised`, `curious-short`, and `playful-short` meanings are observable through upstream animation/definition APIs.
- [ ] The complete 360-degree inspection remains available and shows no new geometry/occlusion regression caused by candidate tuning.
- [ ] The report compares the candidate with upstream default cat and archived diamond baseline without changing either baseline.
- [ ] The report gives an evidence-backed GO or NO-GO for entering Production Adoption Planning.
- [ ] Production `CompactMascot`, lifecycle, Pointer Field, native visibility, presentation authority, production imports, and archived mascot files remain unchanged.
- [ ] Work stops before production migration, Architecture Review/PASS, commit, or archive unless separately requested.

## Out of Scope

- Replacing or importing the candidate into production Compact runtime.
- Defining production lifecycle, pointer, native, packaging, dependency, rollback, or migration contracts.
- Rewriting/porting OneWorks geometry, projection, depth sorting, masking, or Editor controls.
- Recalibrating the archived diamond mascot.
- Requiring rear/tangent poses to retain a front-facing cat expression.
- Granting Architecture PASS.
