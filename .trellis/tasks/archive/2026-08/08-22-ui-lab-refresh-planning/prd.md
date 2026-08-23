# UI Lab Refresh Planning

## Goal

Plan a repository-grounded refresh of the development-only UI Lab so its primary experience becomes a Presentation Playground for visual development instead of a debug-dashboard-first surface.

The plan is based on the latest stable `motion/mr9-fullscreen-activation-fx` commit, `eaead6573302e16839aa87a7d70b15717a708f3f`, in an independent worktree. Dirty Thermal / Paper spike changes from the source MR9 worktree are explicitly excluded.

## User Value

- Make preview scenarios and visual comparison the dominant Lab workflow.
- Keep production Presentation, lifecycle, Product, and renderer authority unchanged.
- Support both Full and Compact as first-class preview targets without pre-designing a future Compact mascot.

## Requirements

### Information Architecture

- The recommended Lab layout must converge on three responsibilities:
  - left: Scenario Navigation;
  - center: a Large Preview Workspace;
  - right: Dev Tools.
- Scenario Navigation changes only the Lab preview scenario. It must not create or imply a second production business or lifecycle truth.
- The Preview Workspace may magnify a target, but logical geometry and preview scale must remain conceptually separate.
- Dev Tools must support visual-development diagnostics without making raw JSON or state dumps the main page content.

### Preview Targets

- Full and Compact must be first-class Preview Targets in the planned model.
- The plan must identify the repository-grounded Compact integration direction under current architecture.
- The plan must not introduce, implement, or pre-design a new Compact mascot architecture.
- The Lab must continue to respect existing Presentation and feature boundaries and reuse production renderers where that is the existing contract.

### Agentation Feasibility

- Research whether Agentation is suitable as Lab-local, development-only tooling.
- If recommended, Agentation must not enter the production Ameow runtime or become production authority.
- Feasibility must account for current Preview scaling, wrapper structure, visual layering, canvases, hit testing, and `pointer-events` behavior.
- Limitations must be reported with repository evidence and a bounded recommendation; production authority must not be modified to make Agentation work.

### Diagnostics and Inspector Scope

- Preserve useful diagnostics, but demote current JSON/state dumps to Diagnostics / Advanced.
- Do not assume a general live parameter Inspector is needed.
- A parameter control capability may appear only as an optional suggestion when repository research finds a clear, low-cost existing capability to reuse.

### Planning Boundary

- This task produces planning artifacts and a planning report only.
- Do not implement UI, modify MR9 visuals, start the Trellis implementation phase, commit UI Lab Refresh implementation, or claim Architecture PASS.
- Stop after returning the planning report for GPT Architecture Lead Planning Architecture Review.

## Acceptance Criteria

- [x] The report documents the current UI Lab structure, scenario/state drive, preview renderer reuse, and diagnostics sources with repository evidence.
- [x] The report recommends an information architecture and explicit responsibility split for Scenario Navigation, Preview Workspace, and Dev Tools.
- [x] The report gives a repository-grounded Full / Compact preview integration direction without designing a new mascot.
- [x] The report evaluates Agentation feasibility, dev-only containment, hit-test and layering risks, and its architecture boundary.
- [x] The report identifies which existing diagnostics remain and how they are demoted.
- [x] The report states whether any architecture blocker must be resolved before implementation.
- [x] The report proposes a bounded implementation scope and explicit non-goals that avoid scope creep.
- [x] The plan keeps logical preview geometry separate from magnification scale.
- [x] Planning artifacts are ready for GPT Architecture Lead review, but the task remains in `planning` and no Architecture PASS is self-granted.

## Out of Scope

- UI implementation.
- Compact mascot development or mascot architecture redesign.
- Changes to MR9 Thermal Refraction or Fullscreen Activation FX visuals.
- New production state, lifecycle, Product, Presentation, or renderer authority.
- A general-purpose live parameter editing system.
- Architecture approval or implementation activation.

## Confirmed Planning Decisions

- The current page already has left / center / right regions; the Refresh changes information hierarchy and responsibilities rather than creating a new Lab application.
- Full keeps the existing production `ExpandedPresentationSurface` and shared production overlays.
- Compact uses a Lab-local browser host around the existing `CompactCatCharacter` renderer leaf and production `80 / 60 / 56` geometry. It does not mount the native Main Window shell or add mascot architecture.
- Preview Target choice is Lab UI state only and stays separate from scenario state.
- Display magnification is separate from logical geometry and Full export backing scale.
- Human-readable scenario facts and current real controls stay in Dev Tools; raw projection JSON and shader uniforms move under Diagnostics / Advanced.
- No general live parameter Inspector is planned. Existing Reduced Motion, origin, and progress controls are retained only where their real inputs apply.
- Agentation is optional and coarse-grained: DOM/stage selection plus area annotations for WebGL/SVG regions. Adoption requires a real-browser proof and explicit PolyForm Shield license acceptance.
- No production architecture blocker must be repaired before implementation.

## Technical Evidence

- `research/repository-baseline.md` records current build isolation, scenario/projection flow, renderer reuse, Compact direction, diagnostics, scaling, and blocker evidence.
- `research/agentation-feasibility.md` records the upstream package baseline, hit-test/layering analysis, containment boundary, license gate, and proof criteria.
- `research/ui-lab-refresh-planning-report.md` is the consolidated report for GPT Architecture Lead review.
