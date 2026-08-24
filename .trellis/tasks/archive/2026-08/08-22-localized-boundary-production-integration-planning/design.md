# Design: MR9 Localized Boundary Production Integration

## Baseline

- Authoritative worktree: `motion/mr9-fullscreen-activation-fx` at `4db7722` plus the frozen, uncommitted Browser Lab candidate recorded by `research/repository-grounded-planning-report.md`.
- The accepted Thermal interior, Refraction, real-boundary contact, localized response, halo parameters, and 228/200/14 geometry are inputs, not design variables.
- This design changes production composition only.

## Architecture

Production keeps the stable native 228x228 full viewport and the existing 200x200/r16 `containerRef` panel. The sole canvas is hosted in a 228x228, pointer-transparent child wrapper offset by the existing 14px gutter. Every non-canvas child moves into a transparent 200x200/r16 overflow clip.

The layout wrapper and inner clip do not create stacking contexts. This preserves the current canvas z=0/z=2 relationship with coverable content and protected z=3 controls.

## Authority Boundaries

- Electron owns native bounds, transparency, focusability, and compact passthrough.
- Existing geometry owns 228/200/14 spatial truth.
- The existing panel shell owns all DOM gestures and the real interactive area.
- The existing shadow backdrop owns the only exterior CSS drop shadow.
- The existing panel shell owns background and inset border/accent treatment.
- The sole `ExpandedPresentationSurface` owns Thermal, Refraction, localized contact response, halo, WebGL resources, and pixels.
- Existing target policy and runtime own semantic priority and frame scheduling.
- The new clip owns only overflow clipping for non-canvas descendants.

## Capability Contract

- Interior and Refraction are fixed production renderer capabilities.
- Boundary/halo is fixed where the existing geometry exposes the accepted 14px outer gutter.
- A 0-gutter platform remains on the 200-domain Interior+Refraction fallback.
- Capability selection is derived from existing geometry and is not Product/Application state, persistence, Presentation policy, lifecycle state, or IPC.

## Interaction Contract

- `containerRef` remains the pointer-capture and event `currentTarget`.
- FX host and canvas stay `pointer-events:none` and `aria-hidden`.
- The inner clip is pointer-active but owns no handlers; events bubble to the existing panel owner.
- Gutter pixels do not accept panel drag/drop/click actions.
- Full native BrowserWindow bounds remain interactive as today; transparent alpha is not represented as OS click-through.
- Existing native pointer-boundary polling remains unchanged and continues to use full native bounds.

## Runtime And Data Flow

```text
Product / Application facts
  -> existing Expanded target policy
  -> existing one ExpandedPresentationTarget
  -> existing Main Window settled-Full eligibility
  -> existing one Expanded runtime
  -> existing one WebGL program/draw
  -> accepted Interior + Refraction + contact-derived halo pixels
```

Boundary/halo adds no target field, callback, completion, lock, timer, frame source, or clock. Reduced Motion uses the current deterministic shader snapshot and the current `needsFrames()` zero-continuation path.

The accepted Thermal branch is a fixed visual replacement that returns before the legacy shader activation/progress composite. Existing targets still own semantic priority, runtime inputs, Full eligibility, and DOM authority; they do not gain a boundary-specific visual lane. Ordinary motion keeps the existing single continuous Thermal phase while eligible, and Reduced Motion remains static with zero continuing frames.

## Compatibility

- Windows: implementation and actual transparent-window validation required.
- macOS: same geometry path is planned, but visual/native behavior is `NOT VERIFIED` without a host.
- 0-gutter platforms: no exterior halo; 200-domain Interior+Refraction fallback.
- WebGL failure: existing fail-closed decorative absence; semantic DOM remains authoritative.

## Rollback

Rollback only the production outer-host/inner-clip composition and omit `boundaryHalo`; restore the original 200px clipped surface while retaining accepted Interior+Refraction. No state migration, native rollback, or scheduler cleanup exists.

## Rejected Alternatives

- Native resize or new transparent child window: production already owns 228px.
- A second canvas/program/pass for the halo: violates the accepted authority contract.
- Moving gesture handlers to the outer host: widens the invisible hit target.
- Copying Lab shadow onto the clip/canvas: creates a competing shadow authority.
- A Product/Application boundary mode or feature flag: fixed renderer capability needs no semantic state.
- Per-pixel native hit testing: scope expansion unrelated to the visual integration.
- Shader parameter retuning: repository mapping preserves accepted panel units.
- Recombining the accepted Thermal output with legacy shader activation/progress pixels: a new visual/composition design outside this integration.

## Open Questions

None blocking. GPT Architecture Lead Planning Review is the next gate.
