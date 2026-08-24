---
title: Error Messages and Error Codes
description: Troubleshoot Ameow issues by matching the message, task state, or download error code you see.
---

When you hit an error, keep the full message. Some parts of Ameow show user-readable error text, while logs or bug reports may include internal error codes. The code helps narrow the direction, but it should be read together with the task state, site, link, and output folder.

When a download fails, Ameow shows a stable error message (for example `Download failed (E_EXECUTION_FAILED)`) with an error classification. Raw `yt-dlp`, `gallery-dl`, or `ffmpeg` output is not shown directly in the interface; to find the specific cause, use the copy icon in the center prompt to send the diagnostics to the developer, or see the common original-message notes below.

Fast rule: **start with the text you can see, use the error code as supporting evidence, then keep the full message when reporting the issue.**

## Copy Diagnostics From The Center Prompt

When a download or transcode fails, Ameow's main window now shows a short plain-language reason first, such as expired login state, network trouble, unavailable save location, or video processing failure. If a copy icon appears next to that message, click it to copy diagnostics for that specific failure.

The copied content is a readable, sectioned diagnostic report (format version v2) scoped to **this one failure only**. It includes the Ameow version, platform, task trace id, a safe link summary (origin only), internal error code, error classification, diagnostic category, and an ordered attempt summary (engine, cycle, outcome, fallback, auth recovery, and retries are all preserved). Only for Transcode or legacy failures without a structured attempt record does the report attach one bounded, sanitized line of raw process evidence, explicitly labeled as evidence — never as the error classification. The report does **not** include the session runtime-log excerpt or any other task's content.

For privacy, the full link, local paths, cookies, tokens, proxy endpoints, and unredacted downloader output never appear in the diagnostics; a short privacy note is included at the end. Paste the whole readable report to the developer when reporting a problem — it is usually more useful than a screenshot of the short message alone.

The **Export diagnostic log** button in Settings remains available for full environment and settings snapshots. The center-prompt copy icon is the faster path for sending one failed task to the developer.

## Start With The Text You See

| Message or keyword | Usually means | First action |
| --- | --- | --- |
| `Disconnected` | The browser extension is not connected to the desktop app | Start Ameow, reload the extension, then see [Extension Disconnected](./extension-disconnected/) |
| `Preparing` never ends | Ameow is resolving the link, preparing a runtime, waiting for network, or waiting for login state | Wait briefly; if several public links behave this way, see [Download Runtimes and Automatic Preparation](../../advanced/download-dependencies/) |
| `cookies`, `login`, `sign in`, `authentication`, `authorization` | The site needs login state or cookies | Log in in the browser, then send the task from the page with the extension |
| `403`, `forbidden` | The site refused access, often because of login state, region, proxy, or site-rule changes | Open the same page in the browser first, then send it from the extension |
| `HTTP Error 412`, `Precondition Failed` | The site rejected a metadata or media request, often because of login state, site checks, link state, or downloader rule changes | See [BiliBili 412](#bilibili-http-error-412-precondition-failed) below; keep the full original message |
| `timeout`, `timed out`, `network`, `fetch failed` | A network request failed or timed out | Check network/proxy takeover and test with a public link |
| `429`, `too many requests`, `rate limit` | The site is rate limiting repeated access | Wait before retrying and avoid repeated immediate retries |
| `Requested format is not available`, `No video formats found` | The selected quality/format is unavailable, or the downloader could not find downloadable media | Try a lower or manual quality; update Ameow/yt-dlp if it still fails |
| `ffmpeg exited with code ...`, `Conversion failed` | The merge, remux, or transcode step failed | Try another quality or format; include the full error and source link when reporting |
| `gallery-dl exited with code ...` | `gallery-dl` failed; the detail after the colon is usually the useful part | Look for `403`, `timeout`, `cookies`, or similar keywords in the same message |
| `yt-dlp exited with code ...` | The downloader process failed; nearby text usually contains the real cause | Look for site, login, proxy, or format details in the same message |
| `produced no final output path` | The downloader finished but did not report a final file | Open the current output folder and check whether conversion or intermediate files are still present |
| `Download cancelled` | The task was cancelled | Send the task again; if it cancels without your action, record the steps |

If the message includes English text from a tool, copy it exactly when reporting a problem. Avoid reducing it to only "download failed".

## What Do Download Error Codes Mean?

These codes are mainly used by the download pipeline, logs, and issue investigation. The app UI may not always show them directly.

| Error code | Meaning | What to do |
| --- | --- | --- |
| `E_ABORTED` | The task was cancelled | Send the task again; if it repeats automatically, record the steps |
| `E_AUTH_REQUIRED` | Login state, cookies, or authorization are required | Log in in the browser and send from the page with the extension |
| `E_INVALID_DOWNLOAD_INPUT` | The input is not a usable download link or is missing required data | Copy the full link again and test with a public link |
| `E_INVALID_INTENT` | The request is incomplete or does not match current rules | Send it again; if it came from the extension, reload the extension first |
| `E_NO_PROVIDER_MATCH` | No available site handler matched this link | Confirm whether the site is supported and test with a public link |
| `E_ENGINE_NOT_FOUND` | The matching download engine could not be found | Restart Ameow; if it persists, update to the latest stable version |
| `E_ENGINE_UNAVAILABLE` | A download engine is temporarily unavailable | Wait for runtime preparation, or see [Download Runtimes and Automatic Preparation](../../advanced/download-dependencies/) |
| `E_ENGINE_REJECTED_INTENT` | One download engine cannot handle this task | Try another quality preference or send from the exact page with the extension |
| `E_DIRECT_SOURCE_REQUIRED` | Ameow needs a more direct media URL or page context | Prefer sending from the current page with the browser extension |
| `E_EXECUTION_FAILED` | The downloader command failed | Troubleshoot by the error classification (login, network, format, etc.); copy the diagnostics when reporting |
| `E_INVALID_ENGINE_PLAN` | Ameow could not build a valid download plan | Update to the latest stable version; keep the link and message for reporting |
| `E_NO_ENGINE_SUCCEEDED` | All attempted download paths failed | Test a public link, lower quality, confirm login state, and check proxy routing |
| `E_OUTPUT_NOT_FOUND` | The downloader did not provide a final output file | Open the current output folder and check whether conversion is still running; report the full message if it repeats |

## What Do Common Downloader Messages Mean?

These messages usually come from the downloader or the site response. They are different from the `E_*` internal codes above: `E_*` tells you which part of Ameow's download pipeline failed, while the original downloader text is closer to the site or tool-specific cause.

| Original message or keyword | Usually means | First action |
| --- | --- | --- |
| `ERROR: [BiliBili] ... Unable to download JSON metadata: HTTP Error 412 Precondition Failed` | BiliBili rejected the metadata request. This can involve login state/cookies, site checks, link state, region restrictions, request headers, or yt-dlp rule changes | See [BiliBili 412](#bilibili-http-error-412-precondition-failed) below |
| `HTTP Error 403: Forbidden` | The site refused access. Common causes include missing login state, expired cookies, region limits, proxy mismatch, or site-rule changes | Confirm the same page plays in the browser, then send it from the extension |
| `HTTP Error 404`, `Private video`, `video unavailable`, `not available in your country` | The content is inaccessible, private, removed, or region unavailable | First confirm whether the browser can access it; if not, Ameow usually cannot fix it |
| `HTTP Error 416: Requested Range Not Satisfiable` | Resume range mismatch, often from an old `.part` temp file or a changed server response | Remove matching leftover temp files and retry; report the full error if it repeats |
| `429`, `Too Many Requests`, `rate limit` | The site is rate limiting repeated requests | Wait before retrying, avoid immediate repeated retries, and refresh login state if needed |
| `timeout`, `timed out`, `ECONNRESET`, `ENOTFOUND`, `EAI_AGAIN`, `fetch failed` | Network, DNS, or proxy routing failed | Confirm whether your proxy covers Ameow and downloader subprocesses, then test with a public video |
| `Requested format is not available` | The selected quality or format is unavailable, or the site response changed | Try a lower or manual quality, then update Ameow/yt-dlp |
| `No video formats found` | The downloader could not find downloadable media, often because of site-rule changes, unsupported link type, or missing login state | Send from the actual page with the extension, confirm login state, then update Ameow/yt-dlp if needed |
| `Sign in to confirm you're not a bot` | The site triggered login or anti-bot checks, commonly on YouTube | Log in in the browser, send from the extension, and check proxy route consistency |
| `Fresh cookies ... needed` | The site needs newer cookies | Log in again in the browser and refresh the matching site login state in Ameow |
| `ffmpeg exited with code ...`, `Conversion failed` | The post-download merge, remux, or transcode step failed | Try another quality/format; include the full error and source link when reporting |
| `gallery-dl exited with code ...` | `gallery-dl` itself failed; the HTTP, login, or network text after the colon is the important part | Continue troubleshooting by the specific keyword in the same message |
| `produced no final output path`, `finished without producing an output file` | The downloader finished but did not give Ameow a final file path | Open the output folder and check leftover files; report the full error if it repeats |

### BiliBili `HTTP Error 412 Precondition Failed`

If you see a message like this:

```text
ERROR: [BiliBili] 1E642127rm: Unable to download JSON metadata: HTTP Error 412 Precondition Failed
```

The downloader was rejected while requesting video metadata from BiliBili. `412 Precondition Failed` is not an Ameow internal error code; it is the site's HTTP response. Common directions include:

- The page plays in your browser, but the downloader did not receive the same login state or cookies.
- BiliBili triggered site checks, region limits, age/member/bangumi restrictions, or link-state restrictions.
- The BiliBili page or API changed, so Ameow or yt-dlp needs an update.
- The link is not a normal public video, or the video is expired, app-only, member-only, or region-limited.

Try this order:

1. Open the same page in the browser and confirm it plays normally.
2. If login is required, log in to BiliBili in the browser first.
3. Prefer sending the task from the current page with the Ameow browser extension, instead of pasting only the URL.
4. Refresh the BiliBili site login state in Ameow, then retry.
5. Update Ameow or yt-dlp and try again.
6. If it still fails, include the complete original error text, page link, Ameow version, and whether you sent it from the extension.

## Common Situations

### Login, Cookie, Or 403 Messages

Open the same page in the browser first and confirm it plays or displays normally. Then use the Ameow browser extension from that page. Pasting only the URL may not give the desktop app enough session context.

### YouTube Plays In The Browser, But Ameow Fails

Suspect a proxy mismatch first. Browser playback does not prove that Ameow and its downloader subprocesses use the same route. Try TUN, global, VPN, or system-proxy takeover mode in your proxy tool, then test with a public video.

### Stuck Preparing Or Runtime Unavailable

On first use of some download paths, Ameow may prepare components such as `yt-dlp`, `gallery-dl`, `ffmpeg`, and `deno`. Wait briefly first. If several public links stay in `Preparing`, restart and update to the latest stable version.

### Done But The File Is Missing

This is usually not an error-code problem. Open the current output folder from Ameow and sort by modified time. Dropping a folder changes the output folder, so the file may not be in the default desktop folder.

## What Should I Include In A Bug Report?

Include as much of this as possible:

1. If the center prompt has a copy icon, paste the whole copied diagnostic report first.
2. The full error message or a screenshot with the error code.
3. Ameow version and operating system.
4. Site type, such as YouTube, Bilibili, X / Twitter, Douyin, or Xiaohongshu.
5. Task state: no task, preparing, failed, or done but missing file.
6. Whether you sent it through the browser extension, and whether the extension showed `Connected`.
7. Whether login is required, whether you use a proxy, and whether the output folder is writable.

This is much easier to debug than only saying "download failed".
