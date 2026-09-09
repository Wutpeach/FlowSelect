# Compact mascot ear-root integration — implementation report

## Implemented boundary

- `renderCompactMascotScene` remains the shared Production/Lab composition seam.
  It preserves the core-projected ear paths and IDs by concatenating core
  `back*` then `front*` output into Compact `back*`, with Compact `front*`
  empty. The opaque existing head/body consequently overpaints embedded ear
  roots through existing SVG painter order.
- `avatar-core`, the canonical Compact definition/ear geometry, pointer writer,
  shell geometry, lifecycle, scheduling, and all 09-07 evidence were left
  unchanged.
- The Compact character-motion contract now identifies final ear paint-layer
  ownership as composition-owned rather than core whole-node classification.

## Regression evidence

- Extended `compactMascotBehaviorRuntime.test.ts` proves neutral plus every
  retained action frame (`surprised`, `curious-short`, `playful-short`) retains
  the exact flattened core paths and IDs, has two behind-head paths, and has no
  front paths/IDs.
- The existing Lab preview, bounded-pointer, Reduced Motion static, one-rAF,
  pause/resume, stale-disposal, Production/Lab reuse, surface, and import-boundary
  tests remain green. Pointer keeps ear/head paths unchanged while eyes move.
- `capture-ear-root-lab-evidence.mjs` is a task-local capture seam. It asserts
  the real Compact SVG has non-empty `back-0/1` paths and empty `front-0/1`
  paths before each capture, including the bounded 75%/25% pointer sample.

## Visual evidence

- `lab-captures/` contains 28 actual Lab PNGs: black and white themes; 1x and
  3x neutral, pointer, Reduced Motion, surprised, curious-short, and
  playful-short states; plus the bounded-pointer sample at both scales.
- Manual 3x review of black curious-short, playful-short, surprised,
  bounded-pointer, and white curious-short confirms the opaque head covers ear
  roots while exterior ear regions remain visible. The capture script provides
  DOM-layer assertions for every image.
- The Vite development server intermittently stalled while transforming the Lab
  after its first navigation. Black captures were completed through that server;
  white captures were completed from a task-local static Lab build. No native
  holder/window was available, so no native screenshot is claimed or fabricated.

## Checks run

| Check | Result |
| --- | --- |
| `npm test -- src/presentation/main-window/compactMascotBehaviorRuntime.test.ts` | 1 file / 11 tests passed |
| Focused Compact, architecture/import guard, Lab stage/scenario/reuse suite | 19 files / 297 tests passed |
| `npm run type-check` | passed |
| `npm run lint` | passed |
| `python ./.trellis/scripts/task.py validate .trellis/tasks/09-09-compact-mascot-ear-root-integration` | passed (4 implement + 4 check context entries) |
| Task-scoped `git diff --check` | passed |

## Stop boundary

No Architecture PASS is awarded here. Geometry refinement, OneWorks cleanup,
`avatar-core` changes, and later-stage work remain out of scope.
