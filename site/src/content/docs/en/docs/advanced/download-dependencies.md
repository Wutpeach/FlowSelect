---
title: Download Runtimes and Automatic Preparation
description: Understand why Ameow may spend time in a preparing state before a web download starts and what users should do.
---

Some web-download flows need extra runtime components for probing, downloading, or conversion. Ameow tries to prepare those pieces automatically, which is why you may see `Preparing` for a while on first use or after an update.

When you see `Preparing`, do not start by installing tools manually. Wait briefly, test with a public link, then consider restart or update if it stays stuck.

## Run the read-only self-check first

Open **Settings → System & Support → Read-only diagnostics** to see the runtime, output-folder, browser-extension connection, and download-queue facts Ameow can currently observe. This self-check only reads current state: it does not download or install components, create directories, change settings, retry or cancel tasks, or change the browser-extension connection.

The report distinguishes configured, observed, and probed evidence. `Unknown` or `Not verified` does not necessarily mean a component is broken; it means Ameow cannot prove that fact safely without changing something. A file being present alone is not proof that a tool can run correctly.

Output-folder write permission is checked with a non-mutating operating-system permission check. Permission being granted does not prove that Ameow can create a real file there or finish a download successfully.

## What might you see?

Common signs:

- the first download of a site type takes longer to prepare;
- the queue shows `Preparing` before it starts downloading;
- the task moves into `Converting` after the download;
- after an update, some capabilities need to be prepared again.

This is not automatically an error. First decide whether it looks like normal preparation or an abnormal stall.

## How do I tell normal prep from a problem?

| What you see | More likely | What to do |
| --- | --- | --- |
| First use, then it continues after a short delay | Normal preparation | Wait |
| Several public links all stay in `Preparing` for a long time | Runtime prep or network issue | Restart Ameow and test with another public link |
| Only one site stalls in `Preparing` | Site rules, login state, or link issue | Send it from the extension and check site support |
| The task spends time in `Converting` after download | Format processing | Wait until conversion ends |

## Do users need to install tools manually?

Usually no. Ameow is designed to manage the needed download and processing capabilities itself when possible.

If the docs or Release Notes do not explicitly ask you to install something, avoid changing your system PATH, swapping internal tools, or downloading random external binaries.

## Where are these dependencies stored?

These automatically prepared dependencies are not the image or video files you downloaded, and they are not saved to your current output folder. They are runtime components used by Ameow itself, and Ameow stores them under its user data directory.

On Windows, even when you use the portable build, the common location is:

```text
%APPDATA%\Ameow\runtimes\
```

This folder may contain components such as `yt-dlp`, `gallery-dl`, `ffmpeg`, and `deno`. Temporary archives used during download are placed in the system temporary directory first, then cleaned up after installation and verification.

If you delete the `runtimes` folder, Ameow will prepare the needed components again later. Already downloaded media files are not affected by this folder; they stay in the save location you configured.

Douyin video downloads use the shared `yt-dlp` capability, so there is no separate Douyin downloader runtime preparation step anymore.

## What should I do if it stays in Preparing too long?

Work through this order:

1. wait a little first and rule out normal first-run preparation;
2. confirm the network can reach the site;
3. test with a public link that does not need login;
4. restart Ameow;
5. update to the latest stable release;
6. if the content needs login state, send it through the browser extension.

If even public links keep stalling in `Preparing`, note the version, platform, and link type. That makes later bug reports much easier to investigate.

## How does this relate to download failures?

A failure during preparation is still a download failure, but the fix path depends on the state: task never appears, stays in `Preparing`, explicitly fails, or says `Done` but no file exists. Different states need different checks.
