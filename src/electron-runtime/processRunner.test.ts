import { describe, expect, it } from "vitest";

import { runStreamingCommand } from "./processRunner";

const waitFor = async (
  predicate: () => boolean,
  attempts = 50,
): Promise<void> => {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe("runStreamingCommand", () => {
  it("waits for async stdout line handlers to finish before resolving", async () => {
    const order: string[] = [];
    const releaseHandlerRef: { current: (() => void) | null } = { current: null };

    const handlerGate = new Promise<void>((resolve) => {
      releaseHandlerRef.current = resolve;
    });

    const commandPromise = runStreamingCommand(
      process.execPath,
      ["-e", "console.log('hello from child')"],
      {
        onStdoutLine: async (line) => {
          order.push(`handler-start:${line}`);
          await handlerGate;
          order.push(`handler-end:${line}`);
        },
      },
    ).then(() => {
      order.push("resolved");
    });

    await waitFor(() => order.length > 0);
    expect(order).toEqual(["handler-start:hello from child"]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(order).toEqual(["handler-start:hello from child"]);

    releaseHandlerRef.current?.();
    await commandPromise;

    expect(order).toEqual([
      "handler-start:hello from child",
      "handler-end:hello from child",
      "resolved",
    ]);
  });
});
