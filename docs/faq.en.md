# FAQ

[中文](./faq.md) | [English](./faq.en.md)

## What If macOS Blocks The App On First Launch?

First try right-click `Open`, or allow the app from `System Settings > Privacy & Security`.

If quarantine still blocks the app, run:

```bash
xattr -dr com.apple.quarantine "/Applications/FlowSelect.app"
```

## What If Downloads Fail Or Never Start?

First confirm:

- the output folder is still writable
- the network connection is working
- FlowSelect is not being blocked by a firewall or security tool
- the current site is still supported, or the current URL is still valid

If the issue is part of a web-video download flow, also try:

- copying the page URL again and pasting it back into FlowSelect
- restarting the app and retrying
- confirming that the browser extension is connected to the desktop app

## What If The Browser Extension Shows Disconnected?

First confirm:

- the FlowSelect desktop app is already running
- the extension popup is not showing `Disconnected`
- local communication is not being blocked by a firewall

If the issue continues:

- close and reopen the desktop app
- reload the browser extension
- reopen the extension popup and check the status again

## What If I Cannot Find The Downloaded Files?

- The default output folder is `Desktop/FlowSelect_Received`.
- Double-click the empty area of the main window to quickly open the current output folder.
- Right-click the main window to open the current output folder or choose a new one.

## Need More Help?

You can also check:

- [Getting Started](./getting-started.en.md)
- [Browser Extension](./browser-extension.en.md)

If the issue looks version-specific, see the matching [Release Notes](../release-notes/).
