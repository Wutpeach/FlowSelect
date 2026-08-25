import type { DiagnosticsSnapshot } from "../src/types/diagnostics.js";
import type { AmeowRendererCommand } from "../src/types/electronBridge.js";

type CommandPayload = Record<string, unknown> | undefined;

export type DiagnosticsCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type DiagnosticsCommandControllerOptions = {
  getDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot>;
};

const supportedCommands = new Set<AmeowRendererCommand>([
  "get_read_only_diagnostics",
]);

/** One narrow renderer command. It has no payload and no mutation authority. */
export const createDiagnosticsCommandController = (
  options: DiagnosticsCommandControllerOptions,
): DiagnosticsCommandController => ({
  supports(command) {
    return supportedCommands.has(command);
  },

  async invoke<TResult>(
    command: AmeowRendererCommand,
    _payload?: CommandPayload,
  ): Promise<TResult> {
    switch (command) {
      case "get_read_only_diagnostics":
        return await options.getDiagnosticsSnapshot() as TResult;
      default:
        throw new Error(`Unsupported diagnostics command: ${command}`);
    }
  },
});
