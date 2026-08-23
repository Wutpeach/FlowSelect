# UI Lab Refresh Design

## Design Summary

Keep the existing dev-only Browser Lab boundary and rebalance the current three-pane page into a Presentation Playground:

```text
Scenario Navigation -> Lab scenario / fixture -> existing pure production projection
                                                    |
                                                    v
                         Preview Target: Full or Compact
                                                    |
                         Full production surface or Compact renderer leaf
                                                    |
                                                    v
                       Dev Tools observes / controls Lab-local preview inputs
```

This remains a projection and rendering tool. It creates no Product, lifecycle, queue, native-window, renderer, or shader authority.

## Information Architecture

### Scenario Navigation (left)

Responsibilities:

- Organize the existing scenarios by visual-development intent.
- Select one Lab preview scenario.
- Show whether a scenario is available for the selected Preview Target.
- Offer one concise reset action.

Recommended groups:

- Activation
- Progress
- Download / Queue
- Runtime
- Transcode / Outcome
- Mixed
- Visual Spikes
- Reduced Motion
- Compact Character (existing neutral / pointer attention / Reduced Motion capabilities only)

The navigation must not edit raw JSON or issue production commands. It must not pretend that Full-only download/runtime fixtures create Compact behavior when the current Compact renderer has no such input.

### Preview Workspace (center)

Responsibilities:

- Keep Full and Compact target tabs permanently visible.
- Render one target at a time in a dominant, uncluttered workspace.
- Display the logical target size separately from display zoom.
- Own display zoom, replay, and PNG export affordances.
- Provide the stable semantic stage nodes Agentation can annotate.
- Keep the preview centered with adequate surrounding negative space; avoid dashboard-style cards around it.

Target metadata shown near the workspace should be factual and short, for example `Full · 200×200 · 2×` or `Compact · 80×80 outer / 60×60 shell · 3×`.

### Dev Tools (right)

Responsibilities:

- Show only controls that map to an existing preview capability.
- Show human-readable scenario facts first.
- Host optional Agentation entry/status if adopted.
- Put raw projection and renderer diagnostics behind an `Advanced` disclosure.

Primary controls are limited to the current real inputs:

- Reduced Motion
- normalized origin X/Y or direct preview click
- determinate progress
- queue popover open state for relevant fixtures

There is no generic parameter schema, control registry, property grid, URL state system, or live shader editor in this design.

## Lab State and Scenario Ownership

Preserve the existing two local sources:

- `LabPresentationState` for synthetic Expanded activation/progress/heatmap inputs;
- static `LabOverlayFixture` values projected through production selectors/helpers.

Add only one Lab UI discriminant for the Preview Target: `full | compact`.

Scenario compatibility may be expressed as a small static property/helper in the existing Lab scenario catalog. It is not a plugin architecture. Incompatible scenarios remain visible with a clear Full-only / Compact-only indicator or are filtered within the active target group; they must never be silently coerced into a fake projection.

Target switching changes only the Lab preview host. It does not reset or write production state. Target-local UI state, such as Compact pointer position, remains bounded to the target host.

## Full Preview Integration

Continue using `LabOverlayStage` and its exact production components:

- one `ExpandedPresentationSurface`;
- one WebGL2 canvas/program/draw path;
- shared center overlay;
- shared queue popover;
- shared runtime indicator.

Keep the existing fixture and pure-projection path. The Refresh may split the current large `PresentationLab.tsx` into three local view components for readability, but it should not move projection code into a new framework.

Align the Lab Full frame's wrapper radius with production (`16px`). This is Lab chrome correction only and does not modify MR9 visuals.

## Compact Preview Integration

Create one Lab-local browser stage that directly mounts the existing `CompactCatCharacter` leaf.

The stage uses existing production constants:

- logical outer frame: `80×80`;
- centered visible shell: `60×60`;
- current character visual: `56×56`.

The stage supplies:

- theme colors from the existing `ThemeProvider`;
- the existing Reduced Motion flag;
- one pair of Lab-local `MotionValue<number>` values updated from workspace pointer movement;
- attention center `(40, 40)` in the Compact logical frame.

Do not mount `MainWindowPresentationSurface` in the Lab. It composes native window, geometry, pointer, lifecycle, and desktop concerns and violates the existing browser-safe import guard.

Do not change `CompactCatCharacter`, `characterRecipe`, native hotspot metrics, or main-window lifecycle to serve the Lab. This stage previews the current Compact renderer and leaves future mascot development out of scope.

## Logical Geometry, Display Scale, and Raster Scale

Use three explicit concepts:

1. `logicalSize`: production geometry (`200` Full, `80` Compact outer).
2. `displayScale`: Lab workspace magnification only.
3. `backingScale`: Full canvas raster density / export scale.

Apply display magnification to a Lab wrapper around the logical stage. Keep the stage's CSS width and height at the production logical values. Pointer normalization must continue to use the displayed bounding rectangle, which preserves normalized coordinates under uniform scaling.

The Preview Workspace must reserve layout space based on `logicalSize × displayScale` so scaled content does not overlap side panels.

PNG export remains a logical-target export, independent of display zoom. Full retains the existing `4×` backing-store capture contract; implementation validation must prove equivalent output dimensions and framing at every supported display zoom. Compact export may reuse the same Lab export boundary only if it preserves the `80×80` logical frame and existing shadow recipe; otherwise Compact export can remain deferred rather than widening scope.

## Diagnostics Hierarchy

Keep as normal Dev Tools:

- selected scenario / target summary;
- current Reduced Motion state;
- human-readable scenario facts;
- queue-row facts when relevant;
- export result / failure;
- optional Agentation status.

Move to `Diagnostics / Advanced`:

- composed Full target JSON;
- raw fixture summary JSON;
- live WebGL uniform readout;
- logical/display/backing scale details;
- low-level capture diagnostics.

Hide or mark Full-only diagnostics when Compact is selected. The shader readout must not keep assuming a canvas exists for Compact.

## Agentation Boundary

Agentation is an optional final slice:

- `devDependency` only;
- imported only under `src/lab/`;
- no endpoint, webhook, server, or agent synchronization in this scope;
- never bundled into production output;
- never used as state authority or parameter editor.

Expected target granularity:

- ordinary Lab controls and shared DOM overlays: element selection;
- Full WebGL pixels: whole stage plus area/draw annotation;
- Compact character internals: Compact stage plus area annotation.

If annotation click conflicts with Full origin selection, use a Lab-local guard based on the prevented click. Do not modify production `pointer-events`, canvas, overlay z-index, or renderer code.

License acceptance for PolyForm Shield and the real-browser scale/hit-test proof are required before retaining the dependency. Failure removes only Agentation, not the core Refresh.

## Visual and Accessibility Direction

This is a desktop product tool used for sustained visual iteration on a normal monitor, often beside dark production surfaces. Keep the existing black Ameow theme, restrained accent use, system typography, and calm surface stack.

- Make the center workspace the largest and quietest region.
- Use separators and tonal regions instead of nested dashboard cards.
- Keep blue for selection, focus, and active state.
- Give scenario rows and target tabs visible hover, focus, selected, and disabled/incompatible states.
- Use semantic `nav`, `main`, and `aside` landmarks with stable accessible names.
- Preserve keyboard access for scenario selection, target switching, disclosures, and controls.
- Keep the Lab desktop-focused. One bounded narrow-window rule may collapse Dev Tools before shrinking the Preview below its useful size; no mobile Lab redesign is planned.

## Compatibility and Rollback

- No migration of production data or settings.
- No docs-site update is required because this is internal development tooling.
- Core Refresh can be rolled back by reverting only `src/lab/` layout/model changes.
- Compact can be removed independently because it is a Lab-local host.
- Agentation can be removed independently by deleting the Lab mount and devDependency; production remains unchanged.

## Architecture Blockers

None.

Agentation license acceptance and browser proof are adoption gates for that optional slice, not blockers for the Presentation Playground.
