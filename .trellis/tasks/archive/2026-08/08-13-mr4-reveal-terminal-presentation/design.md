# MR4 Implementation Design

```text
typed first Download terminal transition
  -> pure/bounded terminal Presentation target
       -> center semantic content (accessible identity/message/action)
       -> terminal-priority Dot Field target (supplemental renderer pixels)

current Download selectors -> MR3 Progress target

current primary exists: Progress wins and terminal target is invalidated
no primary + terminal target: Reveal owns bounded Presentation retention

Product task -> task lock
MR4 Reveal -> centerOutcome lock / existing full intent
lifecycle reducer -> full/collapse/compact/native authority
```

The terminal projection stores one latest immutable target plus Presentation identity/generation. It owns no terminal classification, task membership, progress value, lifecycle phase, or native fact. Its timeout/dismiss actions may clear only the matching Presentation generation.

The existing semantic center outcome remains the accessible carrier. It must expose typed three-way semantics rather than a non-success boolean. The Dot Field receives a separate terminal-priority input and executes locally using the existing bounded Canvas/rAF lifecycle. It may visually interrupt or suppress progress/transients, but settlement has no callback into retention or authority.

Renderer choreography is eligible only in settled full presentation. Semantic content and retention do not wait for renderer eligibility. On new work, preference change, sleep, replacement, or dispose, obsolete local work stops and the current projection wins.

Use existing theme tokens, Motion primitives, and one Canvas. Keep visual tuning compact, restrained, and information-led. Do not add shared infrastructure until another real consumer proves the same contract.
