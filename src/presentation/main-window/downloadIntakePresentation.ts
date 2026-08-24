import { useEffect, useReducer } from "react";
import type {
  DownloadQueueState,
  DownloadTerminalOutcome,
} from "../../features/download/model";
import { selectPrimaryDownloadTask } from "../../features/download/selectors";
import type { LocalIntakeOrigin } from "../../application/download-api";

export const DOWNLOAD_INTAKE_PRESENTATION_DURATION_MS = 1200;
export const NEUTRAL_PRESENTATION_ORIGIN: LocalIntakeOrigin = { x: 0.5, y: 0.5 };

const readPresentationNow = (): number => (
  typeof performance === "undefined" ? Date.now() : performance.now()
);

export type DownloadIntakePresentationOpportunity = Readonly<{
  opportunityId: number;
  traceId: string;
  primaryTraceIdAtStart: string | null;
  origin: LocalIntakeOrigin;
  startedAt: number;
  deadlineAt: number;
}>;

export type DownloadIntakePresentationState = Readonly<{
  nextOpportunityId: number;
  current: DownloadIntakePresentationOpportunity | null;
}>;

export type DownloadIntakePresentationAction =
  | {
      type: "accepted";
      traceId: string;
      primaryTraceIdAtStart: string | null;
      origin?: LocalIntakeOrigin;
      now: number;
    }
  | { type: "expired"; opportunityId: number; now: number }
  | {
      type: "downloadStateChanged";
      liveTraceIds: readonly string[];
      primaryTraceId: string | null;
    }
  | {
      type: "terminalReceived";
      postReductionLiveTraceIds: readonly string[];
      postReductionPrimaryTraceId: string | null;
    }
  | { type: "reset" };

export const createDownloadIntakePresentationState = (
): DownloadIntakePresentationState => ({
  nextOpportunityId: 0,
  current: null,
});

const clearCurrent = (
  state: DownloadIntakePresentationState,
): DownloadIntakePresentationState => (
  state.current === null ? state : { ...state, current: null }
);

/**
 * Feature-specific bounded Presentation policy. It owns one latest opportunity
 * and stale guards only; Download membership and primary identity remain
 * read-only facts supplied by the Download feature.
 */
export const reduceDownloadIntakePresentation = (
  state: DownloadIntakePresentationState,
  action: DownloadIntakePresentationAction,
): DownloadIntakePresentationState => {
  switch (action.type) {
    case "accepted": {
      const opportunityId = state.nextOpportunityId + 1;
      return {
        nextOpportunityId: opportunityId,
        current: {
          opportunityId,
          traceId: action.traceId,
          primaryTraceIdAtStart: action.primaryTraceIdAtStart,
          origin: action.origin ?? NEUTRAL_PRESENTATION_ORIGIN,
          startedAt: action.now,
          deadlineAt: action.now + DOWNLOAD_INTAKE_PRESENTATION_DURATION_MS,
        },
      };
    }
    case "expired":
      if (
        state.current === null
        || state.current.opportunityId !== action.opportunityId
        || action.now < state.current.deadlineAt
      ) {
        return state;
      }
      return clearCurrent(state);
    case "downloadStateChanged": {
      const current = state.current;
      if (current === null) {
        return state;
      }
      if (!action.liveTraceIds.includes(current.traceId)) {
        return clearCurrent(state);
      }
      const { primaryTraceId } = action;
      if (
        primaryTraceId !== null
        && primaryTraceId !== current.traceId
        && primaryTraceId !== current.primaryTraceIdAtStart
      ) {
        return clearCurrent(state);
      }
      return state;
    }
    case "terminalReceived": {
      const reconciled = reduceDownloadIntakePresentation(state, {
        type: "downloadStateChanged",
        liveTraceIds: action.postReductionLiveTraceIds,
        primaryTraceId: action.postReductionPrimaryTraceId,
      });
      return action.postReductionPrimaryTraceId === null
        ? clearCurrent(reconciled)
        : reconciled;
    }
    case "reset":
      return clearCurrent(state);
  }
};

type SubscribeIntake = (
  listener: (
    transition: Readonly<{ traceId: string; origin?: LocalIntakeOrigin }>,
    postReductionState: DownloadQueueState,
  ) => void,
) => () => void;

type SubscribeTerminal = (
  listener: (
    outcome: DownloadTerminalOutcome,
    postReductionState: DownloadQueueState,
  ) => void,
) => () => void;

/** Thin React glue for controller subscriptions, one deadline, and cleanup. */
export const useDownloadIntakePresentation = ({
  downloadState,
  onIntake,
  onTerminal,
  now = readPresentationNow,
}: {
  downloadState: DownloadQueueState;
  onIntake: SubscribeIntake;
  onTerminal: SubscribeTerminal;
  now?: () => number;
}): DownloadIntakePresentationOpportunity | null => {
  const [state, dispatch] = useReducer(
    reduceDownloadIntakePresentation,
    undefined,
    createDownloadIntakePresentationState,
  );

  useEffect(() => {
    const unsubscribeIntake = onIntake((transition, postReductionState) => {
      dispatch({
        type: "accepted",
        traceId: transition.traceId,
        primaryTraceIdAtStart:
          selectPrimaryDownloadTask(postReductionState)?.traceId ?? null,
        origin: transition.origin,
        now: now(),
      });
    });
    const unsubscribeTerminal = onTerminal((_outcome, postReductionState) => {
      dispatch({
        type: "terminalReceived",
        postReductionLiveTraceIds: postReductionState.order,
        postReductionPrimaryTraceId:
          selectPrimaryDownloadTask(postReductionState)?.traceId ?? null,
      });
    });
    return () => {
      unsubscribeIntake();
      unsubscribeTerminal();
      dispatch({ type: "reset" });
    };
  }, [now, onIntake, onTerminal]);

  useEffect(() => {
    dispatch({
      type: "downloadStateChanged",
      liveTraceIds: downloadState.order,
      primaryTraceId: selectPrimaryDownloadTask(downloadState)?.traceId ?? null,
    });
  }, [downloadState]);

  const currentOpportunity = state.current;
  useEffect(() => {
    const current = currentOpportunity;
    if (current === null) {
      return;
    }
    let handle: number | null = null;
    const expireAtDeadline = (): void => {
      const currentNow = now();
      const remaining = current.deadlineAt - currentNow;
      if (remaining > 0) {
        handle = window.setTimeout(expireAtDeadline, remaining);
        return;
      }
      handle = null;
      dispatch({
        type: "expired",
        opportunityId: current.opportunityId,
        now: currentNow,
      });
    };
    handle = window.setTimeout(
      expireAtDeadline,
      Math.max(0, current.deadlineAt - now()),
    );
    return () => {
      if (handle !== null) window.clearTimeout(handle);
    };
  }, [currentOpportunity, now]);

  // State effects perform cleanup, while this pure current-fact projection
  // prevents even one render from exposing a removed/replaced stale Intake.
  return reduceDownloadIntakePresentation(state, {
    type: "downloadStateChanged",
    liveTraceIds: downloadState.order,
    primaryTraceId: selectPrimaryDownloadTask(downloadState)?.traceId ?? null,
  }).current;
};
