# Ripple upstream source analysis

Research date: 2026-08-23 (Asia/Shanghai)

## Fixed provenance baseline

- Repository: <https://github.com/m1ckc3s/ripple>
- Branch inspected: `main`
- Commit: [`99ee6e4412bcab34bcb4337f5f21845ae87c12d5`](https://github.com/m1ckc3s/ripple/tree/99ee6e4412bcab34bcb4337f5f21845ae87c12d5)
- Commit date: `2026-06-06 05:19:41 -0400`
- Commit subject: `Merge pull request #5 from m1ckc3s/chore/housekeeping`
- Tags at research time: none
- Live demo checked: <https://ripple-gl.vercel.app/>
- Live asset observed on 2026-08-23: `assets/index-D6zHpvaO.js`, `Last-Modified: Sun, 23 Aug 2026 07:21:00 GMT`, weak ETag `c90146ccff876088a8b6c7a109ef2016`
- Inspiration credit recorded by upstream: Minsang (`@radiofun8`), "Ripple with Noise" Metal shader. The README describes Mick Cesanek's GLSL/WebGL version as a fresh and significantly altered implementation ([README lines 10-13](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/README.md#L10-L13)).

The Git commit is the source-fidelity authority. The live asset corroborates the same shader identifiers, control names, ranges, and defaults, but Vercel exposes no source-revision metadata; do not claim that the deployment is cryptographically tied to this commit.

Key Git blob identities at the pinned revision:

| Path | Git blob |
| --- | --- |
| `src/components/RippleTransition.tsx` | `b4dfb79972a3b56f622d7ce67368bd91a80af829` |
| `src/components/rippleParams.ts` | `f821b78bcbd36489730ca52bfba30b06ea9ed3c3` |
| `src/components/Controls.tsx` | `389b86d2ea91e4fe7d7bf26712de7de70281586f` |
| `src/App.tsx` | `ab2281d545b773249335a8f9a6df66a6a564fd1b` |
| `public/image-a.png` | `d352e27bd1ad1e1e419c0c58664c7417248713e4` |
| `public/image-b.png` | `f24ad64daba3585b49bb03e8558088427f4cfc27` |
| `LICENSE` | `29cbbfa5f4a8d8e695dbf218abb6e30a61772e67` |
| `package-lock.json` | `b68dbc5ef7abd4ac70e456c44709d404aa1b4307` |

## Actual runtime pipeline

The upstream visual is a single WebGL 1 canvas with two image textures and one full-screen triangle strip. It is not a DOM/CSS ripple.

1. `RippleTransition` loads image A and B, derives a responsive wrapper size from image A, caps DPR at 2, creates a WebGL 1 context, compiles one vertex shader and one fragment shader, and uploads both images as clamp-to-edge linear textures ([source lines 164-187](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L164-L187), [220-269](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L220-L269)).
2. The vertex shader maps the quad to top-left-origin normalized UV coordinates. The fragment receives `u_center`, `u_progress`, the visual parameters, and `u_swap` ([lines 11-33](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L11-L33)).
3. The fragment makes distance aspect-correct, normalizes it against the center-to-corner radius, and clamps it to `[0,1]` ([lines 70-77](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L70-L77)).
4. Two animated fBm fields provide the organic character: four large-scale octaves and three small-scale octaves. Both are translated by progress at different velocities/directions ([lines 36-63](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L36-L63), [79-80](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L79-L80)).
5. `waveFront = progress * (1 + 0.5 * noiseWarp + 0.1)`. Large and small noise perturb normalized distance. `delta = warpedDistance - waveFront`; a Gaussian envelope multiplied by a half-wave rectified cosine produces the readable ripple bands. The envelope is gated in over the first 5% and out between 85% and 100% ([lines 82-97](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L82-L97)).
6. The same envelope drives radial UV displacement and RGB channel separation. A separate short center pinch field, faded near the texture edge, is mixed into the UV offset ([lines 99-120](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L99-L120)).
7. Both textures are sampled separately for R/G/B. A noisy feathered radial reveal mixes base and target according to `u_swap`; envelope-local glow brightens by division. At progress 1 the envelope gate is zero, so displacement, RGB split, and glow disappear ([lines 122-148](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L122-L148)).
8. JavaScript state is `{progress,cx,cy,swap,pinch}`. `trigger()` refuses re-entry while animating, resets progress, optionally runs the pinch keyframes, and lets GSAP tween progress to 1. Completion toggles `swap`, resets progress to 0, and renders the newly committed texture. `scrub()` kills all tweens and writes progress directly ([lines 290-357](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L290-L357)).
9. A primary `pointerdown` calculates normalized local coordinates and calls `trigger`; App-level Replay calls `trigger()` with the prior/default center, while the Progress control calls `scrub()` ([lines 359-370](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L359-L370), [`App.tsx` lines 42-61](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/App.tsx#L42-L61)).

The README says another press reverses without restart, but the actual implementation returns immediately while `animating` is true. This is a concrete example of why the pinned source, not prose, is authoritative ([README lines 17-21](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/README.md#L17-L21), [`RippleTransition.tsx` lines 311-320](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/RippleTransition.tsx#L311-L320)).

This means upstream currently combines two responsibilities in one React component:

- reusable visual execution: shader, texture upload, uniforms, draw;
- demo authority: pointer gesture, animation lock, GSAP duration/easing, pinch timeline, A/B swap commit.

Ameow may reuse or derive the first responsibility. It must not adopt the second as product authority.

## Control mapping

Pinned upstream defaults are `sigma=.15`, `waveFreq=5`, `pushAmt=.145`, `caStrength=.02`, `glow=.73`, `noiseWarp=1`, `duration=1.4s`, `ease=power2.inOut`, pinch enabled at `.3` ([`rippleParams.ts` lines 19-30](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/rippleParams.ts#L19-L30)). The demo labels `sigma` as **Wave Width**, not Wavelength, and computes displayed transition speed as `1.4 / duration` ([`Controls.tsx` lines 18-24](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/Controls.tsx#L18-L24), [86-105](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/src/components/Controls.tsx#L86-L105)).

| User control wording/value | Proven upstream mapping | Source-fidelity status |
| --- | --- | --- |
| transition speed `1.00x` | `duration = 1.4s` | exact |
| wavelength `0.15` | `sigma = 0.15`, labelled `Wave Width` | exact value; use upstream name in diagnostics |
| ripple density `5` | `waveFreq = 5` | exact |
| displacement `0.155` | `pushAmt = 0.155` | exact uniform; differs from upstream default `.145` |
| RGB split `0.0225` | `caStrength = 0.0225` | exact uniform; differs from upstream default `.02` |
| glow `0.37` | `glow = 0.37` | exact uniform; differs from upstream default `.73` |
| noise warp `0.70` | `noiseWarp = 0.70` | exact uniform; preserves both fBm fields and their motion |
| Ease Out (strong) | GSAP `power3.out` | exact listed easing option |
| Pinch | `pinch = true` | confirmed default user lane |
| Pinch Strength `.14` | pinch timeline amplitude `u_pinch = .14` | exact source control; source rise/fall timing retained |

`.14` is Pinch Strength, not blend strength. The control must not expose, invent, or silently wire a fictional blend-strength value to reveal feather, displacement, glow, alpha, or texture mix.

The user baseline is Pinch ON / Pinch Strength `.14`; retain Pinch OFF only as a clearly labelled pure-wavefront comparison. Bringing pinch into Product scope requires a later explicit decision.

## Source-level risks discovered

1. **Two texture inputs are fundamental.** The source is an A/B image transition, not merely a colored wave overlay. A later Ameow Production integration would need an explicit owner for stable `from` and `to` texture snapshots. The current transparent procedural canvas cannot sample DOM content underneath it. The Lab can use deterministic static square fixtures; it cannot pretend this Production scene-source problem is solved.
2. **Off-center distance normalization is center-based.** `maxDist` always uses the center-to-corner radius and clamps normalized distance to 1. For an origin away from center, spatial distance beyond that radius is flattened. This may preserve completion but can reduce point-origin radial readability near the far side. Keep the exact formula in the control and characterize center, edge, and corner origins before proposing any derivative normalization.
3. **Inverted `smoothstep` edges.** Reveal uses `smoothstep(waveFront + feather, waveFront - feather, warpedDist)`. GLSL specifies undefined results when `edge0 >= edge1`. It works in the observed browser/GPU path but is a portability risk. Do not repair it inside the source-fidelity control; record cross-browser/GPU evidence first.
4. **No responsive lifecycle.** Upstream sizes once during setup and has no resize observer or context-loss restoration. Ameow already has stronger bounded resize/context handling; a later adapter should retain Ameow lifecycle behavior without changing visual math.
5. **WebGL generation mismatch.** Upstream uses WebGL 1/GLSL ES 1.00 and `texture2D`; Ameow's existing Expanded host uses WebGL2. The initial control should keep upstream WebGL 1. Any WebGL2 port is a derivative and needs same-uniform phase comparison.
6. **Organic field is progress-animated.** Noise coordinates move with progress. Reverse/cancel must render by an Ameow-owned progress value; a second autonomous time input would change the path and break deterministic reversal.
7. **Texture aspect and asset rights.** Upstream fixture images are `490x980`, while the target viewport is square. More importantly, the README says they were found on Pinterest, are owned by their original creators, and are included for demonstration only ([README lines 82-88](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/README.md#L82-L88)). Do not copy them into Ameow. The control must use Ameow-owned deterministic square fixtures.
8. **Performance.** Each pixel evaluates seven fBm octaves plus six texture samples. A 200x200 CSS canvas at DPR 2 is modest, but GPU timing, one-frame scheduling, context loss, and low-power Electron behavior still require measurement.

## Build/reproducibility check

- `npm ci` at the pinned commit fails because `package.json` and `package-lock.json` are not synchronized (`@emnapi/*` entries are missing/mismatched).
- A research-only install with `npm install --package-lock=false --ignore-scripts` succeeded; with the resolved compatible dependency set, `npm run build` and `npm run lint` passed.
- Therefore source compilation is currently viable, but the upstream lockfile is not a reproducible installation baseline. Ameow should pin copied source/blob provenance and its own dependency resolution rather than treat upstream `package-lock.json` as install authority.

## License and dependency provenance

- The repository is MIT licensed, copyright 2026 Mick Cesanek ([LICENSE](https://github.com/m1ckc3s/ripple/blob/99ee6e4412bcab34bcb4337f5f21845ae87c12d5/LICENSE)). Copies or substantial portions must retain the copyright and MIT permission notice.
- A copied or modified shader/module should carry a header naming `m1ckc3s/ripple`, the pinned commit, original path, MIT license, and a concise Ameow modification statement. The distributed third-party notices must include the full MIT text.
- Do not copy `public/image-a.png` or `public/image-b.png`; upstream explicitly lacks ownership of those Pinterest demo images. Use Ameow-owned deterministic Lab fixtures even for the reference lane.
- Upstream orchestration imports GSAP. The pinned lock identifies GSAP `3.15.0` under its separate Standard "no charge" license; MIT on the Ripple repository does not replace GSAP's terms. The recommended Ameow boundary does not copy the GSAP-owned orchestration and adds no GSAP dependency: Ameow supplies progress/easing through its own Presentation controller.
- Retain the upstream inspiration credit to Minsang's "Ripple with Noise" when documenting provenance. The repository supplies no license for Minsang's original Metal source; this plan inspects and may derive only Mick Cesanek's pinned GLSL/WebGL implementation. Direct Metal-source reuse would require separate provenance and license review.

## Source-fidelity verification contract

The future Browser Lab control should prove all of the following before any Color adaptation:

1. exact commit/blob/provenance header and normalized source-diff guard for the shader core;
2. exact uniform formulas and parameter mapping above, including Pinch ON / Pinch Strength `.14`, with no fictional blend-strength semantics;
3. one 200x200 CSS canvas clipped by one radius-16 host, deterministic backing scale, one program/draw, and no Paper/Thermal code;
4. origin agreement for center plus representative off-center/near-corner points;
5. deterministic phase captures at fixed raw/eased progress values and a direct scrub equivalence check;
6. forward, reverse, and cancel driven by an external Lab controller, with no internal pointer listener, animation lock, GSAP timeline, or completion swap toggle in the visual leaf;
7. target-only completion inside the r16 mask at progress 1, plus an explicit report if the exact upstream formula leaves measurable residual pixels;
8. Pinch ON user-baseline and Pinch OFF pure-wavefront captures made from the same visual leaf;
9. element/canvas crops and compact phase contact sheets for human review, with machine-readable probes as companion evidence rather than screenshots of JSON;
10. WebGL compile/link/context-loss, DPR, resize, disposal, one-pending-frame, and Reduced Motion/static-scrub checks.
