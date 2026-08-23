# Agentation Integration Planning Report

Status: planning complete, awaiting GPT Architecture Lead Planning Architecture Review. This report is
not Architecture PASS and does not authorize implementation.

Baseline: `planning/ui-lab-refresh@9648d91`, including the final UI Lab workspace commit `878d868`.
Evidence date: 2026-08-23.

## Executive recommendation

**CONDITIONAL GO** for an exact-pinned, UI Lab-only `agentation@3.0.2` spike and retention gate.

The integration is technically plausible without changing production architecture because UI Lab is a
separate browser entry and Agentation portals its own fixed UI to `document.body`. Its useful floor is:

- element/component/source context for ordinary hittable DOM and interactive shared overlays;
- whole-stage identity plus area/draw annotation for Full WebGL pixels;
- Compact stage/shell identity plus area/draw annotation for the pointer-transparent SVG character.

Adoption remains conditional on:

1. maintainer acceptance of PolyForm Shield 1.0.0 as a non-OSI developer-tool license;
2. a real-browser Agentation spike proving scale alignment, click isolation, source-context behavior, and
   no bottom-right collision;
3. artifact-level proof that production renderer and packaged Ameow contain no Agentation code/assets.

Any solution that needs a production canvas/SVG pointer change, production Presentation/lifecycle/native
change, an Agentation state bridge, or an Ameow inspector abstraction is **NO-GO for that adaptation**.

## 1. Current upstream evidence

The current npm `latest` is `agentation@3.0.2`, published 2026-03-25. The official integration is:

```tsx
import { Agentation } from "agentation";

<YourApp />
<Agentation />
```

The upstream README recommends a devDependency install. Declared requirements are React/React DOM 18+
and a desktop browser; Ameow UI Lab uses React 19.1.0. The published package has optional React peers,
no other runtime dependency, and directly exports the official CSS-only toolbar as `Agentation`.

The published `3.0.2` tarball was inspected, not merely the repository `main` branch. It confirms:

- body portal and fixed bottom-right toolbar;
- viewport/document hit testing via `elementFromPoint`/`elementsFromPoint`;
- fixed viewport outlines based on `getBoundingClientRect()`;
- default interaction blocking;
- annotation fields for React component hierarchy and development-only source file;
- a consumer `className` escape hatch for placement/z-index only if collision is proven.

Capabilities relevant to Ameow include click/text/multi/area annotation, animation pause, selector/path,
bounding box, classes, nearby context, accessibility and computed-style context, markdown copy, and
best-effort React/source context. Endpoint, session, webhook, and Agent Sync capabilities are not needed.

Detailed evidence and upstream links live in `research/upstream-agentation.md`.

## 2. License decision

Current npm metadata, official package metadata, repository LICENSE, and the published tarball all agree:

`PolyForm-Shield-1.0.0`, copyright 2026 Benji Taylor.

The license:

- prohibits using the software to provide a competing product/service;
- prohibits removing or obscuring included notices;
- requires a license copy when distributing the software or derivative works.

This is source-available, not OSI-approved open source. Ameow's MIT license does not relicense
Agentation. The intended use is acceptable in principle because Ameow is a desktop collection/download
utility and Agentation would be a developer-only visual feedback tool, not a competing product.

Adoption conditions:

- install as exact `agentation@3.0.2` in `devDependencies`;
- never vendor, fork, copy, or rebrand Agentation under Ameow's MIT license;
- retain upstream notices in the installed package;
- if any Lab bundle/derivative containing Agentation is distributed, include PolyForm Shield with it;
- re-check license and package behavior on every upgrade;
- if Ameow policy requires all dependencies, including dev tools, to be OSI-open, reject this package or
  obtain separate permission/relicensing.

Production isolation is legally useful as well as architectural: normal Ameow releases should not
distribute Agentation at all. This is a planning assessment, not legal advice; Architecture/maintainer
review owns the policy acceptance.

## 3. Final UI Lab boundary

```text
lab.html -> src/lab/lab-main.tsx -> ThemeProvider -> PresentationLab
                                              |-> LabOverlayStage (Full)
                                              `-> CompactPreviewStage (Compact)

index.html -> src/main.tsx -> production Electron renderer graph
```

`vite.lab.config.ts` serves the browser-only Lab at `127.0.0.1:1421`. `vite.config.ts` pins the
production Rollup input to `index.html`. The Lab has no Electron preload, desktop bridge, downloader
runtime, native-window authority, Product state, or separate renderer implementation.

The final page has exactly two macro surfaces:

- dominant Workspace Shell: scenario header, Preview body, target/scale/action footer;
- persistent right-side Dev Tools: Lab facts and advanced diagnostics.

Agentation does not join Dev Tools. It remains a separate page overlay whose role is inspection and
annotation. Dev Tools remains the authority for Lab diagnostics/facts.

## 4. Mount and containment design

The shortest acceptable future change is one static import and one official component in
`src/lab/lab-main.tsx`, after `PresentationLab` in the existing Lab root:

```tsx
import { Agentation } from "agentation";

<PresentationLab />
<Agentation />
```

No wrapper, provider, adapter, placeholder, status panel, callback bridge, endpoint, webhook, session,
Inspector context, or Ameow-owned annotation store is planned. Default clipboard/copy behavior is enough
for GPT Architecture Lead, Cindy Lead, and Develop Worker communication.

Mounting inside the Lab root does **not** technically scope selection to the Preview subtree: Agentation
3.0.2 listens at `document` and portals to `document.body`, and it exposes no root-selector prop. The
intended usage is Preview-focused, but Lab chrome and Dev Tools are also selectable while annotation mode
is active. Do not build a filtering layer to hide that fact.

If Architecture Review requires hard Preview-only target enforcement, the current official API cannot
satisfy it without an upstream feature/fork or custom event filtering. Under this plan that requirement
would make Agentation **NO-GO**, because building that filter would become the inspector abstraction the
task prohibits.

## 5. Preview DOM and inspection granularity

The final Preview stack is:

```text
stage viewport (relative, clipped)
  screen-only Background layer (absolute, pointer-transparent)
  scaled layout reservation
    transform: scale(1 | 2 | 3), origin top-left
      Full 200x200 frame OR Compact 80x80 stage
  Background picker (Lab chrome, z 40)
  Reset (Lab chrome, z 40)
```

Agentation lives in a body portal around z 99997-100000, outside Preview transform/clipping. No z-index
change is expected.

| Surface | Reliable granularity | Not promised |
|---|---|---|
| Ordinary hittable DOM | exact DOM element, selector/path, geometry, classes/context; React/source best-effort | source path when React debug evidence is absent |
| Full unobstructed visual | `data-lab-preview-frame` / LabOverlayStage chain | canvas node or WebGL pixel identity |
| Full WebGL canvas | area/draw annotation over visual coordinates | shader region, thermal cell, refraction/front/progress pixel identity |
| Shared Full overlays | interactive queue/runtime/cancel/popover DOM elements | pointer-transparent center-overlay text/graphics that fall through |
| Compact visual | Compact stage or 60x60 shell DOM | cat body/ear/eye SVG child identity |
| Compact SVG | area/draw annotation over body/eyes | direct `svg`/`path`/`ellipse` hit while production SVG stays pointer-transparent |
| Preview Background | stage viewport / region annotation | the pointer-transparent Background layer itself |
| Background picker / Reset / Lab chrome | ordinary DOM elements | production authority or state ownership |

### Why Full canvas and Compact SVG stay coarse

The one production `ExpandedPresentationSurface` canvas is `pointer-events:none`; native hit testing
returns the Full frame. The production `CompactCatCharacter` is genuine SVG DOM, but its SVG root is also
`pointer-events:none`; native hit testing returns the Compact shell.

Changing either production renderer for Agentation is prohibited. Area annotation is the supported way
to communicate about internal shader regions or visual cat parts.

## 6. Auto/1x/2x/3x compatibility

UI Lab applies display magnification to a Preview-only wrapper and reserves `logicalSize * scale` layout
space. Browser hit testing and `getBoundingClientRect()` both operate in post-transform viewport
coordinates, matching Agentation's current selection/highlight model. Agentation's body portal is not
scaled.

A read-only browser probe of the completed Lab established the repository side:

- Full Auto at 1440x1000: logical 200x200, displayed 400x400, hit = Full frame;
- Full manual 3x: displayed 600x600, hit = Full frame;
- queue badge/open popover: scaled with the frame and individually hittable;
- Compact 3x: logical 80x80, displayed 240x240, hit = Compact shell;
- Compact shell 3x: logical 60x60, displayed 180x180;
- Compact SVG 3x: displayed 168x168 but hit = shell because SVG pointer events are none;
- Background option: unscaled, hittable Lab chrome.

This proves geometry and native hit targets, not Agentation marker alignment. A real mounted Agentation
spike remains mandatory at 1x, Auto 2x, and 3x, including after target/scale changes.

## 7. Pointer, event, and layering risks

### Primary risk: Full pointer-origin mutation

Full Preview uses a React bubble `onClick` to set normalized origin. Agentation's document capture click
handler prevents a non-interactive annotation click but may not stop propagation. Annotating the Full
frame may therefore also move the Lab-local origin.

First prove the behavior. If reproduced and if React observes `event.defaultPrevented`, the only accepted
adaptation is a Lab-local early return in `LabOverlayStage`. No production pointer, canvas, overlay,
renderer, lifecycle, or z-index change is allowed. If that guard is insufficient, do not create an
Agentation-active state bridge; narrow or reject the integration.

### Other bounded risks

- Agentation blocks interactive controls by default in annotation mode. Verify Reset, Background,
  queue/runtime controls do not execute while being selected and recover when annotation mode exits.
- Compact pointer attention may continue to react while the pointer moves. Use Agentation's official
  animation-pause behavior when a frozen state is needed; do not add a second pointer authority.
- Stored annotations/markers may become stale when the target unmounts or display scale changes. Verify
  official behavior and document a clear/switch/re-annotate workflow if necessary; do not promote scale
  or annotation state into production.
- Agentation's body event stop should keep toolbar clicks from tripping Lab outside-click handlers, but
  verify toolbar plus Background/queue popover interactions in a real browser.
- Source/component detection is best-effort under Vite + React 19. Absence is acceptable when accurately
  reported; fabricated or manually synthesized source context is not.

## 8. Official UI placement

Keep Agentation's default fixed bottom-right entry. The final Lab intentionally leaves that viewport area
clear; the Preview Background trigger is local to the centered Preview, not fixed to the viewport corner.

Do not:

- add an Ameow placeholder or fake inspect button;
- copy/re-skin Agentation UI;
- put Agentation in Dev Tools;
- portal it into the Preview transform;
- move existing Lab controls preemptively.

Only a real mounted collision can justify the upstream `className` escape hatch, limited to the smallest
fixed offset/z-index override. Any visual adaptation must retain official interaction behavior.

## 9. Mandatory real-browser spike

The first future implementation checkpoint mounts unmodified `agentation@3.0.2` only in UI Lab and proves:

1. default bottom-right toolbar, activate/copy/clear workflow, and no real collision;
2. Full frame hover/select plus area/draw at 1x, Auto 2x, and 3x, before/after scale changes;
3. plain Full pixels select the frame and never claim canvas/shader identity;
4. one queue badge and an open queue-popover descendant are selectable shared DOM cases;
5. Compact stage/shell selection plus body/eye area annotation at 1x and 3x;
6. pointer-transparent Compact SVG children remain coarse unless upstream proves otherwise without a
   production change;
7. annotation clicks do not move Full origin, or the minimal Lab-only `defaultPrevented` guard fixes it;
8. Reset, Background picker, queue/runtime popovers, Compact attention, target switch, and scale switch
   recover correctly after annotation mode;
9. toolbar/outlines stay unscaled and aligned after target/scale/popover changes;
10. actual React component and `sourceFile` output is recorded from Ameow's Vite + React 19 runtime;
11. production renderer build and packaged app contain no Agentation code, asset, or identifying string.

The spike fails if meaningful use requires production pointer/layering/renderer/authority changes. Lack of
shader-internal or Compact-SVG-child identity is expected and is not a failure.

## 10. Production bundle isolation

Keep all imports under `src/lab/`. Extend `src/lab/rendererReuse.test.ts` only enough to assert:

- `agentation` is imported by the Lab entry;
- `src/main.tsx`, `index.html`, production Vite input, Electron, and production Presentation sources do
  not reference it;
- no Lab-to-production import is introduced.

Then prove actual artifacts:

- focused Lab tests;
- `npm run type-check`;
- `npm run lint`;
- `npm run build`;
- scan `dist/` and `dist-electron/` for Agentation module names, `data-agentation-*`, toolbar strings, and
  standalone Agentation assets;
- create one unpacked production package for the current platform and inspect its files/asar for the same
  references and for accidentally shipped Agentation package content.

Static source tests are guards, not substitutes for artifact inspection. If packaged isolation cannot be
proven, dependency retention remains conditional.

## 11. Bounded future implementation scope

Expected files:

1. `package.json` and `package-lock.json`: exact devDependency only.
2. `src/lab/lab-main.tsx`: one official import and one sibling mount.
3. `src/lab/rendererReuse.test.ts`: minimal source/build-boundary assertions.
4. `src/lab/LabOverlayStage.tsx` plus one focused test only if the spike proves the
   `event.defaultPrevented` origin guard is required.
5. Trellis research/evidence artifacts for the real-browser and production-package gates.

No production source, UI Lab visual layout, Dev Tools content, locale, public docs, Product state,
Presentation renderer, pointer field, lifecycle, native window, MR9 visual, Compact mascot, generic
inspector, or Agentation adapter is in scope.

## 12. Rollback and stop conditions

Rollback is deletion of the Lab mount, exact devDependency/lock entries, and any Lab-only origin guard.
Production behavior has no migration or state rollback.

Stop and return **NO-GO** when:

- license/policy acceptance is denied;
- production artifacts contain Agentation;
- click isolation requires a custom active-state bridge or production pointer change;
- acceptable targetability requires changing production canvas/SVG/overlay pointer behavior;
- hard Preview-only target enforcement is required;
- the official bottom-right UI has an unresolvable collision without layout redesign;
- source/marker behavior is materially misleading and cannot be handled by the official workflow.

## 13. Evidence map

- Current upstream/package/license evidence: `research/upstream-agentation.md`
- Final UI Lab DOM, browser hit probe, and repository compatibility: `research/repository-compatibility.md`
- Production/UI rules: `.trellis/spec/frontend/quality-guidelines.md`,
  `.trellis/spec/frontend/component-guidelines.md`, and `.trellis/spec/frontend/design-system.md`

## Final disposition

**CONDITIONAL GO**, pending GPT Architecture Lead Planning Architecture Review, explicit non-OSI license
acceptance, the bounded real-browser spike, and artifact-level production isolation. Stop here; do not
implement and do not claim Architecture PASS.
