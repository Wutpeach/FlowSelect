import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { DownloadQueueAck, LocalIntakeOrigin } from "../../application/download-api";
import {
  reduceDownloadQueue,
  type DownloadAction,
} from "./reducer";
import type {
  DownloadQueueClient,
  DownloadQueueEvent,
  DownloadQueueRequest,
} from "./client";
import {
  createInitialDownloadQueueState,
  type DownloadQueueState,
  type DownloadTerminalOutcome,
} from "./model";

export type DownloadIntakeTransition = Readonly<{
  traceId: string;
  origin?: LocalIntakeOrigin;
}>;

/**
 * Lifecycle-safe Download queue controller: one reducer instance and one
 * subscription owner per client identity. Protocol events are reduced
 * synchronously when they arrive; shell presentation effects run only after
 * reduction. Safe across rerender, unmount, deferred registration resolution,
 * client replacement, and Strict Effects setup/cleanup ordering.
 */
export class DownloadQueueController {
  private state: DownloadQueueState;
  private readonly client: DownloadQueueClient;
  private readonly stateListeners = new Set<(state: DownloadQueueState) => void>();
  // Terminal listeners receive (outcome, postReductionState): the read-only
  // controller state AFTER terminalReceived reduced the authoritative fact,
  // captured synchronously at the notification boundary. This is exact by
  // construction — no React commit timing or ref snapshot can lag it — and
  // the state is never mutated by listeners.
  private readonly terminalListeners = new Set<
    (outcome: DownloadTerminalOutcome, postReductionState: DownloadQueueState) => void
  >();
  private readonly intakeListeners = new Set<
    (transition: DownloadIntakeTransition, postReductionState: DownloadQueueState) => void
  >();
  /** True only after dispose(); a pre-start controller is still usable. */
  private disposed = false;
  /** Bumped on every start/dispose so stale registrations and action
   * continuations from a superseded lifetime self-invalidate. */
  private epoch = 0;
  private activeDisposer: (() => void) | null = null;
  private registration: Promise<void> | null = null;

  constructor(
    client: DownloadQueueClient,
    initialState: DownloadQueueState = createInitialDownloadQueueState(),
  ) {
    this.client = client;
    this.state = initialState;
  }

  getState(): DownloadQueueState {
    return this.state;
  }

  subscribeState(listener: (state: DownloadQueueState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  subscribeTerminal(
    listener: (outcome: DownloadTerminalOutcome, postReductionState: DownloadQueueState) => void,
  ): () => void {
    this.terminalListeners.add(listener);
    return () => {
      this.terminalListeners.delete(listener);
    };
  }

  subscribeIntake(
    listener: (
      transition: DownloadIntakeTransition,
      postReductionState: DownloadQueueState,
    ) => void,
  ): () => void {
    this.intakeListeners.add(listener);
    return () => {
      this.intakeListeners.delete(listener);
    };
  }

  /** Registers the single Download subscription. Idempotent while live; a
   * subscription that resolves after dispose (or after a newer registration)
   * disposes itself immediately. */
  start(): void {
    if (!this.disposed && this.registration) {
      return;
    }
    this.disposed = false;
    const epoch = ++this.epoch;
    this.registration = this.client.subscribe((event) => {
      if (this.disposed || epoch !== this.epoch) {
        return; // callbacks after dispose / stale registration are ignored
      }
      this.handleEvent(event);
    }).then((disposer) => {
      if (this.disposed || epoch !== this.epoch) {
        disposer();
        return;
      }
      this.activeDisposer = disposer;
    }).catch((error) => {
      console.error("Failed to register download queue subscription:", error);
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.epoch += 1;
    this.activeDisposer?.();
    this.activeDisposer = null;
    this.registration = null;
    this.stateListeners.clear();
    this.terminalListeners.clear();
    this.intakeListeners.clear();
  }

  queue(request: DownloadQueueRequest): Promise<DownloadQueueAck> {
    const epoch = this.epoch;
    return this.client.queue(request).then((ack) => this.acceptQueueAck(epoch, ack));
  }

  queuePasted(url: string, intakeOrigin?: LocalIntakeOrigin): Promise<DownloadQueueAck> {
    const epoch = this.epoch;
    return this.client.queuePasted(url, intakeOrigin).then((ack) => this.acceptQueueAck(epoch, ack));
  }

  cancel(traceId: string): Promise<boolean> {
    if (this.state.cancelling.includes(traceId)) {
      return Promise.resolve(false);
    }
    this.dispatch({ type: "cancelRequested", traceId });
    return this.runBooleanCommand(
      this.epoch,
      () => this.client.cancel(traceId),
      { type: "cancelRequestRejected", traceId },
    );
  }

  selectQuality(traceId: string, optionId: string): Promise<boolean> {
    if (this.state.qualitySelecting[traceId] !== undefined) {
      return Promise.resolve(false);
    }
    this.dispatch({ type: "qualitySelectionRequested", traceId, optionId });
    return this.runBooleanCommand(
      this.epoch,
      () => this.client.selectQuality(traceId, optionId),
      { type: "qualitySelectionRejected", traceId, optionId },
    );
  }

  reset(): void {
    this.dispatch({ type: "reset" });
  }

  /** An accepted queue acknowledgement starts a new trace generation. */
  private acceptQueueAck(epoch: number, ack: DownloadQueueAck): DownloadQueueAck {
    if (ack.accepted) {
      this.dispatchIfCurrent(epoch, { type: "queueAccepted", traceId: ack.traceId });
    }
    return ack;
  }

  /** Dispatches only while the controller lifetime that started the action is
   * still current. A continuation resolving after dispose/supersession never
   * writes state; a pre-start action shares the current token and stays
   * allowed. */
  private dispatchIfCurrent(epoch: number, action: DownloadAction): void {
    if (!this.disposed && epoch === this.epoch) {
      this.dispatch(action);
    }
  }

  /** Runs a boolean command and applies its cleanup action on `false` or on
   * rejection, gated to the controller lifetime that started it. */
  private runBooleanCommand(
    epoch: number,
    command: () => Promise<boolean>,
    onNotAccepted: DownloadAction,
  ): Promise<boolean> {
    return command().then((accepted) => {
      if (!accepted) {
        this.dispatchIfCurrent(epoch, onNotAccepted);
      }
      return accepted;
    }).catch((error) => {
      this.dispatchIfCurrent(epoch, onNotAccepted);
      throw error;
    });
  }

  dispatch(action: DownloadAction): void {
    const nextState = reduceDownloadQueue(this.state, action);
    if (nextState === this.state) {
      return;
    }
    this.state = nextState;
    this.stateListeners.forEach((listener) => listener(nextState));
  }

  private handleEvent(event: DownloadQueueEvent): void {
    switch (event.type) {
      case "progress":
        this.dispatch({ type: "progressReceived", progress: event.progress });
        break;
      case "terminal": {
        // Duplicate terminals are idempotent end to end: the reducer ignores
        // them, and terminal facts/presentation are emitted only for the
        // first transition.
        if (this.state.terminalTraceIds.includes(event.payload.traceId)) {
          break;
        }
        const outcome = this.client.classifyTerminal(
          event.payload,
          this.state.cancelling.includes(event.payload.traceId),
        );
        this.dispatch({ type: "terminalReceived", outcome });
        // Exact post-reduction snapshot: dispatch replaced this.state
        // synchronously, so listeners see every prior event (progress, queue
        // detail, earlier terminals) and never a stale React commit.
        this.terminalListeners.forEach((listener) => listener(outcome, this.state));
        break;
      }
      case "queueCount":
        this.dispatch({ type: "queueCountReceived", maxConcurrent: event.maxConcurrent });
        break;
      case "queueDetail": {
        const acceptedTraceId = event.acceptedTraceId;
        const wasAlreadyMember = acceptedTraceId === undefined
          ? false
          : Object.prototype.hasOwnProperty.call(this.state.tasksById, acceptedTraceId);
        this.dispatch({ type: "queueDetailReceived", tasks: event.tasks });
        if (
          acceptedTraceId !== undefined
          && !wasAlreadyMember
          && Object.prototype.hasOwnProperty.call(this.state.tasksById, acceptedTraceId)
        ) {
          const transition = {
            traceId: acceptedTraceId,
            ...(event.acceptedIntakeOrigin === undefined
              ? {}
              : { origin: event.acceptedIntakeOrigin }),
          };
          this.intakeListeners.forEach((listener) => listener(transition, this.state));
        }
        break;
      }
    }
  }
}

/**
 * Feature hook: one controller per client identity, one subscription per
 * controller, and selector-driven state through `useSyncExternalStore`.
 * Exposes state, actions, and terminal transition facts to App composition.
 */
export function useDownloadQueue(client: DownloadQueueClient) {
  const [entry, setEntry] = useState(() => ({ client, controller: new DownloadQueueController(client) }));
  // Client replacement swaps the controller during render (React's documented
  // adjust-state-on-prop-change pattern); the discarded controller is disposed
  // and the new one starts through the effect below, so no duplicate
  // subscription is ever left live.
  if (entry.client !== client) {
    entry.controller.dispose();
    setEntry({ client, controller: new DownloadQueueController(client) });
  }
  const controller = entry.controller;

  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);

  const state = useSyncExternalStore(
    useCallback((listener) => controller.subscribeState(listener), [controller]),
    useCallback(() => controller.getState(), [controller]),
  );

  const actions = useMemo(() => ({
    queue: (request: DownloadQueueRequest) => controller.queue(request),
    queuePasted: (url: string, intakeOrigin?: LocalIntakeOrigin) => controller.queuePasted(url, intakeOrigin),
    cancel: (traceId: string) => controller.cancel(traceId),
    selectQuality: (traceId: string, optionId: string) => controller.selectQuality(traceId, optionId),
    reset: () => controller.reset(),
  }), [controller]);

  const onTerminal = useCallback(
    (
      listener: (
        outcome: DownloadTerminalOutcome,
        postReductionState: DownloadQueueState,
      ) => void,
    ) => controller.subscribeTerminal(listener),
    [controller],
  );

  const onIntake = useCallback(
    (
      listener: (
        transition: DownloadIntakeTransition,
        postReductionState: DownloadQueueState,
      ) => void,
    ) => controller.subscribeIntake(listener),
    [controller],
  );

  return { state, actions, onIntake, onTerminal };
}
