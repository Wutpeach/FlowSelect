import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  INITIAL_WINDOW_REVEAL_TIMEOUT_MS,
  waitForInitialWindowReveal,
} from "./windowRevealWait.mjs";

class FakeWebContents extends EventEmitter {
  private destroyed = false;

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
  }

  override removeListener(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    if (this.destroyed) {
      throw new TypeError("Object has been destroyed");
    }
    return super.removeListener(eventName, listener);
  }
}

class FakeWindow extends EventEmitter {
  readonly webContents = new FakeWebContents();
  private destroyed = false;

  isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
    this.webContents.destroy();
    this.emit("closed");
  }

  override removeListener(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    if (this.destroyed) {
      throw new TypeError("Object has been destroyed");
    }
    return super.removeListener(eventName, listener);
  }
}

describe("waitForInitialWindowReveal", () => {
  it("resolves when the renderer finishes loading", async () => {
    const win = new FakeWindow();
    const wait = waitForInitialWindowReveal(win, INITIAL_WINDOW_REVEAL_TIMEOUT_MS);

    win.webContents.emit("did-finish-load");

    await expect(wait).resolves.toBeUndefined();
  });

  it("resolves cleanly when the window closes before reveal completes", async () => {
    vi.useFakeTimers();

    try {
      const win = new FakeWindow();
      const wait = waitForInitialWindowReveal(win, INITIAL_WINDOW_REVEAL_TIMEOUT_MS);

      win.destroy();
      await expect(wait).resolves.toBeUndefined();

      await vi.runAllTimersAsync();
    } finally {
      vi.useRealTimers();
    }
  });
});
