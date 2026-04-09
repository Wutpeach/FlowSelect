# Synced Spec Templates

This directory stores tracked snapshots of selected `.trellis/spec/` guidance.

Why it exists:
- `.trellis/` is ignored in this repository, so local spec/guideline updates are not committed by default.
- Break-loop and update-spec work that should survive across machines must be synced here as tracked markdown.

Sync rule:
- When a debugging session produces durable guidance, update the corresponding `.trellis/spec/...` file first.
- Then copy the relevant contract/guide into this directory under the same conceptual path.
- Keep the synced file focused on executable guidance, not generic philosophy.
