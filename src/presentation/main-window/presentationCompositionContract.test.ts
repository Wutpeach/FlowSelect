import { describe, expect, it } from "vitest";

/**
 * MR0 presentation composition contract (Slices 2 and 4) — NORMATIVE
 * TEST-ONLY contract model.
 *
 * The persistent + bounded transient + terminal-priority composition shape is
 * a PROJECTION contract, not a state machine/store/manager. MR0 adds no
 * production type for it: concrete graphics and Character consumers remain
 * consumers, and a shared type is created only when two real consumers need
 * the exact same data contract.
 *
 * This model defines the REQUIRED behavior future consumers must conform to.
 * It does NOT certify that any current production module already complies,
 * and it is not a substitute for conformance tests: each MR1/MR2
 * implementation must add its own conformance tests against these contracts.
 *
 * Invariants pinned here:
 *   - transient response ends at the LATEST persistent baseline, not Dormant
 *     or its start snapshot;
 *   - a persistent target change during a transient updates the restoration
 *     target;
 *   - terminal target interrupts/suppresses ordinary transient work without
 *     waiting;
 *   - latest-replaces/coalescing keeps concurrency bounded and cannot form an
 *     infinite queue;
 *   - presentation values cannot write Product or lifecycle authority (pure
 *     projection);
 *   - reduced motion resolves to a deterministic semantic target (transient
 *     decoration removed; terminal semantic presentation kept);
 *   - information-bearing interpolation approaches monotonically and never
 *     exceeds the latest authoritative value, retargeting from the current
 *     rendered value;
 *   - expressive geometry may overshoot freely without changing facts;
 *   - a local runtime wakes on target change, runs until settled, cancels its
 *     frame, and stays at zero scheduled frames while settled;
 *   - collapse SLEEPS a still-mounted runtime; replacement/unmount
 *     PERMANENTLY disposes it (late calls are stale no-ops). No MR0
 *     production consumer runtime exists yet, so these two are pinned only
 *     here as normative behavior for MR1/MR2.
 */

// ---------------------------------------------------------------------------
// Test-only reference model: projected presentation target
// ---------------------------------------------------------------------------

type TransientIntent = {
  /** Consumer-local epoch; a newer transient replaces an older one. */
  epoch: number;
  /** Additive, bounded, event-scoped response (e.g. ripple). */
  delta: number;
};

type TerminalTarget = {
  epoch: number;
  /** Terminal projection value (success/failure/cancelled). */
  value: number;
};

type CompositionFacts = {
  /** Latest persistent presentation baseline (projection of authoritative facts). */
  persistent: number;
  /** At most ONE bounded transient intent (latest-replaces). */
  transient: TransientIntent | null;
  /** Optional terminal-priority projection. */
  terminal: TerminalTarget | null;
  /** OS reduced-motion preference. */
  reduced: boolean;
};

/**
 * Pure projection: returns the presentation target. Terminal wins immediately
 * (it is itself a projection, never a Product/lifecycle authority). Reduced
 * motion removes transient decoration but keeps the semantic terminal target.
 */
const resolveProjectedTarget = (facts: CompositionFacts): number => {
  if (facts.terminal !== null) {
    return facts.terminal.value;
  }
  if (facts.reduced) {
    return facts.persistent;
  }
  return facts.persistent + (facts.transient?.delta ?? 0);
};

/** Latest-replaces: submitting a new transient replaces the previous one. */
const replaceTransient = (
  facts: CompositionFacts,
  next: TransientIntent | null,
): CompositionFacts => ({ ...facts, transient: next });

// ---------------------------------------------------------------------------
// Information-bearing vs expressive interpolation (test-only models)
// ---------------------------------------------------------------------------

/**
 * Information-bearing interpolation: approaches the authoritative target
 * monotonically by at most `step` per frame; never overshoots; retargets from
 * the CURRENT rendered value when the target changes.
 */
const approachInformation = (
  current: number,
  target: number,
  step: number,
): number => {
  if (current === target) {
    return target;
  }
  const move = Math.min(Math.max(step, 0), Math.abs(target - current));
  return current < target ? current + move : current - move;
};

/**
 * Expressive interpolation: may overshoot/settle because it carries no
 * authoritative quantity. `factor > 1` overshoots on the first step.
 */
const expressiveStep = (
  current: number,
  target: number,
  factor: number,
): number => current + (target - current) * factor;

// ---------------------------------------------------------------------------
// Sleep/wake harness (test-only): wakes on target change, settles, sleeps
// ---------------------------------------------------------------------------

const createSleepingRuntime = (step: number, settleEps: number) => {
  let value = 0;
  let target = 0;
  let scheduledFrames = 0;
  let framesRun = 0;
  let disposed = false;

  return {
    /** Wake with a new target; returns true when a frame was scheduled. */
    wake(nextTarget: number): boolean {
      if (disposed) {
        return false;
      }
      target = nextTarget;
      const settled = Math.abs(value - target) < settleEps;
      if (settled) {
        scheduledFrames = 0;
        return false;
      }
      scheduledFrames += 1;
      return true;
    },
    /** Run one scheduled frame; keeps scheduling until settled, then sleeps. */
    tick(): void {
      if (disposed || scheduledFrames === 0) {
        return;
      }
      framesRun += 1;
      value = approachInformation(value, target, step);
      if (Math.abs(value - target) < settleEps) {
        value = target;
        scheduledFrames = 0;
      }
      // Not settled: one frame remains scheduled (wake semantics). No frame
      // is ever scheduled while settled.
    },
    /** Terminal/reduced semantic targets land immediately (no waiting). */
    jump(targetValue: number): void {
      if (disposed) {
        return;
      }
      value = targetValue;
      target = targetValue;
      scheduledFrames = 0;
    },
    /**
     * Collapse sleep (normative MR1/MR2 contract): hard-stop frames/timers,
     * hold the current value; a later wake() re-expands. NOT permanent.
     */
    sleep(): void {
      scheduledFrames = 0;
    },
    /**
     * Replacement/unmount disposal (normative MR1/MR2 contract): permanent.
     * All later wake/tick/jump calls are stale no-ops.
     */
    dispose(): void {
      disposed = true;
      scheduledFrames = 0;
    },
    get scheduled(): number {
      return scheduledFrames;
    },
    get frames(): number {
      return framesRun;
    },
    get current(): number {
      return value;
    },
  };
};

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------

describe("MR0 presentation composition: persistent + transient + terminal", () => {
  it("restores the LATEST persistent baseline when a transient ends", () => {
    const facts: CompositionFacts = {
      persistent: 0,
      transient: { epoch: 1, delta: 5 },
      terminal: null,
      reduced: false,
    };
    expect(resolveProjectedTarget(facts)).toBe(5);

    const transientEnds = replaceTransient(facts, null);
    expect(resolveProjectedTarget(transientEnds)).toBe(0);
  });

  it("updates the restoration target when the persistent baseline changes mid-transient", () => {
    const withTransient: CompositionFacts = {
      persistent: 10,
      transient: { epoch: 2, delta: 3 },
      terminal: null,
      reduced: false,
    };
    expect(resolveProjectedTarget(withTransient)).toBe(13);

    // Product fact advances while the transient runs: baseline 10 -> 24.
    const during = { ...withTransient, persistent: 24 };
    expect(resolveProjectedTarget(during)).toBe(27);

    // Transient ends: reconverges to the NEW baseline, not the start snapshot.
    expect(resolveProjectedTarget(replaceTransient(during, null))).toBe(24);
  });

  it("terminal target interrupts/suppresses ordinary transient work without waiting", () => {
    const withTransient: CompositionFacts = {
      persistent: 10,
      transient: { epoch: 3, delta: 5 },
      terminal: null,
      reduced: false,
    };
    const terminalArrives: CompositionFacts = {
      ...withTransient,
      terminal: { epoch: 4, value: 100 },
    };
    expect(resolveProjectedTarget(terminalArrives)).toBe(100);

    // Terminal keeps priority even when the transient is replaced or removed.
    expect(resolveProjectedTarget(replaceTransient(terminalArrives, null))).toBe(100);
  });

  it("keeps concurrency bounded: latest-replaces holds at most one transient", () => {
    let facts: CompositionFacts = {
      persistent: 0,
      transient: null,
      terminal: null,
      reduced: false,
    };
    for (let epoch = 1; epoch <= 50; epoch += 1) {
      facts = replaceTransient(facts, { epoch, delta: epoch });
      expect(facts.transient?.epoch).toBe(epoch);
      expect(facts.transient).not.toBeNull();
    }
    // No queue ever accumulates: one intent slot, one projected value.
    expect(resolveProjectedTarget(facts)).toBe(50);
  });

  it("presentation values cannot write Product or lifecycle authority (pure projection)", () => {
    // Frozen input: any write attempt by the projection would throw.
    const facts: CompositionFacts = Object.freeze({
      persistent: 10,
      transient: { epoch: 1, delta: 2 },
      terminal: { epoch: 2, value: 90 },
      reduced: false,
    });
    expect(resolveProjectedTarget(facts)).toBe(90);
  });

  it("reduced motion resolves to the deterministic semantic target", () => {
    const withTransient: CompositionFacts = {
      persistent: 10,
      transient: { epoch: 1, delta: 5 },
      terminal: null,
      reduced: true,
    };
    // Transient decoration removed; persistent semantic target shown directly.
    expect(resolveProjectedTarget(withTransient)).toBe(10);

    // Terminal is semantic: it survives reduced motion.
    const terminal: CompositionFacts = {
      ...withTransient,
      terminal: { epoch: 2, value: 100 },
    };
    expect(resolveProjectedTarget(terminal)).toBe(100);
  });
});

describe("MR0 interpolation classes", () => {
  it("information-bearing progress approaches monotonically and never overshoots", () => {
    const authoritative = 100;
    let visual = 0;
    const seen: number[] = [visual];
    for (let frame = 0; frame < 200; frame += 1) {
      visual = approachInformation(visual, authoritative, 7);
      seen.push(visual);
    }
    expect(visual).toBe(authoritative);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
      expect(seen[i]).toBeLessThanOrEqual(authoritative);
    }
  });

  it("information-bearing progress retargets from the CURRENT rendered value", () => {
    let visual = 30;
    visual = approachInformation(visual, 100, 25); // 55
    visual = approachInformation(visual, 100, 25); // 80
    // Authoritative value falls back to 40 mid-flight: retarget from 80.
    visual = approachInformation(visual, 40, 25);
    expect(visual).toBe(55);
    visual = approachInformation(visual, 40, 25);
    expect(visual).toBe(40);
    expect(visual).toBeLessThanOrEqual(40);
  });

  it("expressive geometry may overshoot and settle without waiting", () => {
    const first = expressiveStep(0, 50, 1.2);
    expect(first).toBe(60); // overshoots the target
    // Settles back toward the target on the next step.
    expect(expressiveStep(first, 50, 0.5)).toBe(55);
  });
});

describe("MR0 consumer-local sleep/wake", () => {
  it("wakes on target change, runs until settled, then holds zero scheduled frames", () => {
    const runtime = createSleepingRuntime(10, 0.001);
    expect(runtime.scheduled).toBe(0);

    expect(runtime.wake(25)).toBe(true); // wakes
    expect(runtime.scheduled).toBe(1);
    runtime.tick(); // 10
    runtime.tick(); // 20
    expect(runtime.scheduled).toBe(1);
    runtime.tick(); // 25 (settled)
    expect(runtime.current).toBe(25);
    expect(runtime.scheduled).toBe(0); // sleeps

    // Settled runtime stays asleep: no frames run, no scheduling.
    const framesBefore = runtime.frames;
    expect(runtime.wake(25)).toBe(false);
    runtime.tick();
    expect(runtime.frames).toBe(framesBefore);
    expect(runtime.scheduled).toBe(0);
  });

  it("accepts a new target mid-transition (retarget from current rendered value)", () => {
    const runtime = createSleepingRuntime(10, 0.001);
    runtime.wake(30);
    runtime.tick(); // 10
    runtime.wake(12); // retarget mid-flight
    runtime.tick(); // 12 (settled)
    expect(runtime.current).toBe(12);
    expect(runtime.scheduled).toBe(0);
  });

  it("terminal/reduced semantic targets land immediately without waiting", () => {
    const runtime = createSleepingRuntime(10, 0.001);
    runtime.wake(30);
    runtime.tick(); // 10 — in flight
    runtime.jump(100); // terminal arrival does not wait for the transient
    expect(runtime.current).toBe(100);
    expect(runtime.scheduled).toBe(0);
    runtime.tick(); // no obsolete work continues
    expect(runtime.current).toBe(100);
  });

  it("collapse sleeps a still-mounted runtime and re-expand wake resumes it", () => {
    const runtime = createSleepingRuntime(10, 0.001);
    runtime.wake(30);
    runtime.tick(); // 10 — in flight
    runtime.sleep(); // collapse: hard-stop frames
    expect(runtime.scheduled).toBe(0);
    const framesBefore = runtime.frames;
    runtime.tick(); // sleeping runtime runs nothing
    expect(runtime.frames).toBe(framesBefore);
    expect(runtime.current).toBe(10); // value held, not reset
    // Re-expand: wake resumes from the CURRENT rendered value.
    expect(runtime.wake(30)).toBe(true);
    runtime.tick(); // 20
    runtime.tick(); // 30 (settled)
    expect(runtime.current).toBe(30);
    expect(runtime.scheduled).toBe(0);
  });

  it("replacement/unmount permanently disposes: late wake/tick/jump are stale no-ops", () => {
    const runtime = createSleepingRuntime(10, 0.001);
    runtime.wake(30);
    runtime.tick(); // 10 — in flight
    runtime.dispose(); // replaced/unmounted
    expect(runtime.scheduled).toBe(0);
    expect(runtime.wake(40)).toBe(false); // stale wake schedules nothing
    runtime.tick();
    runtime.jump(99); // stale terminal call is a no-op
    expect(runtime.current).toBe(10); // frozen at last rendered value
    expect(runtime.scheduled).toBe(0);
    expect(runtime.frames).toBe(1);
  });
});
