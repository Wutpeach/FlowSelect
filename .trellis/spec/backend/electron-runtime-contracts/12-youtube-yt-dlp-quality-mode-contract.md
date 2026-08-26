## Scenario: YouTube yt-dlp Quality Mode Contract

### 1. Scope / Trigger

- Trigger: Any task that changes YouTube `yt-dlp` extractor args, `YtdlpQualityPreference`, format selectors, or initial/retry mode selection in `src/electron-runtime/ytDlpDownload.ts`.
- Why this needs code-spec depth: YouTube format availability depends on extractor client mode. A command can succeed while exposing only low-resolution progressive MP4 formats, causing a user-selected `balanced` download to silently save 360p.

### 2. Signatures

Quality preferences:

```ts
type VideoQualityPreference = "best" | "balanced" | "data_saver";
```

Mode owners:

```txt
src/electron-runtime/ytDlpDownload.ts
src/electron-runtime/ytDlpCommandPlan.ts
src/electron-runtime/engineManifest.ts
```

### 3. Contracts

- YouTube downloads must use the extended extractor path by default.
- The runtime must not start public/page-context-only YouTube runs with `youtube:player_client=android,web`; that path can succeed while exposing only low-resolution progressive MP4 formats.
- Extended mode uses `youtube:player_js_variant=tv`, the exact `yt-dlp-ejs` wheel in the immutable bundled yt-dlp baseline, and one explicit app-owned Deno path (`deno:<absolute-path>`). It never fetches remote EJS components or falls back to machine JavaScript runtimes.
- `balanced` selector must try exact `height=1080` formats first, then choose the highest available format at `height<=1080`.
- `best` selects the highest available format, and `data_saver` selects the lowest available profile.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| YouTube `balanced`, no cookies | `runYtDlpDownload(...)` args | First attempt includes `youtube:player_js_variant=tv`, the explicit managed Deno path, and no remote component argument | OK |
| YouTube `best`, plain URL | `runYtDlpDownload(...)` args | First attempt uses the extended extractor path | OK |
| YouTube `data_saver`, no cookies | `runYtDlpDownload(...)` args | First attempt uses the extended extractor path while preserving the data-saver selector | OK |
| YouTube `balanced` selector | `resolveYtdlpFormatProfile(...)` / command args | Exact 1080p entries appear before `height<=1080` fallbacks | OK |
| A YouTube path reintroduces `youtube:player_client=android,web` | code review/tests | Contract failure | Remove the light-mode branch |

### 5. Good / Base / Bad Cases

- Good: `balanced` for `https://www.youtube.com/watch?v=UBqh6ud5LqY` starts with extended extractor args and selects an adaptive 1080p format under `--simulate` when available.
- Base: `data_saver` still uses the data-saver format selector but uses the same extended YouTube extractor path.
- Bad: `balanced` starts with `youtube:player_client=android,web`, sees only `18 640x360`, exits successfully, and saves `...[640x360][balanced].mp4`.

### 6. Tests Required

- `npm test -- src/electron-runtime/ytDlpDownload.test.ts`: assert YouTube `best`, `balanced`, and `data_saver` use extended extractor args by default.
- `npm test -- src/electron-runtime/engineManifest.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts`: format selector and command-plan contracts remain stable.
- `npm run type-check`
- `npm run lint`
- Manual assertion with managed `yt-dlp --simulate`: the current balanced selector plus extended YouTube args selects an adaptive 1080p format for a known reproducer.

### 7. Wrong vs Correct

#### Wrong

```ts
if (context.intent.cookies?.trim()) {
  return "extended";
}
return "light";
```

#### Correct

```ts
if (context.intent.cookies?.trim()) {
  return "extended";
}
return "extended";
```
