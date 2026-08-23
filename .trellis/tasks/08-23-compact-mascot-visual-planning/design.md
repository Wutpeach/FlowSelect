# Compact Mascot Visual Design

## Decision summary

Recommend **derivative adaptation**. Per the approved implementation decision, the upstream `AGPL-3.0-only` question is retained as a separate formal distribution/release governance item and does not block current development, Lab experimentation, visual validation, or implementation.

The technically preferred shape is the official `@bible-strong/avatar-core` playback/scene model plus one Compact-specific SVG host behind Ameow's existing visual leaf. This is more source-faithful than a custom recreation and more compatible with Ameow's pointer, Reduced Motion, visibility, and 56px constraints than direct mounting of `@bible-strong/avatar-react`.

Direct reuse remains the first source-fidelity experiment, not the production recommendation. The approved production direction remains derivative adaptation; future formal distribution/release governance must not redirect it to custom recreation. No candidate failure may be generalized into a rejection of the upstream visual.

## Source-fidelity baseline strategy

### Baseline A: pinned upstream truth

Run the upstream repository at `175691ab32cefe5faec7828af62f3d50210a8eb2` outside Ameow and record tightly cropped, reviewable evidence for:

1. Strobi's neutral frame and source palette;
2. the default `proud` loop across all three expression holds and transitions;
3. blink closure/opening;
4. ambient eye/body motion;
5. the same visual under `prefers-reduced-motion`;
6. official exported Strobi `.avatar.json` and package versions.

Use the upstream app/package itself. Do not approximate the baseline inside Ameow.

### Baseline B: direct package candidate

Mount the official React package and exported definition in a disposable Lab candidate at 56px. This experiment answers only:

- Does the official output remain legible and unclipped in Ameow's 80/60/56 composition?
- Does its source palette work on the existing black/white preview environments?
- Which exact differences remain when compared side by side with Baseline A?

It must not add lifecycle or state mappings. Expected boundary failures are explicit Reduced Motion control and continuous pointer response. Those failures reject direct production reuse, not the visual.

### Baseline C: derivative adapter candidate

Use the official core's pure playback/scene output, but let the existing Compact leaf own a single disposable renderer loop and SVG DOM. Compare the same reference states/times against Baseline A, then validate Ameow-specific inputs separately.

The candidate passes source fidelity only when silhouette, eye geometry, orientation, transition character, ambient motion, palette, and blink read as the same source behavior at 1x and remain stable at 2x/3x.

## Data flow and ownership

```text
existing lifecycle reducer
  -> existing projections.visual.mode
  -> existing MainWindowPresentationSurface
      -> existing 80/60/56 geometry and shell presence motion
      -> existing theme + Reduced Motion + read-only Pointer Field
          -> Compact visual leaf
              -> local source playback only
              -> bounded Ameow pointer projection only
              -> SVG scene
```

The reverse direction does not exist. The visual emits no lifecycle event, lock, business event, completion callback, IPC command, native-bounds request, or Expanded target.

## Integration direction

### Production seam

Retain the current Compact leaf prop contract for the first production candidate:

- `size`
- `bodyColor` / `eyeColor`
- `reducedMotion`
- read-only `pointerField`
- `attentionCenterX` / `attentionCenterY`

The implementation may be renamed from Cat to Mascot during the focused change if all two production/Lab callers and tests move atomically. Do not introduce an interface, registry, provider, plugin, or generic avatar framework.

### Renderer choice

Depend on exact `@bible-strong/avatar-core@0.1.0`; do not add the Studio app or `@bible-strong/avatar-react` to production.

Reasons:

- core preserves official geometry, playback, interpolation, blink, and ambient behavior;
- core exposes explicit `reduceMotion`, unlike the React package;
- a Compact-specific host can preserve Ameow's pointer and visibility boundaries;
- Ameow already owns React and Motion, so no second UI framework is needed.

Pin the official exported avatar definition to the researched upstream revision for implementation and source fidelity. Its formal distribution/release treatment is a separate governance item before release. No Studio project document, editor UI, generic behavior library, or export system belongs in Ameow.

### Local visual state

The first scope uses one fixed source behavior: pinned Strobi with the upstream default `proud` loop. It does not map download, transcode, task, hover, or Product state to upstream semantic animations. Such mapping would create a new product/presentation policy and is a separate future task.

Visual-local playback may track current source step, time, and blink because it is disposable implementation state. It must start only while Compact is mounted and visible, stop on unmount/hidden/Reduced Motion, and never control shell mode.

## Reuse classification

| Class | Items |
|---|---|
| Directly reusable | Official Strobi export; `avatar-core` definition validation, playback transition model, procedural scene generation, surface/geometry primitives; source palette and default semantic animation as the fidelity reference. |
| Requires adaptation | 300-to-56px composition; React SVG host; explicit Ameow Reduced Motion; document visibility/unmount cancellation; existing Pointer Field projection; black/white environment review; `pointerEvents: none`; deterministic Lab comparison; exact dependency pinning. |
| Must remain Ameow-specific | Compact/full lifecycle and projections; 80/60/56 geometry; 38px hotspot and native passthrough; shell enter/settle/exit motion; theme token delivery; Pointer Field writers/resets; Lab target/scale/background scenarios; Agentation mount; Full/MR9 graphics. |

## Pointer policy

- Upstream supplies authored gaze but no pointer-follow API.
- Preserve the existing field and writer ownership exactly.
- Apply one bounded visual-only projection to eye/head rendering. The projection reads root-local MotionValues and the existing visual center, has a neutral dead zone, clamps at the Compact approach band, and returns neutral outside its response radius.
- Reduced Motion uses a smaller direct offset with no spring/ambient/body deformation.
- Pointer movement must not select semantic animation keys, dispatch lifecycle events, change shell locks, or alter hotspot radii.

## Reduced Motion policy

Ameow's explicit environment value is authoritative:

- semantic transitions jump to their target;
- ambient eye/body motion is suppressed;
- body deformation and spring tails are removed;
- pointer attention remains direct and reduced in amplitude;
- periodic blink is disabled and eyes remain open;
- decorative rAF/timers stop rather than continue invisibly.

This intentionally differs from upstream core, where blink remains active under Reduced Motion. Record the difference in the fidelity comparison; do not hide it.

## Geometry and theme policy

- Do not change the 80px outer frame, 60px shell, 56px visual size, shell radius, native window bounds, or hotspot.
- Adapt the upstream 300 viewBox inside the existing 56px leaf. Validate no clipping during every reference orientation and blink.
- Baseline evidence uses the exact upstream palette. Production color delivery still flows through the existing `characterBody` and `characterEye` tokens; calibrate those two existing tokens if Architecture Review accepts the source palette. Do not add a palette system.
- Validate black and white themes plus every existing Lab preview background. Color changes must not leak to Full/MR9.

## UI Lab validation matrix

Use existing capabilities without redesign:

| Axis | Required checks |
|---|---|
| Target | Compact only for mascot evidence; switch to Full to prove no visual or behavior change. |
| Scale | Auto, 1x for pixel/clip truth, 2x and 3x for reviewable detail. |
| Background | Every existing preview environment; black and white themes. |
| Pointer | Neutral, live at center/cardinal/diagonal points, leave/reset, Windows pre-hotspot approach. |
| Motion | Normal loop, blink, transition interruption, hidden/visible, unmount/remount. |
| Reduced Motion | Stable open-eye frame, reduced direct pointer response, zero decorative loop/timer work. |
| Agentation | Annotate the production leaf in Compact Preview; no new integration or state bridge. |

## Risks and controls

1. **License/governance**: this does not block development, Lab experimentation, or implementation and must not redirect the approved derivative adaptation. Keep it as a separate prerequisite before future formal distribution/release.
2. **Pre-1.0 API drift**: pin core to `0.1.0` and the definition to the researched upstream commit. No caret range.
3. **Small-scale fidelity**: 3D orientation and eye path deformation may alias or clip at 56px. Validate official direct output before adapting.
4. **Duplicate schedulers**: shell Motion and mascot playback can accidentally overlap ownership. The leaf owns only its internal SVG frames; shell presence remains outside.
5. **Reduced Motion mismatch**: the official React component reads media state internally and keeps blink. This is why it is not the production recommendation.
6. **Pointer feedback loop**: measuring transformed mascot content would feed the visual back into input. Continue using stable-root pointer coordinates only.
7. **Scope expansion**: semantic business-state mapping, avatar selection, Studio import, generic plugins, and Full mascot behavior are explicitly deferred.

## Rollback shape

The change remains atomic at the Compact leaf. Reverting the leaf implementation and any exact dependency/definition/token delta restores the current Flat Blob Cat without touching lifecycle, pointer writers, geometry, UI Lab structure, Agentation, or Full/MR9.

## Architecture blocker

Internal architecture: **none found**.

Recommended derivative implementation path: **not blocked**. License/governance remains an explicit blocker only for future formal distribution/release until separately resolved; it must not redirect this task to custom recreation. GPT Architecture Lead passed the Implementation Architecture Review on 2026-08-23; any later expansion remains a separate scope and review.
