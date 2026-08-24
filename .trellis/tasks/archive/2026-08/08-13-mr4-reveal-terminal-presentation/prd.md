# MR4 Reveal / Terminal Presentation

## Goal

Implement Download-only Success / Failure / Cancelled Reveal on the MR1–MR3 integration line while keeping Application/Download terminal authority, MR3 Progress projection, Main Window lifecycle authority, and renderer-local motion separate.

## Requirements

- Consume only the existing typed first Download terminal transition. Presentation must not infer or reclassify terminal from progress, cancellation intent, text, timers, or animation.
- Preserve distinct `success | failure | cancelled` semantics, safe failure message, and diagnostic-copy action.
- MR3 remains `idle | indeterminate | determinate`; terminal removal still projects immediately to next-primary or idle.
- Current primary Download always wins. It immediately invalidates old Reveal and retention, releases only the Reveal `centerOutcome` lock, and prevents replay. Background/non-visible terminal while a current primary exists may be suppressed. No FIFO.
- Product task presence alone projects `task`; active MR4 terminal Presentation alone projects `centerOutcome` and may use the existing full intent. The same Reveal fact must not own both locks.
- Retention is bounded Presentation lifetime. Animation/Canvas/Motion completion cannot begin, extend, or end retention and cannot drive lifecycle, collapse, native, or Product correctness.
- Renderer execution must remain consumer-local, bounded, interruptible, sleeping/disposable, stale-safe, and reconstructible from current inputs. Reuse the MR1 Dot Field/MR0 substrate; add no generic animator/runtime/scheduler/bus or second canvas.
- Reduced Motion preserves three-way identity, safe failure information, diagnostic action, and retention while removing optional travel/propagation/scale/blur/noise choreography.
- Do not change Product terminal authority, lifecycle authority, protocol/native paths, or terminal-not-compact behavior. Stop if any becomes necessary.

## Acceptance criteria

- [ ] Terminal authority remains Application/Download-only and first-terminal idempotence remains intact.
- [ ] Progress and Reveal are sibling projections with no duplicate source of truth.
- [ ] New current work invalidates old Reveal/retention/lock immediately; stale timer/callback cannot clear or restore newer state.
- [ ] Expiry/dismissal releases only MR4 Presentation state; lifecycle reducer determines what happens next.
- [ ] Renderer motion may sleep/dispose/interrupt without changing Download, lifecycle, native, or accessible semantics.
- [ ] Reduced Motion preserves required information and interaction without optional choreography.
- [ ] Failure and cancelled are no longer conflated in Presentation.
- [ ] No frozen old M3 implementation, generic framework, protocol/native change, Folder Confirmation work, Transcode Reveal, terminal-not-compact repair, archive, or MR5 work.

## Out of scope

- Folder Confirmation, Intake Reveal, Transcode, protocol/native changes, terminal-not-compact repair, generic motion infrastructure, and frozen old M3 migration.
- Repository-level refactors unrelated to the terminal projection and its current composition.

## Stop condition

After implementation and validation, return an Implementation Report and keep the task `in_progress` for GPT Architecture Lead Implementation Architecture Review. Do not archive or enter MR5.
