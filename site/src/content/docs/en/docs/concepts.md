---
title: Core Concepts
description: Understand how Ameow's floating window, output folder, download queue, browser extension, and settings work together.
---

The Ameow model fits into one sentence: you hand content to the floating window, Ameow saves it using the current settings and output folder, web tasks go through the download queue, and the browser extension supplies extra page context when a site needs it.

You do not need to learn every concept before using Ameow. Remember this path first: **the floating window is the entry point, the current output folder decides where files go, the queue tells you what is happening, and the extension matters when login state or page context is needed.**

## Five core objects

| Concept | What it is | What to remember |
| --- | --- | --- |
| Floating window | The small desktop-edge entry point | Files, folders, and links all go here first |
| Output folder | The place where final files are saved | The current output folder decides where files end up |
| Download queue | Task-state manager for web downloads | Waiting, preparing, downloading, converting, done, failed |
| Browser extension | The bridge between the page and the desktop app | Important when login state or page context matters |
| Settings | Where preferences and behavior live | Output folder, shortcuts, quality, compatibility, and more |

## The floating window is not a traditional main window

Ameow is built around a compact floating window that stays near the desktop edge. It is designed to keep receiving files and links without forcing you into a full management UI every time.

Typical actions:

- Drop in a file: move it into the current output folder.
- Drop in a folder: change the current output folder.
- Paste a link: create a download task.
- Double-click or right-click: open the current output folder.

## The output folder decides where files go

The default output folder is usually `Desktop/Ameow_Received`. But once you have dropped a folder into Ameow, the current output folder may already be different.

That is why the safest way to find a file is not to guess the default path. Open the current output folder directly from Ameow.

## The queue explains download state

A web link does not always turn into a file immediately. It may pass through:

1. Waiting: queued for a download slot.
2. Preparing: resolving the link, checking formats, or preparing runtimes.
3. Downloading: transferring the file.
4. Converting: merging or converting into a more compatible result.
5. Done: the final file was written to the output folder.
6. Failed: the task needs troubleshooting.

Once you understand the states, the next step is clearer: `Waiting`, `Preparing`, `Downloading`, and `Converting` usually mean wait first; `Failed` means troubleshoot; `Done` means open the output folder.

## The browser extension provides page context

Copying a URL usually gives the desktop app only a link. Some sites also need the current page, login state, cookies, player state, or a site-specific entry point. That is where the browser extension helps.

The extension does not replace the desktop app. It must connect to a running Ameow desktop app before it can send tasks.

## You do not need every setting on day one

For first use, only confirm that Ameow can launch, accept a file, and open the output folder. Tune the rest later to match your workflow:

- Output folder: where files are saved.
- Shortcuts: how you summon the window.
- Download quality: balance quality, file size, and stability.
- AE-compatible formats: make media friendlier for post-production tools.
- Launch at startup: keep Ameow ready after login.

## One complete example

Imagine you are organizing assets for a video project:

1. Drop the project folder into Ameow to change the output folder.
2. Drag scattered images from the desktop into Ameow to move them into that folder.
3. Open a video page in the browser and send the task from the extension.
4. Watch the queue move through preparing, downloading, and converting.
5. Open the output folder from Ameow and use the finished files in the project.

That is the core Ameow workflow. If one step does not match what you expect, go back to the matching object first: did the window receive the content, is the output folder correct, did the queue finish, and is the extension connected?
