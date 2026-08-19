# Diagnostics Readability and Export Cleanup Planning

## Goal

Produce a repository-grounded implementation plan that makes Ameow's user-shareable diagnostics readable, bounded, useful, and privacy-safe while preserving existing typed Product / Runtime terminal semantics as the only error-semantics authority.

The plan must distinguish a main-window incident-scoped human-readable Copy report from a Settings support-oriented Export report, while identifying the smallest shared diagnostic semantics and sanitization boundary needed by both.

## Confirmed Direction

- Typed outcomes and terminal classification remain authoritative; diagnostics may only read those facts.
- Raw yt-dlp, gallery-dl, ffmpeg, runtime, Electron, and native output is evidence and must not be parsed to recreate Product semantics.
- Quick Copy and Settings Export have different scope and detail, but must share diagnostic meaning and sensitive-data policy.
- Chronology and meaningful retries/repeated failures must remain visible; only obvious local progress/repetition noise may be collapsed.
- No generic logging, tracing, observability, telemetry, analytics, remote upload, AI analyzer, or cloud-diagnostics platform.
- This task is planning-only. Do not edit production code, start implementation, grant Architecture PASS, or create/switch an implementation branch or worktree.

## Requirements

- Trace current backend/raw log production, collection, retention, persistence, propagation, formatting, copy, and export paths end to end.
- Identify the actual data and formatting path for the main-window Copy Diagnostic action.
- Identify the actual data, scope, retention, and format for Settings Export Logs.
- Inventory reusable typed failure, terminal outcome, diagnostic, and bounded-history structures.
- Record ownership of Download, Transcode, runtime dependency/bootstrap, Electron, and native diagnostic facts.
- Identify duplicate pipelines, formatting, or sanitization between Copy and Export.
- Locate existing redaction/sanitization authority and document its coverage gaps.
- Classify backend output into useful evidence versus progress/repetition noise without proposing semantic inference from text.
- Evaluate existing retention, bounded-history, and session-scope mechanisms for reuse.
- Identify concrete sensitive-data exposure risks, especially cookies, Authorization/tokens, signed URL/query data, browser credentials, user paths, and command arguments.
- Recommend the minimum one-way dependency shape that keeps Diagnostics read-only with respect to Download, Transcode, Runtime, lifecycle, and config authorities.
- Recommend, from repository evidence only, whether implementation should be an MR9 prerequisite repair or an independent implementation line.

## Planning Deliverables

- Current-state diagnostic/data flow.
- Architecture, readability, and privacy findings.
- Minimum architecture direction and authority/dependency boundaries.
- Quick Copy versus Settings Export responsibilities.
- Canonical sanitization boundary.
- Structured facts versus raw evidence relationship.
- Compatibility and migration considerations.
- Validation strategy.
- Implementation scope and explicit non-goals.
- MR9 landing recommendation without branch/worktree creation.

## Acceptance Criteria

- [x] Every material claim is anchored to repository files/tests or clearly labeled as a planning recommendation.
- [x] The report covers Download, Transcode, runtime dependency/bootstrap, Electron/native facts, main-window Copy, and Settings Export.
- [x] The report preserves typed terminal semantics as authority and raw output as evidence only.
- [x] The report defines one canonical pre-egress sanitization boundary shared by Copy and Export, with concrete threat categories and coverage expectations.
- [x] The report proposes bounded, chronology-preserving readability behavior that does not erase retry or repeated-failure meaning.
- [x] The report identifies a minimal implementation surface and explicit non-goals without introducing a generic observability framework.
- [x] The report gives a repository-grounded MR9 prerequisite-versus-independent-line recommendation.
- [x] Planning artifacts are returned for GPT Architecture Lead review; implementation remains gated.

## Blocking Open Questions

None for planning. Architecture Review may request changes, but no unresolved user-owned product, scope, UX, compatibility, or risk decision blocks this report.

## Notes

- The user explicitly authorized Trellis planning and Develop Worker research in the initial request.
- This is a complex planning task and will also produce `design.md` and `implement.md`, but it will not run `task.py start`.
