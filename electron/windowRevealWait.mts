type RevealWaitListener = () => void;

type RevealWaitEventTarget<TEvent extends string> = {
  isDestroyed(): boolean;
  on(eventName: TEvent, listener: RevealWaitListener): unknown;
  removeListener(eventName: TEvent, listener: RevealWaitListener): unknown;
};

type RevealWaitWebContents = RevealWaitEventTarget<"did-finish-load" | "did-fail-load">;

export type RevealWaitWindow = RevealWaitEventTarget<"ready-to-show" | "closed"> & {
  webContents: RevealWaitWebContents;
};

export const INITIAL_WINDOW_REVEAL_TIMEOUT_MS = 4_000;

const removeListenerIfAlive = <TEvent extends string>(
  target: RevealWaitEventTarget<TEvent>,
  eventName: TEvent,
  listener: RevealWaitListener,
): void => {
  if (target.isDestroyed()) {
    return;
  }

  target.removeListener(eventName, listener);
};

export function waitForInitialWindowReveal(
  win: RevealWaitWindow,
  timeoutMs = INITIAL_WINDOW_REVEAL_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolveReveal) => {
    if (win.isDestroyed()) {
      resolveReveal(undefined);
      return;
    }

    const webContents = win.webContents;
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      removeListenerIfAlive(win, "ready-to-show", finish);
      removeListenerIfAlive(win, "closed", finish);
      removeListenerIfAlive(webContents, "did-finish-load", finish);
      removeListenerIfAlive(webContents, "did-fail-load", finish);
      resolveReveal(undefined);
    };

    if (webContents.isDestroyed()) {
      finish();
      return;
    }

    timeoutId = setTimeout(finish, timeoutMs);
    win.on("ready-to-show", finish);
    win.on("closed", finish);
    webContents.on("did-finish-load", finish);
    webContents.on("did-fail-load", finish);
  });
}
