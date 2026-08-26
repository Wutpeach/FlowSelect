# P2-V Release Runtime Evidence Boundary

This task validates the approved runtime contract; it does not change it.

Use task-owned output, userData, install, portable, log, and evidence directories. Do not inspect, alter, or clean default user data unless the packaged application itself creates a disposable-profile default location that the validation explicitly controls.

Treat packaging failure in this order:

1. Identify live processes, handles, antivirus/indexing interaction, permissions, path length, and stale task-owned output.
2. Retry in a fresh task-owned output path and, if necessary, a clean worktree/environment that preserves the same source revision and dirty repair patch.
3. Change repository/config only after the same failure is proven independent of host state.

Evidence must bind each process to its executable path and runtime tree. Machine-installed Python, Deno, FFmpeg, FFprobe, Node, or yt-dlp must not satisfy a check.

Installed/portable validation records application form, executable path, Electron userData path, runtime tree hashes, upgrade/replacement operation, and post-operation hashes. It observes the existing storage contract only.

If a Windows gate cannot be closed because the host/network/security environment prevents a truthful test after safe alternatives are exhausted, return `BLOCKED BY EXTERNAL ENVIRONMENT`. If repository behavior remains defective, return `REPAIR REQUIRED`. Return `READY FOR P2-A` only when all Windows gates pass.
