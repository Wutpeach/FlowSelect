# Upstream Research: Bible Strong Avatar Lab

## Revision and live observation

- Repository: `https://github.com/smontlouis/bible-strong-avatar-lab`
- Pinned research revision: `175691ab32cefe5faec7828af62f3d50210a8eb2` on `main` (2026-08-20, `feat(export): add copyable AI usage guides`).
- The public site `https://avatars.bible-strong.app/` was observed on 2026-08-23. It opened with Strobi selected and the `proud` animation playing, consistent with the pinned default document (`src/features/studio/defaultStudioDocument.json:4,8,20,1919,2193`).
- The pinned repository, not the mutable deployed site, is the implementation evidence source.

Pinned source root: `https://github.com/smontlouis/bible-strong-avatar-lab/tree/175691ab32cefe5faec7828af62f3d50210a8eb2`

## Renderer and animation model

1. The visual is a procedural SVG avatar, not a bitmap, video, canvas mascot, or single static asset. The public renderer uses a `-150 -150 300 300` SVG viewBox and path geometry for the head, eyes, and optional body nodes (`packages/avatar-react/src/Avatar.tsx:455-506`).
2. `@bible-strong/avatar-core` is framework-independent. It validates one avatar definition, advances semantic playback from monotonic timestamps, samples expression/blink/color state, applies ambient motion, and returns renderer-neutral SVG scene geometry (`packages/avatar-core/README.md:1-52`; `packages/avatar-core/src/runtime.ts:47-78,263-347`).
3. `@bible-strong/avatar-react` owns a local playback state and one `requestAnimationFrame` loop while playback is active. It mutates existing SVG path attributes per frame instead of re-rendering React for every visual frame (`packages/avatar-react/src/Avatar.tsx:197-223,333-358`).
4. The Studio UI uses React 19 for durable editor state and Motion for high-frequency Studio rendering, but the published React avatar runtime itself depends only on `avatar-core` and React/ReactDOM peers. Direct runtime reuse does not require upstream's Studio UI, Tailwind, Base UI, or Motion 13.

## Character construction

- An avatar definition contains a primary procedural surface, up to sixteen body nodes, body/eye colors, neutral expression, named expressions, and named animations (`packages/avatar-core/src/avatarDefinition.ts:20-97`; `packages/avatar-core/src/body.ts:18-27`).
- Strobi is the default active avatar. Its default document uses a spherical primary body, no extra body nodes, body color `#5b7fe5`, dark eyes, and the `proud` loop as the initial playback state (`src/features/studio/defaultStudioDocument.json:4-29,1919-1958,2193-2194`).
- The `proud` source behavior is a three-expression loop with smooth transitions and configured blinking. The repository also supplies explicit semantic loops such as `idle`, `listening`, `thinking`, `working`, and `sleeping`.
- Source fidelity therefore includes more than the circular silhouette: eye capsule geometry, apparent 3D head orientation, expression-to-expression interpolation, ambient eye/body motion, palette, clipping, and blink rhythm all contribute.

## Pointer and attention behavior

- No production runtime API or default behavior continuously follows the user's pointer. Searches across `src/` and `packages/` find pointer events only in Studio editing/manipulation UI; `AvatarProps` exposes animation/expression control, size/style, callbacks, and a controller, but no pointer/gaze input (`packages/avatar-react/src/Avatar.tsx:71-99`).
- Gaze is authored into named expressions and animation steps. Therefore an Ameow pointer-following response is not directly reusable upstream behavior. It is an Ameow-specific adaptation layered onto the source visual.
- This finding rejects only a hypothetical direct pointer integration. It does not reject the upstream avatar visual or its semantic animation runtime.

## State inputs and Reduced Motion

- Public state inputs are a validated `AvatarDefinition`, controlled or default `animation`/`expression`, autoplay, size/style, and optional callbacks/controller (`packages/avatar-react/src/Avatar.tsx:71-99`).
- Playback state is visual-local: active animation/expression, playing/paused/stopped status, step/direction/phase, transition snapshot, and blink scheduling (`packages/avatar-core/src/runtime.ts:47-66`).
- Core accepts an explicit runtime environment `{ random, reduceMotion? }`. Reduced Motion skips direct and step interpolation and suppresses ambient motion, but blink opacity is still sampled (`packages/avatar-core/src/runtime.ts:73-76,263-347`).
- The published React component does not expose `reduceMotion` as a prop. It reads `window.matchMedia('(prefers-reduced-motion: reduce)')` internally each frame (`packages/avatar-react/src/Avatar.tsx:38-41`). This cannot consume Ameow UI Lab's explicit Reduced Motion preview value without adaptation.

## Dependencies and distribution shape

- Upstream root uses pnpm 10.34.5, Node >=22.12, React 19.2.3, Motion 13, Vite 8, Tailwind 4, AJV, and Studio UI dependencies (`package.json:16-74`). These are Studio dependencies, not all production integration dependencies.
- Published package metadata observed through npm on 2026-08-23:
  - `@bible-strong/avatar-core@0.1.0`: `AGPL-3.0-only`, depends on `ajv ^8.20.0`, unpacked size about 319 KiB.
  - `@bible-strong/avatar-react@0.1.0`: `AGPL-3.0-only`, depends on `avatar-core ^0.1.0`, React/ReactDOM `^19.0.0` peers, unpacked size about 91 KiB.
  - `@bible-strong/avatar-web@0.1.0`: `AGPL-3.0-only`, depends on `avatar-core ^0.1.0`.
- Ameow already uses compatible React 19, but upstream packages are pre-1.0 and their API may change on a minor release. Any approved dependency must be pinned exactly and validated in the lockfile.

## License evidence and consequence

- Repository `LICENSE` is GNU Affero General Public License v3.0.
- Root and all three package manifests declare `AGPL-3.0-only` (`package.json:14`; `packages/avatar-core/package.json:13`; `packages/avatar-react/package.json:13`; `packages/avatar-web/package.json:13`).
- Ameow's root `LICENSE:1` is MIT.
- Directly shipping upstream packages, copied source, or a derivative of the exported definition/runtime in the current MIT distribution requires an explicit licensing/compliance decision. A combined distribution may require AGPL treatment and corresponding-source obligations; alternatively, upstream may grant a compatible separate license. This planning report is engineering evidence, not legal advice.
- Treat this as a production gate for direct reuse and derivative adaptation. Do not infer that the visual itself is unsuitable.

## Candidate assessment

### Direct reuse

Technically possible by mounting the official React package with an officially exported Strobi `.avatar.json`. It is the strongest initial visual-fidelity baseline. It does not satisfy Ameow's explicit Reduced Motion input or existing continuous pointer behavior and is blocked for production by the license gate.

### Derivative integration

Technically strongest production architecture after license clearance: use the official core's pure playback/scene APIs and a Compact-specific React SVG host. This preserves source geometry and timing while allowing Ameow's explicit Reduced Motion, visibility, 56px composition, and read-only pointer projection. It remains covered by the same license gate.

### Custom recreation

The fallback if compatible permission/compliance is not approved. It must be planned as a separate observational reimplementation and must not copy upstream source, exported definitions, geometry paths, or implementation constants. A failed direct/derivative candidate does not invalidate this source visual target.
