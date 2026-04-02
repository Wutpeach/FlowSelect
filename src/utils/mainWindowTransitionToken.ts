export type MainWindowBoundsTransitionTarget = "compact" | "full";

export type MainWindowBoundsTransitionState = {
  token: number;
  target: MainWindowBoundsTransitionTarget;
};

export const advanceMainWindowBoundsTransition = (
  current: MainWindowBoundsTransitionState,
  target: MainWindowBoundsTransitionTarget,
): MainWindowBoundsTransitionState => ({
  token: current.token + 1,
  target,
});

export const isMainWindowBoundsTransitionCurrent = (
  current: MainWindowBoundsTransitionState,
  expectedToken: number | null | undefined,
  expectedTarget?: MainWindowBoundsTransitionTarget,
): boolean => {
  if (typeof expectedToken !== "number") {
    return false;
  }

  if (current.token !== expectedToken) {
    return false;
  }

  if (expectedTarget && current.target !== expectedTarget) {
    return false;
  }

  return true;
};
