# Upstream Agentation Evidence

Evidence checked on 2026-08-23. This note distinguishes the published npm artifact from the current
official repository. No historical license conclusion was reused.

## 1. Package identity and supported integration

- npm package: [`agentation`](https://www.npmjs.com/package/agentation)
- Current npm `latest`: `3.0.2` (`npm view agentation version dist-tags --json`)
- Published: 2026-03-25T16:24:19.682Z according to npm registry metadata.
- Official repository: [`benjitaylor/agentation`](https://github.com/benjitaylor/agentation)
- Official docs: [`agentation.com`](https://agentation.com)
- Package peers: `react >=18.0.0`, `react-dom >=18.0.0`; both are optional peer declarations.
- Ameow's Lab baseline uses React/React DOM `19.1.0`, so the declared peer range is compatible.
- Upstream README requirement: React 18+ and a desktop browser; mobile is not supported.

The official install/mount contract is deliberately small:

```tsx
import { Agentation } from "agentation";

function App() {
  return (
    <>
      <YourApp />
      <Agentation />
    </>
  );
}
```

The README recommends `npm install agentation -D`. The default toolbar appears in the bottom-right,
is activated from its own UI, and then annotates clicked page elements. The package entry exports the
CSS-only toolbar as `Agentation`; no runtime dependency is declared beyond optional React peers.

For Ameow, the future dependency should be exact-pinned (`agentation@3.0.2`, not a caret range) because
the package is fast-moving and its non-OSI license is a review-sensitive input. Any upgrade must repeat
the integration, bundle-isolation, and license checks.

## 2. Inspection and annotation capability

The current README and schema document these useful outputs:

- click-to-annotate with an automatic selector/path;
- selected text, nearby text/elements, classes, computed styles, accessibility information, and
  viewport/document position;
- multi-element drag selection and arbitrary area selection, including empty space;
- CSS/JS/video animation pause;
- structured markdown output and callback access (`onAnnotationAdd`, update/delete/clear, `onCopy`,
  and `onSubmit`);
- optional Agent Sync endpoint/session/webhook integration;
- React component hierarchy and a development-only `sourceFile` when React debug/fiber evidence is
  available.

The official schema page currently labels the annotation format AFS 1.1 and presents selector,
React-component, bounding-box, source/context, and markdown fields. Ameow does not need Agent Sync,
webhooks, or production persistence for the requested integration.

### React/source context is best-effort

Current upstream source:

- detects `__reactFiber$`, `__reactInternalInstance$`, and `__reactProps$` keys on DOM nodes;
- walks the fiber return chain for component names;
- includes React 19 source-location fallbacks;
- reports `no-fiber` or `no-debug-source` rather than inventing a source path;
- explicitly says source location works only in development mode and may work better with React
  DevTools installed.

Therefore the plan may promise DOM selector/path and geometry for hittable elements, but it must describe
React component/source context as best-effort and prove it in Ameow's real Vite/React 19 browser runtime.

## 3. Hit testing, portal, and stacking behavior

The published `3.0.2` tarball was also unpacked outside the repository and checked directly. Its type
declarations expose `Agentation`, annotation `reactComponents`/`sourceFile`, and the optional `className`;
its built module contains the same `document.elementFromPoint`, `document.body` portal, default
`blockInteractions: true`, bottom-right positioning, and z-index behavior described below. These points
are therefore package evidence, not assumptions based only on post-release `main` source.

Current official source is relevant to Ameow's Preview compatibility:

- `Agentation` portals its UI and overlays to `document.body`.
- The default toolbar is `position: fixed; right: 1.25rem; bottom: 1.25rem`, width `337px`, and
  `z-index: 100000`.
- The toolbar shell has `pointer-events: none`, while the toolbar container has `pointer-events: auto`.
- The page overlay is fixed to the viewport at `z-index: 99997`; hover/selection outlines are fixed,
  use target `getBoundingClientRect()` values, and are pointer-transparent.
- Markers use `z-index: 99998`; drawing mode uses a full-viewport canvas below them.
- Hover and click selection use `document.elementFromPoint()` (with recursive open-shadow-root support)
  and document-level listeners. Area selection samples `document.elementsFromPoint()`.
- Toolbar-originated events are stopped at `document.body` so they do not trigger ordinary document/
  window click-outside handlers.
- The component exposes a `className` positioning/z-index escape hatch, but the default position must be
  retained unless a real collision is demonstrated.

These mechanics are compatible in principle with CSS-transformed Preview descendants because browser
hit testing and `getBoundingClientRect()` both operate in viewport coordinates after transforms. That is
still a real-browser proof item, especially at 2x/3x and with nested SVG.

### Interaction interception

`blockInteractions` defaults to `true`. In annotation mode, interactive elements (`button`, `a`, input,
select, textarea, role=button, or onclick) are prevented and propagation is stopped so the annotation can
be created without executing the control. For a non-interactive target, the document capture listener
calls `preventDefault()` but does not always stop propagation.

This is a specific risk for Ameow Full Preview: annotating its canvas may still bubble to the Lab-local
Preview `onClick` and move the pointer origin. The spike must test `event.defaultPrevented` behavior. If the
collision is real, the only acceptable adaptation is a Lab-local guard in the Preview wrapper; no
production pointer or renderer change is allowed.

## 4. DOM, SVG, and canvas granularity

Upstream identifies ordinary DOM nodes by tag, meaningful id/class, role/text, nearby context, and path.
It has explicit labels for `svg`, `path`, `circle`, `rect`, `line`, and `g`, and treats `canvas`/`svg` as
media elements for computed-style output.

Consequences for Ameow:

- ordinary Preview DOM: element-level selection when the node is hittable;
- SVG: SVG root or individual topmost SVG child node, plus a best-effort React component chain;
- WebGL: the `<canvas>` node only, plus its DOM/React/source context if available;
- shader colors, thermal regions, refraction, progress bands, or other pixels inside WebGL have no DOM
  element identity;
- arbitrary visual regions can be area-annotated, but those annotations describe coordinates/region,
  not internal shader components.

## 5. License evidence and obligations

Three current upstream sources agree:

- npm registry `license`: `PolyForm-Shield-1.0.0`;
- official `package/package.json`: `PolyForm-Shield-1.0.0`;
- official repository `LICENSE`: PolyForm Shield License 1.0.0, copyright 2026 Benji Taylor.

`npm pack agentation@3.0.2 --dry-run --json` also proves the published tarball includes `LICENSE`,
`README.md`, package metadata, and built `dist` files. The published package is therefore not missing its
license notice.

The operative restrictions/obligations in the repository license are:

1. do not use the Software to provide a product or service competing with Agentation or another
   licensor offering that includes it;
2. do not remove or obscure included license, copyright, or other notices;
3. when distributing the Software or derivative works, include a copy of the license.

PolyForm Shield is source-available, not an OSI-approved open-source license. Ameow is MIT-licensed, but
that does not relicense Agentation. The licenses can coexist only with clear dependency boundaries.

### Acceptability as an Ameow devDependency

Current intended use is acceptable in principle because Ameow is a desktop download/collection utility,
not a competing visual-feedback/annotation product, and Agentation would be used only as a developer
tool in UI Lab. The dependency declaration and lockfile do not vendor or relicense Agentation; a normal
developer install retains the upstream package's own LICENSE in `node_modules`.

Conditions:

- keep it an exact-pinned `devDependency`;
- do not vendor, copy, fork, or rebrand its UI/source under Ameow's MIT license;
- keep its notices intact;
- if a Lab bundle or derivative containing Agentation is ever distributed, ship the PolyForm Shield
  license with that distribution;
- verify production renderer/package isolation so normal Ameow releases do not distribute Agentation;
- repeat the license review on every version change;
- if Ameow has a project policy requiring every dependency, including developer tools, to be OSI-open,
  obtain separate permission/relicensing or reject the dependency.

This is a repository planning assessment, not legal advice. The non-competition scope should receive
maintainer approval as part of Architecture/maintainer review.

## 6. Upstream evidence links

- npm README/version/license: <https://www.npmjs.com/package/agentation>
- Official repository: <https://github.com/benjitaylor/agentation>
- Official license: <https://github.com/benjitaylor/agentation/blob/main/LICENSE>
- Package metadata: <https://github.com/benjitaylor/agentation/blob/main/package/package.json>
- Package entry: <https://github.com/benjitaylor/agentation/blob/main/package/src/index.ts>
- Toolbar/portal/hit-testing source:
  <https://github.com/benjitaylor/agentation/blob/main/package/src/components/page-toolbar-css/index.tsx>
- Toolbar stacking source:
  <https://github.com/benjitaylor/agentation/blob/main/package/src/components/page-toolbar-css/styles.module.scss>
- Element identification:
  <https://github.com/benjitaylor/agentation/blob/main/package/src/utils/element-identification.ts>
- React/source context:
  <https://github.com/benjitaylor/agentation/blob/main/package/src/utils/react-detection.ts> and
  <https://github.com/benjitaylor/agentation/blob/main/package/src/utils/source-location.ts>
- Official schema: <https://agentation.com/schema>
