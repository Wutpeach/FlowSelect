# OneWorks Avatar Lab-only source-fidelity spike

## Goal

Implement a minimal UI Lab-only experiment that directly mounts the OneWorks cat renderer and `AvatarEditor`, then collect evidence showing whether Route A is suitable as Ameow Compact Mascot's geometry and authoring foundation.

## Background

- Upstream source baseline is `oneworks-ai/avatar` revision `3ad2542ea4487e95884f313b84943df602c0e742`.
- Prior research concluded that OneWorks fidelity comes from procedural cone geometry, shared 3D pose/depth, and face-derived partial ear occlusion.
- Ameow's archived diamond-ear implementation passed its own Compact gate but is not the implementation target of this spike.
- This is a source-fidelity experiment, not a production migration or Architecture Review.

## Requirements

### R1 — Direct upstream experiment

- Prefer the public upstream renderer and `AvatarEditor`; do not clean-room rewrite or pre-port geometry.
- Verify whether the exact published `1.0.0-rc.6` artifacts are equivalent for the cat/renderer paths used at the pinned revision. If equivalence cannot be established, use a reproducible exact-revision source build for the spike and record the distinction.
- Keep upstream packages in development-only scope.

### R2 — Mascot Inspector surface

The UI Lab experiment must simultaneously expose:

- an actual 60 px OneWorks cat view;
- a magnified inspection view using the same definition and pose;
- the upstream `AvatarEditor`;
- pose and interaction controls/evidence needed for front, yaw, pitch, tangent, and full-sweep inspection;
- animation or playback inspection supported by the upstream API.

The Inspector should reuse Ameow's existing Lab shell, theme tokens, and control vocabulary. It must not reimplement the upstream editor control panel.

### R3 — Pointer, motion, and lifecycle adapter

- A Lab-local pointer adapter may translate existing pointer semantics into upstream pose/view input, but it must not become a second production Pointer Field authority.
- Reduced Motion must resolve to a deterministic static state with no decorative playback loop.
- Mount, unmount, remount, hidden/visible, and disposal behavior must leave no experiment-owned work running after teardown.
- Production Compact lifecycle, mount/dispose, pointer-follow, native visibility, 60 px shell, and presentation authority remain unchanged.

### R4 — Import and runtime isolation

- `AvatarEditor`, editor CSS, and Inspector tooling may be imported only through the dev-only Lab graph.
- Production entry/build input must remain free of `AvatarEditor`, `src/lab`, and Lab-only tooling.
- No Electron bridge, native window, Product state, lifecycle reducer, or production Compact state may be written by the Inspector.

### R5 — Evidence and decision record

- Capture tightly cropped, reviewable evidence at real 60 px and magnified scale for front and key yaw/pitch/tangent poses.
- Record full pose sweep behavior, pointer adapter behavior, Reduced Motion, mount/dispose, Editor embedding, package/build cost, and production import isolation.
- Compare source fidelity against the current diamond-ear baseline without modifying or recalibrating that baseline.
- Classify failures: CSS, host sizing, convenience API, or preset adaptation do not reject Route A; only renderer, geometry, authority, or lifecycle mechanism incompatibility can do so.

## Acceptance Criteria

- [x] The UI Lab renders one shared upstream cat definition simultaneously at real 60 px and magnified scale beside the actual upstream `AvatarEditor`.
- [x] Evidence covers front and critical yaw/pitch/tangent poses and states whether silhouette, ear-root occlusion, and ear tips materially exceed the current diamond-ear source fidelity.
- [x] A complete pose sweep shows whether depth, occlusion, or silhouette breaks.
- [x] A Lab-local pointer-follow adapter drives upstream pose without modifying production pointer authority.
- [x] Reduced Motion and mount/dispose semantics are verified, including zero lingering experiment work after teardown.
- [x] `AvatarEditor` is usable as the UI Lab Mascot Inspector for geometry, presets, pose, and animation inspection.
- [x] Tests/build evidence proves production import/runtime graphs exclude `AvatarEditor` and Lab-only tooling.
- [x] Actual package/bundle/runtime cost is recorded without making a production adoption decision.
- [x] No archived Compact Mascot implementation, production lifecycle, native authority, or production presentation behavior is modified.
- [x] The final report stops before production migration and does not grant Architecture PASS.

## Out of Scope

- Production renderer migration or dependency adoption decision.
- Any change to archived diamond-ear geometry or its calibration evidence.
- Porting OneWorks geometry, projection, masking, or editor controls.
- New production lifecycle, pointer, native, Product, or Presentation authority.
- Architecture PASS or starting a Route B/C implementation.
