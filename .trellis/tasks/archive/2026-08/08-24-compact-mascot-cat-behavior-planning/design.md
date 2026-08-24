# Compact Mascot cat-like shape and behavior design

## Decision summary

Proceed later with a Kirby-derived, cat-like Compact mascot behind the existing `CompactMascot` leaf. Kirby is the preferred shape baseline; Strobi remains the proven renderer and source-fidelity reference. Keep one Compact-specific `avatar-core` runtime as the sole owner of local visual behavior.

There is no authority or lifecycle architecture blocker. Two implementation prerequisites are explicit: the source-specific SVG host must paint Kirby's two body-node ear paths, and loop-only upstream reactions must be composed into bounded local `once` clips. Neither prerequisite permits a generic avatar renderer, registry, plugin system, second scheduler, or Surface callback.

## 1. Source baseline decision

### Kirby is suitable

Pinned upstream: `smontlouis/bible-strong-avatar-lab@175691ab32cefe5faec7828af62f3d50210a8eb2`.

Kirby is a 240-unit sphere with exactly two mirrored sphere nodes and tall compact eyes. It is the smallest available source composition that already expresses “one round body plus two accessories.” Converting those two accessories into cat ears changes fewer structural facts than adding ears to Strobi or simplifying a multi-node candidate.

Candidate verdicts:

- **Kirby:** selected shape baseline.
- **Strobi:** retained as the authoritative technical adapter/evidence reference, not the cat-shape baseline.
- **Freddy, Cloudee, Cubee, Onee:** rejected because their body mass or node count requires more structural change.
- **`mickey` surface:** rejected because its fixed rounded ears do not read as cat ears and cannot be used as a body node.

The pinned Studio document is Kirby's current source identifier; no standalone Kirby `.avatar.json` exists in the checked upstream tree. A pinned Kirby-to-core definition is therefore required.

## 2. Minimum Kirby to cat-like Ameow derivative

Preserve:

- the 240-unit spherical primary body;
- the two-eye construction and Kirby eye proportions as the first visual candidate;
- exactly two accessory nodes;
- upstream perspective, node projection, expression interpolation, and blink mechanics;
- Ameow's existing 300-unit viewBox, 56px leaf, theme-token color delivery, and 80/60 shell composition.

Change only the two side nodes:

- convert each `sphere` node to an upstream-supported `cone` node;
- move the pair to the upper-left and upper-right of the sphere;
- use short cones with softened tips, broad bases, mirrored outward z rotation, and enough negative z depth for the head to mask the bases;
- tune only ear width/height/depth, position, rotation, tip roundness, and base roundness until the 1x silhouette reads as a cat without gaps or face crossings.

Do not add a tail, whiskers, nose, mouth, inner-ear graphics, gradients, extra nodes, or hand-authored path subsystem in the first derivative. The visual identity should come from the two pointed ear contours plus Kirby's round body and eyes.

The current host renders only head and eyes. A later implementation must add a fixed, source-specific capacity for exactly two ear/body-node paths in the core-provided back/front ordering. It must not become an arbitrary body-node renderer. Prefer calibrating the selected expression set so both ears remain behind the head; evidence must verify that assumption at every retained pose.

## 3. Upstream behavior reuse

### Direct reuse

- `avatar-core@0.1.0` validation, playback, interpolation, pause/resume, blink, scene geometry, and current-frame retargeting.
- Kirby's source body, eye proportions, palette candidate, and selected expression values.
- `idle` as the quiet baseline source loop, with the existing bounded pointer offset composited continuously.
- `surprised` as the first directly reusable two-step reaction, converted only from `loop` to local `once` while retaining expressions `03 -> 21`, 2300ms holds, 500ms smooth transitions, and its blink envelope.

### First-version compositions

Use two bounded two-step clips built only from already-authored upstream steps:

- `curious-short`: the consecutive `expression-00 -> expression-15` tail of `curious`, retaining both 2300ms holds and 500ms smooth transitions.
- `playful-short`: the consecutive `expression-02 -> expression-17` opening of `playful`, retaining both 2300ms holds and 500ms smooth transitions.

Each clip uses `playbackMode: "once"` so core completion is local and deterministic. Source-fidelity Lab comparison may reject a clip if its ears or eyes fail at 56px; replacing it must use another fixed consecutive upstream excerpt and requires planning-review update rather than runtime configurability.

Defer lifecycle/business-sounding loops (`listening`, `thinking`, `searching`, `working`, `sleeping`, `waking`) and negative reactions (`angry`, `sad`, `scared`, `suspicious`, `drowsy`). They are valid upstream resources, but choosing them based on product events belongs to later reaction policy.

## 4. One-owner behavior model

One Compact-specific runtime owns all visual-local behavior. Its conceptual state is:

```text
environment: visible-normal | hidden | reduced | disposed
behavior: baseline | action(actionKey)
playback: one avatar-core AvatarPlaybackState
nextActionAt: one monotonic deadline or null
lastActionKey: optional immediate-repeat guard
generation: stale-callback guard
```

Normal visual flow:

```text
mount + visible + normal
  -> baseline: upstream idle + continuous bounded pointer eye offset
  -> randomized quiet interval elapses
  -> choose one fixed allowlisted action, no immediate repeat
  -> retarget from current frame into one local once clip
  -> clip reaches core once-completion
  -> retarget from current frame to idle
  -> arm a fresh quiet interval
```

The existing single rAF is the only normal-motion clock. It advances playback, samples pointer attention, checks the one action deadline, and renders the scene. Do not add `setInterval`, a parallel `setTimeout` scheduler, React per-frame state, a queue, priority bus, or completion callback to the Surface.

Pointer-follow remains active in both `baseline` and `action`. The action owns the authored head/base-eye pose; the Pointer Field contributes only the existing bounded additive eye offset. Pointer movement never selects, starts, cancels, or extends an action. This avoids two authorities while preserving continuous awareness.

Arm the first and subsequent quiet intervals uniformly in the fixed **18-32 second** range, measured only while visible and normal-motion. With 5.6-second two-step actions, this keeps expressive playback intermittent rather than dominant. Test the cadence with injected `random`. It is a local visual constant, not a user preference or product state.

## 5. Start, interruption, end, and resume boundaries

- **Start:** visible normal mount constructs one runtime, renders the baseline, starts one rAF, and arms one action deadline.
- **Action start:** allowed only from visible normal baseline. One allowlisted action is selected; a second action cannot queue while it runs.
- **Pointer during action:** continues as a bounded additive eye offset and does not interrupt source playback.
- **Hidden:** pause the avatar-core timeline and freeze the remaining action/deadline budget. Zero rAF work while hidden. Visible resumes the exact paused action or baseline from current condition, with no replay.
- **Reduced Motion activation:** cancel the current decorative action and random deadline, stop rAF work, render a deterministic neutral/open-eye frame, and retain only the smaller direct pointer response.
- **Return from Reduced Motion:** start a fresh baseline and fresh quiet interval. Do not replay or claim completion of the cancelled action.
- **Natural action end:** core `once` completion is consumed inside the runtime; retarget from the current frame to baseline and arm the next interval. Nothing is emitted outward.
- **Unmount/dispose:** cancel the one pending frame, remove pointer/visibility listeners, invalidate generation, and discard all local playback/deadline state.
- **Remount:** construct a fresh baseline runtime. Do not persist or restore an action across leaf identity.

## 6. Environment principles

### Reduced Motion

- Static neutral/open-eye source frame.
- Smaller direct pointer projection remains available.
- No random actions, blink, ambient motion, transitions, spring tails, or rAF.
- Pointer subscriptions may render only on actual pointer changes, matching the landed adapter.

### Hidden and visible

- `document.hidden` pauses rather than completes or skips local behavior.
- Hidden time does not consume the remaining action or quiet interval.
- Visibility is handled inside the same runtime/leaf; no global visibility service.

### Unmount and remount

- Unmount is terminal disposal for the local runtime.
- Remount is a fresh visual session at baseline.
- Shell/lifecycle epochs remain external and unchanged.

## 7. Source-fidelity baseline and visual evidence

A new baseline is required. Existing evidence proves Strobi and the adapter seam, not Kirby or cat ears.

Baseline A, pinned source truth:

- convert the pinned Kirby Studio object to a validated core definition without cat changes;
- record neutral body/eyes, original two side nodes, selected source expressions, transitions, and blink.

Baseline B, cat derivative:

- compare the exact preserved Kirby facts with the cone-ear delta;
- inspect neutral, every retained action hold/transition, blink closure/reopen, and ear layer order.

Required compact evidence:

- tightly cropped 1x, 2x, and 3x frames or compact contact sheets;
- black/white themes and existing preview backgrounds;
- pointer neutral/cardinal/diagonal/Windows pre-hotspot positions;
- hidden/pause/resume, Reduced Motion, unmount/remount;
- Compact versus Full side-by-side proving zero Full/MR9 change.

The comparison must label exact upstream facts separately from Ameow-specific changes: cone ears, pointer projection, once/action cadence, explicit Reduced Motion, visibility lifecycle, and theme tokens.

## 8. Architecture blocker verdict

**No authority-level Architecture blocker.** The approved Compact seam is sufficient and must remain unchanged.

Implementation prerequisites, not architecture redesigns:

1. Paint exactly two core body-node ear paths in the source-specific host and prove layer stability.
2. Convert selected loop resources into fixed local `once` clips, preserving source steps and using the existing single runtime.
3. Reconcile `.trellis/spec/frontend/character-motion.md`, whose `CompactCatCharacter`/no-rAF wording still describes the retired pre-adapter implementation, with the Architecture-approved `CompactMascot` single-rAF leaf before implementation closeout. This is spec debt, not permission to change the approved seam.

Release/license governance remains explicitly out of scope and does not redirect this planning decision.

## Risks and rollback shape

- **Ear readability at 56px:** control through pinned 1x evidence and cone calibration, not extra features.
- **Ear/head depth crossing:** constrain the retained expression/action set and tune z/rotation; reject any pose that breaks the two-ear silhouette.
- **Actions feel too long or busy:** keep a three-action allowlist, no repeat, one action at a time, and a bounded quiet interval. Review cadence in Lab before production.
- **Duplicate scheduler:** architecture tests must prove one rAF and no timer/queue escape.
- **Reduced Motion mismatch:** Ameow's explicit prop remains authoritative over core's partial behavior.
- **Stale character-motion spec:** use the landed adapter, architecture tests, and archived Architecture PASS as current evidence; update the spec narrowly during the later implementation task.

Rollback remains atomic at the Compact leaf, pinned Kirby definition, source-specific runtime, and related tests/evidence. Reverting those files restores the landed Strobi adapter without touching Surface, lifecycle, Full/MR9, native code, UI Lab structure, or Agentation.
