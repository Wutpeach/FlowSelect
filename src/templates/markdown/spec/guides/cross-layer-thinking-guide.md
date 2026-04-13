# Cross-Layer Thinking Guide Sync

Source of truth during local AI work lives in `.trellis/spec/guides/cross-layer-thinking-guide.md`.
This tracked copy preserves the non-obvious lessons that should survive beyond one local session.

## Added Lesson: Weak Drag Guess vs Canonical Note Hint

### Mistake

Treating a weak waterfall-card drag classification as final even after a higher-trust note hint appears later.

Typical failure shape:
- content script sees only a cover image and emits `mediaType: "image"`
- later layers recover `noteId`, tokenized `detailUrl`, cookies, or medium/high video intent
- desktop still finalizes the cover-image path because the first weak guess already short-circuited the flow

### Correct Pattern

Use an explicit trust order for media hints:

1. Direct resolved media URL/candidate
2. Tokenized/canonical note detail URL
3. Note-linked structured state/API result
4. Card-local DOM guess

If a higher-trust note hint arrives later:
- do not finalize image download yet
- continue note-aware resolution
- only settle to image when canonical note resolution is exhausted

## Cross-Layer Checklist Additions

- Preserve `noteId`, tokenized `detailUrl`, `sourcePageUrl`, and video-intent metadata across browser script -> extension background -> desktop runtime.
- Verify that a weak early image classification cannot suppress a later higher-trust video-capable note hint.
- Verify that hidden/background detail fallback still runs when the direct resolver returns only a cover image but canonical note context is available.

## Added Lesson: Isolate Native Settle Before Retuning Transparent Renderer Motion

When a transparent desktop window flashes right after an animation appears complete, do not assume the renderer shell motion is the cause.

Split the flow into:

1. renderer visual motion
2. native post-animation settle

For compact-window passthrough debugging, disable the native settle first, then re-enable native calls one by one:

- `setIgnoreMouseEvents(true, { forward: true })`
- `setFocusable(false)`
- `blur()`

This session's result:
- `ignoreMouseEvents` alone did not flash
- `setFocusable(false)` also did not flash
- `blur()` was the flashing trigger
