---
title: Floating Window
description: Use the Ameow floating window to receive files, folders, and web links, and understand the main window actions.
---

The floating window is the main Ameow entry point. It stays near the desktop edge and receives the files, folders, and web links you are organizing. You do not need to open a large management UI first. Just hand content to this small window.

Start by closing one small loop: drop one file, then open the current output folder and confirm it appears. Once that works, web links and extension tasks are easier to diagnose.

[Screenshot: Ameow floating window docked near the desktop edge, ready for files and pasted links]

## What can you hand to it?

| Content | Action | Result |
| --- | --- | --- |
| Local file | Drop it onto the floating window | The file is moved into the current output folder |
| Local folder | Drop it onto the floating window | That folder becomes the new output folder |
| Web link | Copy it, then paste into the window | Ameow tries to create a download task |
| Windows clipboard file | Copy in Explorer, then paste | The file is copied into the current output folder |

The success signal depends on the content type: files appear in the output folder, links enter the queue, and folders change the output folder.

## Common actions

### Drop a file

1. Select a file in Explorer, Finder, or on the desktop.
2. Drag it onto the Ameow floating window.
3. Release it.
4. Open the current output folder and confirm the file is there.

### Paste a link

1. Copy a link in the browser.
2. Make sure the Ameow window can receive input.
3. Press `Ctrl+V`, or `Cmd+V` on macOS.
4. Check whether a task state appears.

If the window is currently in compact icon mode, a download task first expands it into the full panel before progress or result status appears.

### Open the output folder

Double-click an empty area of the window, or right-click the window and open the current output folder. This is the fastest way to find finished files.

## Window position and everyday use

You can keep the floating window on any desktop edge or at any spot that fits your habit. A good location is one that stays easy to reach without blocking your main workspace, such as the right edge or a corner.

If the window seems to disappear, appears in an awkward spot, or the shortcut does not bring it up as expected, first drag it back where you want it and then review the shortcut and startup settings. Keep window-position issues separate from download failures while troubleshooting.

## Common misunderstandings

- Dropping a folder does not copy the entire folder. It changes the output folder.
- Pasting a link does not guarantee every site will download successfully. Site support and login state still matter.
- If you cannot find a file, open the current output folder first instead of guessing the default path.

Next step: if you are not sure where files are being saved, go straight to [Output Folder](../output-folder/).
