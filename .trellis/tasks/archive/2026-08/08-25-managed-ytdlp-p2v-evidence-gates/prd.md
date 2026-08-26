# Close P2-V prerequisite evidence gates

## Goal

Complete the minimum repository and packaged-runtime research/validation needed to close P2-V before P2-A. Produce an evidence-backed decision on Windows runtime truth, Windows persistence/trust, macOS trust gates, yt-dlp offline package-set viability, dependency identity stability, and the minimum authenticity/integrity policy.

This task is validation and architecture closure only. It must stop before P2-A implementation and must not introduce updater, activation, rollback, GC, post-pin fallback, or a universal backend updater.

## Requirements

### Windows runtime contract

- Establish one authoritative packaged-runtime contract covering FFmpeg/FFprobe execution paths, yt-dlp `--ffmpeg-location`, child `PATH`, Diagnostics observations, bootstrap/repair paths, and Deno discovery/execution.
- Reconcile the active proxy-front specification with the actual `real/` implementation using repository and packaged/runtime evidence.
- Identify every remaining double-path, stale spec, or packaged inconsistency that must be repaired before P2-A.

### Windows persistence and trust

- Verify installed and portable `userData`/runtime storage using actual packaged artifacts or the strongest available executable evidence.
- Verify whether managed runtimes persist across Ameow upgrades and distinguish confirmed behavior from assumptions.
- Determine whether Authenticode or executable trust is a P2-A blocker, a later release-hardening requirement, or not relevant to the chosen wheel/bundled-Python model.

### macOS trust gate

- Establish repository-confirmed behavior for bundled Python, downloaded yt-dlp wheels, materialized venvs, executable bits, relocation, and venv rebuild.
- Determine whether wheel/venv materialization creates a trust boundary distinct from the existing unsigned/non-notarized app.
- Require real arm64 host validation for any fact repository evidence cannot prove. Include x64 only if current release support still promises x64.
- Report unavailable host validation as an explicit release gate; never replace it with inference.

### yt-dlp package-set contract

- Determine the actual yt-dlp Python package set and runtime components Ameow uses.
- Verify EJS, Deno, `--remote-components`, self-update metadata, and extras behavior sufficiently to decide whether the bundled baseline can be immutable and materialized fully offline.
- Identify any required wheels, JS runtime artifacts, remote fetches, or policy flags that must become part of baseline identity or eligibility.

### Dependency identity stability

- Preserve the invariant that an attempt's yt-dlp candidate and every execution dependency remain stable through process-tree settlement.
- Evaluate the smallest repository-grounded design that satisfies the invariant.
- Treat digest-addressed dependency storage as an option, not a predetermined decision. Recommend it only if existing mutable singleton storage plus a lifecycle/replacement gate cannot reliably satisfy the invariant.

### Authenticity and integrity

- Define the minimum Ameow-owned approved manifest fields for P2-A/P2-B.
- Assign responsibility for HTTPS endpoints, host/final-redirect policy, content length, package hashes, offline install, eligibility evidence, and downgrade handling.
- Keep PGP/signature trust explicitly optional unless an independent trust root is proven necessary and available.

## Acceptance Criteria

- [x] Report defines one Windows authoritative runtime-path/proxy-front/Deno contract.
- [x] Report identifies whether any path or packaged-runtime repair is required before P2-A.
- [x] Report gives evidence-backed installed/portable persistence and Windows trust conclusions.
- [x] Report separates macOS verified facts from real-host release gates and states whether they block P2-A.
- [x] Report proves or rejects a fully offline, immutable yt-dlp baseline package-set.
- [x] Report recommends the minimum dependency-identity stability mechanism and explains why weaker options fail or suffice.
- [x] Report defines the minimum P2 authenticity/integrity policy and whether an independent signature trust root is required now.
- [x] Final verdict is exactly one of `READY FOR P2-A`, `REPAIR REQUIRED`, or `BLOCKED BY EXTERNAL VALIDATION`, with explicit conditions.
- [x] No production updater/activation/rollback/GC/post-pin-fallback capability or broad runtime refactor is implemented.
- [x] No Architecture PASS is granted.

## Out of Scope

- P2-A production implementation.
- Network updater, candidate activation, rollback, garbage collection, or automatic post-pin candidate fallback.
- Repair Center UX or a generic backend updater.
- Broad runtime refactoring unrelated to closing a named evidence gate.
- Claiming macOS packaged behavior without a real supported host result.
