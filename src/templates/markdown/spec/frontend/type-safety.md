# Frontend Type Safety Sync

Tracked snapshot of the Xiaohongshu drag payload contract.

## Embedded Xiaohongshu Drag Payload

```ts
type EmbeddedXiaohongshuDragPayload = {
  token: string | null;
  pageUrl: string | null;
  detailUrl: string | null;
  sourcePageUrl: string | null;
  noteId: string | null;
  exactImageUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  videoCandidates: XiaohongshuDragCandidate[];
  mediaType: "video" | "image" | null;
  videoIntentConfidence: number | null;
  videoIntentSources: string[];
  title: string | null;
};
```

## Required Frontend Behavior

- Preserve `detailUrl`, `videoIntentConfidence`, and `videoIntentSources` when parsing embedded drag payloads.
- Forward `detailUrl` into `resolve_xiaohongshu_drag_media`; do not silently drop it.
- Treat `kind === "video"` or `videoIntentConfidence >= 0.7` as enough to keep the note on the video-resolution path.
- `pickXiaohongshuImageForDownload(...)` must return `null` when resolved media already says `kind === "video"`.

## Regression Checks

- Embedded payload parsing keeps tokenized `detailUrl`.
- Renderer invoke payload still contains `detailUrl`.
- Resolved video notes never fall back to downloading the cover image in the renderer.
