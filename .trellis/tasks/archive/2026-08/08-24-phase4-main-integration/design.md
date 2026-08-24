# Integration design

The integration line starts at `4238790`, preserving Phase 3 repository truth.
It has one explicit merge parent: Product baseline `2bb9a22`. For conflicts,
keep repository-truth task/archive/journal content and Product code from the
approved baseline. No other motion, research, repair, or historical line is
merged.

After validation, archive/journal metadata stays on this line. Root main then
fast-forwards only if still `2b46f91`; the pre-integration recovery ref is
`recovery/main-pre-phase4-2b46f91`.
