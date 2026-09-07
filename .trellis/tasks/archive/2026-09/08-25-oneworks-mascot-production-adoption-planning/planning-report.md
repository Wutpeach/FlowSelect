# OneWorks Mascot Production Adoption Planning Report

Date: 2026-08-25

## Outcome

Route A is the correct ownership model and has no renderer/lifecycle mechanism blocker. The currently published direct React entry is nevertheless **not ready for Production adoption** under the fixed no-Editor constraint: `@oneworks/avatar-react@1.0.0-rc.6` is a single pre-bundled renderer+editor artifact, and importing `Avatar` retains Editor code, persistence paths, authoring strings, and editor CSS in emitted production assets.

Therefore:

- Route A mechanism: GO for continued upstream dependency work.
- Route A implementation from the current root package entry: BLOCKED.
- Preferred unblock: an upstream renderer-only JS and CSS entry/package, pinned and verified.
- Route B/C: not authorized; no repository/runtime mechanism failure justifies the pivot.
- Architecture PASS: not granted.

## Recommended Production Model

- Existing Ameow lifecycle, native visibility, Compact/Full state, shell choreography, and Pointer Field stay authoritative.
- `CompactMascot` remains the narrow host and owns only its local rAF, visibility pause/resume, Reduced Motion settlement, and disposal.
- Pointer truth flows one way through the existing attention recipe and a new pure pose projection into the controlled OneWorks definition.
- Ameow keeps the quiet deadline and action-selection clock. OneWorks supplies pure clip/frame and rendering mechanics; upstream interactive state and playback are disabled.
- The canonical candidate is promoted verbatim into one production definition module with provenance and checksum guards. Lab consumes that module; the archived JSON remains evidence only.

## Migration and Rollback

- Prove the renderer-only upstream boundary first.
- Add and test pure definition/pose/action/runtime leaves.
- Rewire the existing host without changing Surface, lifecycle, Pointer Field, native geometry, or Compact/Full authority.
- Pass actual-size visual, lifecycle, bundle, production build, packaged `file://`, Windows, and macOS gates.
- Delete the diamond definition/runtime and remove avatar-core before completion.
- Rollback is a git revert; no runtime feature flag or dual renderer is retained.

## Remaining Gates

- upstream renderer-only artifact availability;
- exact final bundle/package delta;
- actual 56 px holder visual fidelity with the fixed candidate;
- production pointer/action performance;
- packaged Electron `file://` behavior;
- Windows native lifecycle and macOS package/runtime validation.

The first item blocks implementation. The remaining items are implementation validation gates and must not be reported as verified yet.
