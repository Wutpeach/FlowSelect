# Design — Ameow OneWorks mascot visual candidate

## Boundary

This stage extends only the existing browser-only Mascot Inspector. It introduces a canonical Lab candidate and a production-like preview policy. It does not create a production renderer adapter.

```text
canonical Lab candidate definition
  -> upstream Avatar at true 60 px
  -> upstream Avatar magnified preview
  -> upstream AvatarEditor (controlled definition)
  -> 360 geometry inspection
  -> production-like pointer/action/reduced-motion preview
```

The existing production graph remains unchanged and continues to render the archived diamond mascot.

## Candidate ownership and persistence

- One Lab-owned candidate module/artifact is the canonical checked-in definition.
- It records the OneWorks source revision, package version, candidate schema/version, and stable identity/checksum.
- The Editor remains controlled by Inspector-local state. An explicit export action serializes the current definition deterministically for review and later synchronization into the canonical candidate.
- A round-trip test loads the canonical export and renders the same semantic definition. No localStorage, Electron bridge, production config, or Product store is required.

## Production-like pointer policy

Production repository facts remain authoritative for input semantics:

- dead zone: 3 px;
- response radius: 46 px;
- response intensity: one cosine cycle that is zero at the center/dead-zone and outer radius, with peak midway;
- Reduced Motion uses the same semantic curve with a smaller response.

The existing production result is eye displacement, not head pose. The candidate preview therefore derives a normalized attention vector from the exact production curve, then maps it to one clearly named Lab-only moderate yaw/pitch envelope. The envelope is calibrated visually against 60 px identity and saved with the candidate preview policy. It is evidence for later planning, not production authority.

## Action preview

- Use the public OneWorks animation-library/definition API.
- Provide deterministic controls for idle, surprised, curious-short, and playful-short so evidence does not depend on waiting 18–32 seconds.
- Retain the current action meanings and bounded cadence, but do not claim pixel/timing identity with the archived renderer unless measured.
- Reduced Motion stops playback and returns to a static candidate state.

## Visual calibration loop

1. Start from the verified upstream cat mechanism.
2. Use `AvatarEditor` to adjust only definition-level geometry/material/face/framing parameters.
3. Evaluate true 60 px front and production-like moderate envelope first.
4. Check magnified ear-root masks and silhouette.
5. Re-run the complete 360-degree sweep for mechanism regressions.
6. Keep the smallest set of candidate snapshots necessary to explain the final choice; one canonical candidate survives.

The visual bar is recognizably Ameow at 60 px, stable under the production-like envelope, coherent ear-root occlusion, and readable face/expression. Extreme rear/tangent personality is not an acceptance gate.

## Comparison and decision gate

The evidence sheet must place the final candidate against:

- upstream default cat, showing which definition-level changes establish Ameow identity; and
- archived approved diamond neutral/front evidence, showing the current production visual baseline.

The final GO/NO-GO concerns only entry into Production Adoption Planning. A GO does not select a migration architecture or grant Architecture PASS.

## Isolation and rollback

- Candidate, preview policy, actions, export control, tests, captures, and report stay in `src/lab/` and the task directory.
- Existing production import guards must remain green and may be strengthened for the new candidate artifact.
- Rollback is deletion of the new Lab candidate/preview additions; production behavior requires no rollback.
