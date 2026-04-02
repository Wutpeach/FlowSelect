# Cross-Layer Thinking Guide

> **Purpose**: Think through data flow across layers before implementing.

---

## The Problem

**Most bugs happen at layer boundaries**, not within layers.

Common cross-layer bugs:
- API returns format A, frontend expects format B
- Database stores X, service transforms to Y, but loses data
- Multiple layers implement the same logic differently

---

## Before Implementing Cross-Layer Features

### Step 1: Map the Data Flow

Draw out how data moves:

```
Source → Transform → Store → Retrieve → Transform → Display
```

For each arrow, ask:
- What format is the data in?
- What could go wrong?
- Who is responsible for validation?

### Step 2: Identify Boundaries

| Boundary | Common Issues |
|----------|---------------|
| API ↔ Service | Type mismatches, missing fields |
| Service ↔ Database | Format conversions, null handling |
| Backend ↔ Frontend | Serialization, date formats |
| Renderer ↔ Preload ↔ Main | BrowserWindow webPreferences drift, missing desktop bridge, hot-path IPC latency, event-channel fan-out leaks |
| Component ↔ Component | Props shape changes |

### Step 3: Define Contracts

For each boundary:
- What is the exact input format?
- What is the exact output format?
- What errors can occur?
- If two layers provide the "same" value, which layer is authoritative and what validation is required before one layer can override the other?

---

## Common Cross-Layer Mistakes

### Mistake 1: Implicit Format Assumptions

**Bad**: Assuming date format without checking, or assuming an extension/media hint is valid enough to override a canonical backend resolver result.

**Good**: Explicit format conversion at boundaries, plus explicit source-of-truth precedence and revalidation before override.

### Mistake 2: Scattered Validation

**Bad**: Validating the same thing in multiple layers

**Good**: Validate once at the entry point

### Mistake 3: Leaky Abstractions

**Bad**: Component knows about database schema

**Good**: Each layer only knows its neighbors

### Mistake 4: Unguarded Long-Lived Connection Callbacks

**Bad**: A browser worker or client transport mutates global connection state from async socket callbacks without checking whether that socket is still the current connection instance.

**Good**: Treat each long-lived connection as its own instance, ignore stale callbacks from superseded sockets, and use reconnect fallbacks that do not depend on only one lifecycle event firing.

### Mistake 5: Treating Desktop Bridge Availability As A Renderer-Only Concern

**Bad**: Assuming `window.flowselect` will exist because the preload file compiles, without checking the BrowserWindow `webPreferences`, route boot mode, and renderer bootstrap path together.

**Good**: Define the desktop boundary end-to-end: BrowserWindow configuration, preload exposure, and renderer fail-fast bootstrap all need one shared contract.

### Mistake 6: Using Request/Response IPC Or Shared Channels In Hot Paths

**Bad**: Sending every drag-frame update through `invoke(...)`, or multiplexing all desktop app events through one global IPC channel and filtering in the renderer.

**Good**: Keep high-frequency motion on fire-and-forget channels with batching, and give each semantic app event its own IPC channel so listener count scales predictably.

### Mistake 7: Treating A Blank Packaged Desktop Window As Only A Native-Window Bug

**Bad**: Seeing a packaged Electron window with only a host background and assuming the remaining problem must be transparent-window timing, z-order, or compositor behavior.

**Good**: Treat packaged desktop rendering as one end-to-end contract: BrowserWindow route, `file://` path shape, preload availability, and built asset URLs all need verification before concluding the renderer mounted.

### Mistake 8: Letting Superseded Async UI Transitions Commit Native Side Effects

**Bad**: A renderer starts compact-window shrink and full-window restore flows from different callbacks, but any late async completion can still commit `setBounds(...)` because the code has no notion of which transition request is still current.

**Good**: Treat renderer -> preload -> main window-bounds work as one transition contract. Each compact/full request needs a monotonic transition token or epoch, and every async completion must verify that its token is still current before mutating renderer state or native bounds.

### Mistake 9: Treating Browser File-Like Drag Data As Proof Of A Local Filesystem Path

**Bad**: A preload or desktop drop bridge sees `dataTransfer.files.length > 0` or `item.kind === "file"` and assumes the drag came from the local filesystem, so it consumes the drop before the renderer gets a chance to handle normal web URLs/images/videos.

**Good**: Split "file-like browser drag payload" from "real local path". Only route into local file/folder handling after a concrete filesystem path has been resolved and validated. If the path cannot be resolved, return `null` and let the normal renderer web-drag flow continue.

### Mistake 10: Treating A Visible Media URL As Equivalent To Readable Media Bytes

**Bad**: Seeing that a dragged image/video exposes a real CDN URL in the DOM, drag payload, or even the browser address bar, then assuming a content script, page bridge, or canvas export can always read the bytes directly.

**Good**: Model protected media as a staged fallback contract. DOM discovery, content-script fetch, page-context fetch, extension background fetch, and authenticated desktop download can fail for different reasons (`tainted canvas`, CSP, CORS, referer/cookie checks). Define the fallback order explicitly and verify each stage independently.

---

## Checklist for Cross-Layer Features

Before implementation:
- [ ] Mapped the complete data flow
- [ ] Identified all layer boundaries
- [ ] Defined format at each boundary
- [ ] Decided where validation happens
- [ ] Decided which layer owns the canonical value when duplicate hints arrive from multiple layers

After implementation:
- [ ] Tested with edge cases (null, empty, invalid)
- [ ] Verified error handling at each boundary
- [ ] Checked data survives round-trip
- [ ] Verified that low-trust hints cannot silently override higher-trust resolved data without validation
- [ ] Verified that browser-originated `Files` / `kind === "file"` payloads do not preempt local file/folder handling unless a real filesystem path was resolved
- [ ] Verified drag payload extraction against both direct media elements and container/card targets (for example nested `<img>` or `background-image:url(...)` thumbnails)
- [ ] Verified CSP / CORS / hotlink failures at one browser layer still fall through to the next declared fallback instead of surfacing as a generic timeout
- [ ] Verified that stale async callbacks from older connection instances cannot overwrite newer connection state
- [ ] Verified reconnect logic still progresses when one lifecycle callback is skipped or delayed
- [ ] Verified desktop bridge availability from BrowserWindow config through preload exposure to renderer bootstrap
- [ ] Verified packaged `file://` desktop routes resolve bundled JS/CSS/assets from the app directory instead of root-relative `/assets/...` paths
- [ ] Verified pointer-move or other hot-path IPC does not depend on per-frame request/response round-trips
- [ ] Verified desktop event subscriptions use scoped channels and clean up the exact listener they register
- [ ] Verified async UI transition completions cannot commit stale native side effects after a newer compact/full request supersedes them

---

## When to Create Flow Documentation

Create detailed flow docs when:
- Feature spans 3+ layers
- Multiple teams are involved
- Data format is complex
- Feature has caused bugs before
