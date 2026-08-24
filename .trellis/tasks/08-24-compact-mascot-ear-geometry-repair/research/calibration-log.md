# Compact Mascot ear calibration log

All candidate images were captured from the real browser UI Lab production
`CompactMascot` leaf at its unchanged 80px frame, 60px shell, and 56px holder.
Neutral/front 1x is the selection gate; direct-core bounds are supporting
evidence only.

## Controlled candidates

| Candidate | Two-node geometry | Neutral/front 1x verdict | Follow-up verdict |
| --- | --- | --- | --- |
| 0 — current | `diamond`, `108×190×102`, roundness `1`; `±72/-50/-80`; zero rotation | Rejected: one broad crown rather than two immediate cat ears. | Existing evidence also required `.95` scale for action clearance. |
| 1 — narrow diamond | `diamond`, `90×145×90`; `±66/-72/-72`; mirrored Y/Z `±10/±8` | Rejected: still a crown with weak separation. | Did not improve the primary gate enough. |
| 2 — short diamond | `diamond`, `80×130×82`; `±62/-88/-65`; mirrored Y/Z `±12/±10` | Rejected: the two peaks read uneven rather than naturally paired. | Kept as a proportion comparison, not a final shape. |
| 3 — capsule | `capsule`, `86×125×86`; `±62/-92/-65`; mirrored Y/Z `±12/±10` | Rejected: rounded top reads as bear/bunny crown, not cat ears. | No renderer or primitive capability was added. |
| 4 — rounded cone | `cone`, `86×132×88`, supported rounding/profile parameters; `±62/-86/-70`; mirrored Y/Z `±12/±10` | Rejected: the apex remains too sharp/small for the desired rounded cat tip. | Confirms the OneWorks cone is a proportion reference, not a source to transplant. |
| 5 — balanced diamond | `diamond`, `88×135×90`; `±65/-84/-72`; mirrored Y/Z `±5/±8` | Rejected: broad asymmetric crown remained less legible than the wide-set variant. | Preserved only as a controlled placement comparison. |
| 6 — wide-set diamond | `diamond`, `76×135×78`; `±70/-84/-76`; mirrored Y/Z `±5/±10` | Passes the neutral cat-read gate. | Rejected by the existing action-shell regression: scaled extent `165.433` exceeded the unchanged shell limit `160.714`. |
| 7 — selected deep-root diamond | `diamond`, `76×135×78`, roundness `1`; `±70/-76/-82`; mirrored Y/Z `±5/±10` | Passes: two short, broad-rooted, rounded diamond ears, forehead notch, and normal mascot size. | Passes the retained full-pose shell regression; deeper root embedding reduces the action envelope without shrinking the mascot. |

## Evidence and visual decision

- `evidence/candidate-comparison-1x.png` and `.svg` provide the compact
  neutral/front production comparison. Candidate 7 is selected only after the
  six controlled comparisons above; a single candidate failure never decided
  seam capability.
- `evidence/final-neutral-front-1x.png` is the primary truth: it reads as a
  round cat at normal Compact size with two embedded ears.
- `evidence/final-static-regressions.png` and `.svg` prove the unchanged
  Compact host in neutral, low-amplitude idle, pointer approach, Reduced
  Motion, and unchanged Full/MR9 contexts.
- `evidence/final-retained-actions.png` and `.svg` show each fixed retained
  action at a maximum-rotation hold plus first hold, transition, and second
  hold. Pose-driven partial occlusion is natural and no action is a curation
  candidate.

## Boundary result

The selected result changes only the two existing `avatar-core` body-node
geometry values and their focused assertions. It retains one full-pose
projection, two core nodes, the existing source-specific SVG slots, `.95`
render scale, action allowlist/timing, pointer field, lifecycle, and Full/MR9.
No Architecture PASS is implied.
