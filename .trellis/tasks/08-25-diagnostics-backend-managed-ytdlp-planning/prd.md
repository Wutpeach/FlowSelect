# Plan Diagnostics backend lifecycle and managed yt-dlp

## Goal

Produce a repository-grounded P0 planning report for Ameow Diagnostics / Self-check and Repair that establishes whether the existing backend/runtime architecture can safely support a future read-only diagnostics phase and an independently managed yt-dlp update / rollback lifecycle.

This task is planning-only. It must preserve the existing feature/domain download authority and stop before implementation or Architecture PASS.

## Requirements

### Repository facts to establish

- Trace how yt-dlp, FFmpeg, and FFprobe are packaged, located, launched, and consumed by the desktop runtime on supported platforms.
- Identify which existing layer owns backend version, availability, process execution, and failure information.
- Inventory existing download runtime, error classification, Browser Bridge, download-directory, configuration, and platform facts that a future read-only diagnostic can reuse.
- Identify missing facts that P1 Diagnostics would need to expose explicitly.
- Evaluate Windows and macOS packaging, signing, path, quarantine, and permission constraints using repository evidence.

### Architecture constraints

- Diagnostics and Repair are separate responsibilities; diagnostics is read-only by default and must not cause implicit mutation.
- The bundled backend remains an immutable known-good baseline and is never overwritten in the application bundle.
- Ameow application updates and backend updates have separate lifecycles.
- A managed backend must be only a runtime candidate inside the existing download execution boundary; it must not create a second download/runtime authority or bypass feature/domain routing.
- Bundled and managed candidates need explicit selection, fallback, and rollback semantics.
- Backend replacement must be constrained relative to in-flight downloads so a running task has stable executable identity and dependencies.
- This planning validates yt-dlp's independent lifecycle only; it must not pre-design a universal updater for all backends.

### Deliverables

- Recommend the P1 read-only Diagnostics responsibility boundary.
- Decide whether P2 managed yt-dlp update / rollback is feasible and recommend an architecture direction.
- Record duplicate-authority, runtime-replacement, signing/path, and concurrency risks.
- List repository-grounded questions that require verification before implementation.
- Produce `design.md` and `implement.md` as planning artifacts; no production code or UI design.

## Acceptance Criteria

- [x] The planning report states the current backend ownership, lifecycle, and authority with repository anchors.
- [x] The report separates reusable current facts from facts missing for P1 read-only Diagnostics.
- [x] The report assesses P2 managed yt-dlp update / rollback feasibility and gives one recommended architecture direction.
- [x] The report covers duplicate authority, runtime replacement, signing/path/permissions, and concurrent-download risks.
- [x] P1 and P2 responsibilities are separated explicitly.
- [x] Pre-implementation validation questions are enumerated.
- [x] Diagnostics remains read-only and Repair remains explicitly user-triggered / separately authorized.
- [x] Planning stops without implementation, production-code changes, UI design, or Architecture PASS.

## Out of Scope

- Diagnostics UI or interaction design.
- Production implementation, dependency installation, binary download, or runtime mutation.
- A generic updater abstraction for FFmpeg, FFprobe, gallery-dl, or arbitrary future backends.
- Replacing the current download feature/domain authority.
- Declaring architecture approval.

## Technical Notes

- Repository evidence establishes that current yt-dlp is managed in a user-data venv and that no immutable bundled yt-dlp executable baseline exists. P2 therefore remains conditional on introducing and validating a real baseline candidate.
- Windows proxy-front behavior, macOS trust/quarantine behavior for managed executables, portable persistence, and the update authenticity chain remain explicit pre-implementation validation gates.
