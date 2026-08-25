# Ameow OneWorks candidate calibration notes

The single surviving candidate is `ameow-oneworks-cat-2026-08-25-v1`
(`fnv1a32:eb514f72`). Its deterministic browser export is
[`canonical-candidate.json`](./canonical-candidate.json).

## Definition-level changes from the Route A source reference

- Kept the upstream three-part cat mechanism: two `cone` ears with
  `occludedByFace`, plus one ellipse face/head. No geometry, projection,
  mask, or Editor control was recreated.
- Shifted the body, ears, shadow, outline, and frame toward the existing
  Ameow blue family (`#b9ccff` body against `#121827`), preserving a compact
  dark-surface read.
- Enlarged the head to `0.78 × 0.70`; widened both rounded-cone ears to
  `0.27 × 0.31`, with symmetric `roundness: 64` and roots at `±61/-82/-10`.
  This makes the ear tips legible at 60 px while the face mask still fuses
  their roots into the head under moderate pose.
- Tightened the face to a 40-unit gap, 26-unit width, 60-unit height, softer
  eye rotation, and smaller enabled nose. Camera scale is `1.28`.

## Review order and finding

True 60 px was the decision surface, then magnified front, moderate yaw
(`0.22 rad`), and moderate pitch (`-0.13 rad`). The final candidate remains
recognizable at 60 px, retains rounded tips and attached roots at the moderate
poses, and has no detached ear or face-leak finding in the complete 360°
mechanism sheet. Rear/tangent faces are intentionally not judged as
front-facing personality views.

The pointer preview imports the existing pure production eye-attention recipe
unchanged (3 px dead zone, 46 px cosine response/recenter). Only its mapping
to `±0.28 rad` yaw / `±0.16 rad` pitch is Lab-only. Reduced Motion reads the
production smaller-eye branch but renders the canonical static candidate,
with no decorative action playback.

The action sheet uses deterministic stills derived from the middle keyframes
of public upstream clips: `surprised` opens the eye read, `curious-short`
tilts the face/view, and `playful-short` shows the mouth. These preserve
meaning for review only; they do not claim production pixel or timing parity.
