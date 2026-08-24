# Agentation Integration Planning

## Goal

Produce a repository-grounded and current-upstream-grounded plan for integrating Agentation into Ameow UI Lab as a visual-development element inspection and annotation tool. The integration must remain UI Lab-only and development-only, reuse Agentation's official UI and interaction behavior, and avoid creating a new Ameow inspector or changing production Presentation architecture.

## Background

- The UI Lab Refresh is complete and provides the architectural baseline for this plan.
- Agentation is intended to help GPT Architecture Lead, Cindy Lead, and Develop Worker communicate about meaningful Preview elements using component, DOM, source, and annotation context.
- The right-side Dev Tools remain responsible for Lab diagnostics and facts. Agentation is responsible only for Preview inspection and annotation.

## Requirements

### Upstream evidence

- Confirm the current official Agentation package and version, recommended React installation and mounting pattern, React/browser requirements, element inspection and annotation capabilities, and available component/DOM/source context.
- Verify the package and repository license from current upstream evidence. Record obligations, restrictions, and whether use as an Ameow `devDependency` is acceptable.
- Do not reuse a historical license conclusion without current evidence.

### Repository compatibility

- Describe the final UI Lab architecture and DOM structure, including Preview scaling, Background, Full and Compact hosts, shared overlays, Lab chrome, popovers, and pointer-origin behavior.
- Assess Agentation compatibility with Full WebGL canvas, Compact SVG/DOM rendering, shared DOM overlays, Auto 1x/2x/3x display scaling, Preview Background, Reset and Background popovers, and existing wrapper/z-index/pointer-events/`elementFromPoint` behavior.
- State achievable inspection granularity for normal DOM elements, SVG, WebGL canvas, overlays, and Compact rendering.
- Do not claim DOM-level identity for shader visuals inside a canvas.

### Architecture boundaries

- Agentation must be UI Lab-only and development-only and must not enter the production renderer or production build.
- Agentation must not become Product, lifecycle, renderer, pointer, native-window, diagnostic, or annotation-state authority.
- Do not modify production Presentation architecture to accommodate Agentation.
- Do not create a generic inspector abstraction or promote Agentation state into production state.
- Treat any approach that requires production renderer, pointer layering, or authority-boundary changes as a failed candidate.

### UI placement

- Prefer Agentation's official/default UI behavior, including its default bottom-right entry when that is the upstream behavior.
- Do not create an Ameow placeholder, copy Agentation UI, place it inside Dev Tools, or redesign the current UI Lab layout.
- Propose only a minimal adaptation if a real collision is demonstrated.

## Acceptance Criteria

- [x] Planning report cites current upstream integration and license evidence.
- [x] Planning report gives an explicit adoption recommendation and explains whether `devDependency` use is acceptable.
- [x] Planning report defines a development-only containment and mounting approach with production bundle isolation checks.
- [x] Planning report assesses Full, Compact, and scaled Preview compatibility.
- [x] Planning report distinguishes DOM, SVG, overlay, canvas, and WebGL inspection granularity.
- [x] Planning report identifies pointer, hit-test, scaling, stacking, popover, and overlay risks.
- [x] Planning report states whether a real-browser spike is required and bounds the smallest useful spike.
- [x] Planning report provides a bounded future implementation scope and validation direction.
- [x] Planning report ends with an explicit `GO`, `CONDITIONAL GO`, or `NO-GO` recommendation.
- [x] Planning stops before implementation and does not claim Architecture PASS.

## Out of Scope

- Implementing or installing Agentation.
- Modifying the current UI Lab visual layout.
- Developing Compact Mascot or a generic inspector.
- Modifying MR9 visuals or production Presentation architecture.
- Creating new production abstractions or production-owned annotation state.

## Blocking Open Questions

None. Technical unknowns are to be resolved through repository and upstream research or explicitly bounded as spike evidence.
