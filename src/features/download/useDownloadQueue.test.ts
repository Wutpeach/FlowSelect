import { describe, expect, it, vi } from "vitest";
import type { DownloadQueueAck } from "../../application/download-api";
import {
  classifyDownloadTerminal,
  type DownloadQueueClient,
  type DownloadQueueEvent,
} from "./client";
import type { DownloadQueueState, DownloadTask } from "./model";
import { selectPrimaryDownloadTask } from "./selectors";
import { DownloadQueueController } from "./useDownloadQueue";
import { shouldShowDownloadTerminalReveal } from "../../presentation/main-window/downloadTerminalProjection";

const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const task = (overrides: Partial<DownloadTask> = {}): DownloadTask => ({
  traceId: "trace-1",
  label: "Video 1",
  status: "active",
  phase: "downloading",
  ...overrides,
});

const detailEvent = (
  tasks: DownloadTask[],
  acceptedTraceId?: string,
): DownloadQueueEvent => ({
  type: "queueDetail",
  tasks,
  acceptedTraceId,
});

const progressEvent = (traceId = "trace-1", percent = 50): DownloadQueueEvent => ({
  type: "progress",
  progress: { traceId, percent, stage: "downloading", speed: "", eta: "" },
});

const terminalEvent = (traceId = "trace-1", success = true): DownloadQueueEvent => ({
  type: "terminal",
  payload: { traceId, success },
});

const createFakeClient = (): {
  client: DownloadQueueClient;
  emit: (event: DownloadQueueEvent) => void;
  resolveRegistration: () => void;
  subscribeCalls: () => number;
  listenerCount: () => number;
  lastDisposer: () => (() => void) | null;
} => {
  const activeListeners = new Set<(event: DownloadQueueEvent) => void>();
  const pendingResolvers: Array<() => void> = [];
  let subscribeCalls = 0;
  let lastDisposer: (() => void) | null = null;

  const client: DownloadQueueClient = {
    queue: vi.fn(async () => ({ accepted: true, traceId: "trace-1" })),
    queuePasted: vi.fn(async () => ({ accepted: true, traceId: "trace-1" })),
    cancel: vi.fn(async () => true),
    selectQuality: vi.fn(async () => true),
    subscribe: vi.fn((listener: (event: DownloadQueueEvent) => void) => {
      subscribeCalls += 1;
      return new Promise<() => void>((resolve) => {
        pendingResolvers.push(() => {
          activeListeners.add(listener);
          const wrapped = () => {
            activeListeners.delete(listener);
            lastDisposer = null;
          };
          lastDisposer = wrapped;
          resolve(wrapped);
        });
      });
    }),
    classifyTerminal: classifyDownloadTerminal,
  };

  return {
    client,
    emit: (event) => activeListeners.forEach((listener) => listener(event)),
    resolveRegistration: () => {
      const resolve = pendingResolvers.shift();
      if (resolve) {
        resolve();
      }
    },
    subscribeCalls: () => subscribeCalls,
    listenerCount: () => activeListeners.size,
    lastDisposer: () => lastDisposer,
  };
};


const flushMicrotasks = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("DownloadQueueController", () => {
  it("reduces events synchronously on a live subscription and disposes cleanly", async () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const states: DownloadQueueState[] = [];
    controller.subscribeState((state) => states.push(state));
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([task()]));
    fake.emit(progressEvent());

    expect(controller.getState().order).toEqual(["trace-1"]);
    expect(controller.getState().progressByTrace["trace-1"]?.percent).toBe(50);

    controller.dispose();
    await flushMicrotasks();
    fake.emit(detailEvent([task({ label: "Changed" })]));
    // Callbacks after dispose are ignored.
    expect(controller.getState().tasksById["trace-1"]?.label).toBe("Video 1");
    expect(fake.listenerCount()).toBe(0);
  });

  it("disposes immediately when the registration promise resolves after dispose", async () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    controller.dispose();

    fake.resolveRegistration();
    await flushMicrotasks();
    // The eventual disposer was invoked immediately: no live listener remains.
    expect(fake.listenerCount()).toBe(0);
    expect(fake.lastDisposer()).toBeNull();

    fake.emit(detailEvent([task()]));
    expect(controller.getState().order).toEqual([]);
  });

  it("ignores callbacks after dispose and does not leak a disposer", async () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    fake.resolveRegistration();
    fake.emit(detailEvent([task()]));

    controller.dispose();
    await flushMicrotasks();
    fake.emit(progressEvent());

    expect(fake.listenerCount()).toBe(0);
    expect(controller.getState().progressByTrace).toEqual({});
  });

  it("does not register a duplicate listener on repeated start", () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    controller.start();
    fake.resolveRegistration();

    expect(fake.subscribeCalls()).toBe(1);

    fake.emit(detailEvent([task()]));
    expect(controller.getState().order).toEqual(["trace-1"]);
  });

  it("supports Strict-Effects-style start/dispose/start with self-disposing stale registrations", async () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    fake.resolveRegistration();
    fake.emit(detailEvent([task()]));

    controller.dispose();
    await flushMicrotasks();
    expect(fake.listenerCount()).toBe(0);

    controller.start();
    fake.resolveRegistration();
    fake.emit(detailEvent([task({ label: "Second life" })]));

    expect(fake.subscribeCalls()).toBe(2);
    expect(fake.listenerCount()).toBe(1);
    expect(controller.getState().tasksById["trace-1"]?.label).toBe("Second life");
  });

  it("keeps a completion terminal even when a delayed shell effect would run later", () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const outcomes: unknown[] = [];
    controller.subscribeTerminal((outcome) => outcomes.push(outcome));
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([task()]));
    fake.emit(progressEvent("trace-1", 90));
    fake.emit(terminalEvent("trace-1"));

    // The terminal state was reduced synchronously; late progress cannot revive it.
    expect(controller.getState().tasksById).toEqual({});
    expect(controller.getState().terminalTraceIds).toContain("trace-1");
    expect(outcomes).toHaveLength(1);

    fake.emit(progressEvent("trace-1", 99));
    expect(controller.getState().progressByTrace).toEqual({});
  });

  it("lets a typed terminal success win over cancel intent end to end", async () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const outcomes: unknown[] = [];
    controller.subscribeTerminal((outcome) => outcomes.push(outcome));
    controller.start();
    fake.resolveRegistration();

    await controller.cancel("trace-1");
    expect(controller.getState().cancelling).toEqual(["trace-1"]);

    fake.emit(terminalEvent("trace-1", true));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ kind: "success", traceId: "trace-1" });
    expect(controller.getState().cancelling).toEqual([]);
  });

  it("clears cancel intent when the cancel command rejects", async () => {
    const fake = createFakeClient();
    fake.client.cancel = vi.fn(async () => { throw new Error("bridge down"); });
    const controller = new DownloadQueueController(fake.client);

    await expect(controller.cancel("trace-1")).rejects.toThrow("bridge down");
    expect(controller.getState().cancelling).toEqual([]);
  });

  it("queues a new generation through the public action and clears the tombstone", async () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([task()]));
    fake.emit(terminalEvent("trace-1"));
    expect(controller.getState().terminalTraceIds).toContain("trace-1");

    await controller.queue({ url: "https://example.com/video" });

    expect(fake.client.queue).toHaveBeenCalledWith({ url: "https://example.com/video" });
    expect(controller.getState().terminalTraceIds).toEqual([]);
  });

  it("replaces the client without duplicating listeners", async () => {
    const first = createFakeClient();
    const second = createFakeClient();
    const controllerA = new DownloadQueueController(first.client);
    controllerA.start();
    first.resolveRegistration();
    expect(first.listenerCount()).toBe(1);

    controllerA.dispose();
    await flushMicrotasks();
    expect(first.listenerCount()).toBe(0);

    const controllerB = new DownloadQueueController(second.client);
    controllerB.start();
    second.resolveRegistration();

    // An event through the old client cannot reach the new controller.
    first.emit(detailEvent([task()]));
    expect(controllerB.getState().order).toEqual([]);

    second.emit(detailEvent([task()]));
    expect(controllerB.getState().order).toEqual(["trace-1"]);
    expect(second.listenerCount()).toBe(1);
  });

  it("emits terminal facts exactly once for duplicate terminal events", () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const outcomes: unknown[] = [];
    controller.subscribeTerminal((outcome) => outcomes.push(outcome));
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([task()]));
    fake.emit(terminalEvent("trace-1"));
    const stateAfterFirst = controller.getState();

    fake.emit(terminalEvent("trace-1"));
    fake.emit(terminalEvent("trace-1", false));

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ kind: "success", traceId: "trace-1" });
    expect(controller.getState()).toBe(stateAfterFirst);
    expect(controller.getState().terminalTraceIds).toEqual(["trace-1"]);
  });

  it("does not write a queue ack that resolves after dispose", async () => {
    const fake = createFakeClient();
    const ack = deferred<DownloadQueueAck>();
    fake.client.queue = vi.fn(() => ack.promise);
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    fake.resolveRegistration();

    const pending = controller.queue({ url: "https://example.com/video" });
    controller.dispose();
    const stateBefore = controller.getState();

    ack.resolve({ accepted: true, traceId: "trace-1" });
    await pending;

    expect(controller.getState()).toBe(stateBefore);
    expect(controller.getState().order).toEqual([]);
  });

  it("does not write cancel cleanup when the rejection arrives after dispose", async () => {
    const fake = createFakeClient();
    const cancel = deferred<boolean>();
    fake.client.cancel = vi.fn(() => cancel.promise);
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    fake.resolveRegistration();

    const pending = controller.cancel("trace-1");
    expect(controller.getState().cancelling).toEqual(["trace-1"]);

    controller.dispose();
    const stateBefore = controller.getState();

    cancel.reject(new Error("bridge down"));
    await expect(pending).rejects.toThrow("bridge down");

    expect(controller.getState()).toBe(stateBefore);
    expect(controller.getState().cancelling).toEqual(["trace-1"]);
  });

  it("does not write quality cleanup when the response arrives after dispose", async () => {
    const fake = createFakeClient();
    const quality = deferred<boolean>();
    fake.client.selectQuality = vi.fn(() => quality.promise);
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    fake.resolveRegistration();

    const pending = controller.selectQuality("trace-1", "o1");
    controller.dispose();
    const stateBefore = controller.getState();

    quality.resolve(false);
    await pending;

    expect(controller.getState()).toBe(stateBefore);
    expect(controller.getState().qualitySelecting).toEqual({ "trace-1": "o1" });
  });

  it("gates a superseded continuation across dispose/start reuse", async () => {
    const fake = createFakeClient();
    const ack = deferred<DownloadQueueAck>();
    fake.client.queue = vi.fn(() => ack.promise);
    const controller = new DownloadQueueController(fake.client);
    controller.start();
    fake.resolveRegistration();

    const pending = controller.queue({ url: "https://example.com/video" });
    controller.dispose();
    const stateBefore = controller.getState();

    controller.start();
    fake.resolveRegistration();
    ack.resolve({ accepted: true, traceId: "trace-1" });
    await pending;

    expect(controller.getState()).toBe(stateBefore);
    // The new lifetime still reduces events normally.
    fake.emit(detailEvent([task()]));
    expect(controller.getState().order).toEqual(["trace-1"]);
  });

  it("keeps pre-start actions writing state normally", async () => {
    const fake = createFakeClient();
    fake.client.selectQuality = vi.fn(async () => false);
    const controller = new DownloadQueueController(fake.client);

    await controller.selectQuality("trace-1", "o1");

    expect(controller.getState().qualitySelecting).toEqual({});
  });
});

describe("MR4 terminal notification seam: exact post-reduction snapshot", () => {
  it("passes the post-reduction state so a background terminal (another primary remains) is suppressed", () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const decisions: Array<{
      outcomeTraceId: string;
      primaryTraceId: string | null;
      showReveal: boolean;
    }> = [];
    controller.subscribeTerminal((outcome, snapshot) => {
      const primary = selectPrimaryDownloadTask(snapshot);
      decisions.push({
        outcomeTraceId: outcome.traceId,
        primaryTraceId: primary?.traceId ?? null,
        showReveal: shouldShowDownloadTerminalReveal(primary),
      });
    });
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([
      task({ traceId: "trace-a" }),
      task({ traceId: "trace-b" }),
    ]));
    fake.emit(terminalEvent("trace-a"));

    expect(decisions).toHaveLength(1);
    // The snapshot is post-reduction: A is pruned and B is the current
    // primary -> the App decision derived from that exact snapshot suppresses
    // A (background terminal), without any React commit timing.
    expect(decisions[0]).toEqual({
      outcomeTraceId: "trace-a",
      primaryTraceId: "trace-b",
      showReveal: false,
    });
    expect(selectPrimaryDownloadTask(controller.getState())?.traceId).toBe("trace-b");
  });

  it("shows the sole terminal when no current primary remains after reduction", () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const decisions: Array<{ outcomeTraceId: string; showReveal: boolean }> = [];
    controller.subscribeTerminal((outcome, snapshot) => {
      const primary = selectPrimaryDownloadTask(snapshot);
      decisions.push({
        outcomeTraceId: outcome.traceId,
        showReveal: shouldShowDownloadTerminalReveal(primary),
      });
    });
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([task({ traceId: "trace-1" })]));
    fake.emit(terminalEvent("trace-1"));

    expect(decisions).toEqual([{ outcomeTraceId: "trace-1", showReveal: true }]);
  });

  it("synchronous progress/queue changes before a terminal are all present in the listener snapshot", () => {
    // Queue detail, progress, and a terminal emitted back-to-back with no
    // React commit in between: a React ref could only hold a stale commit,
    // but the controller snapshot is exact by construction — it is the
    // controller state after every prior synchronous reduction.
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const snapshots: DownloadQueueState[] = [];
    controller.subscribeTerminal((outcome, snapshot) => {
      snapshots.push(snapshot);
      expect(outcome.traceId).toBe("trace-a");
    });
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([
      task({ traceId: "trace-a" }),
      task({ traceId: "trace-b" }),
    ]));
    fake.emit(progressEvent("trace-b", 77));
    fake.emit(terminalEvent("trace-a"));

    expect(snapshots).toHaveLength(1);
    const snapshot = snapshots[0];
    expect(selectPrimaryDownloadTask(snapshot)?.traceId).toBe("trace-b");
    expect(snapshot.progressByTrace["trace-b"]?.percent).toBe(77);
    expect(snapshot.terminalTraceIds).toEqual(["trace-a"]);
  });
});

describe("MR8 Intake notification seam: authoritative marked membership", () => {
  it("reduces first and publishes one marked new membership with exact post state", () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const transitions: Array<{ traceId: string; order: string[] }> = [];
    controller.subscribeIntake((transition, snapshot) => {
      transitions.push({ traceId: transition.traceId, order: snapshot.order });
    });
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([task({ traceId: "accepted" })], "accepted"));

    expect(transitions).toEqual([{ traceId: "accepted", order: ["accepted"] }]);
  });

  it("never fabricates Intake from hydration, replay, an absent marker, or a local ack", async () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const transitions: string[] = [];
    controller.subscribeIntake((transition) => transitions.push(transition.traceId));
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([task({ traceId: "existing" })]));
    fake.emit(detailEvent([task({ traceId: "existing" })], "existing"));
    fake.emit(detailEvent([task({ traceId: "existing" })], "missing"));
    await controller.queue({ url: "https://example.com/local-command" });

    expect(transitions).toEqual([]);
  });

  it("publishes both concurrently captured marked post snapshots in order and stops after dispose", async () => {
    const fake = createFakeClient();
    const controller = new DownloadQueueController(fake.client);
    const transitions: string[] = [];
    controller.subscribeIntake((transition) => transitions.push(transition.traceId));
    controller.start();
    fake.resolveRegistration();

    fake.emit(detailEvent([task({ traceId: "first" })], "first"));
    fake.emit(detailEvent([
      task({ traceId: "first" }),
      task({ traceId: "second", status: "pending" }),
    ], "second"));
    controller.dispose();
    await flushMicrotasks();
    fake.emit(detailEvent([task({ traceId: "third" })], "third"));

    expect(transitions).toEqual(["first", "second"]);
  });
});
