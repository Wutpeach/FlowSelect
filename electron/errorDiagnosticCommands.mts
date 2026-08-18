import type { AmeowRendererCommand } from "../src/types/electronBridge.js";
import {
  buildErrorDiagnosticCopyText,
  normalizeErrorDiagnosticCopyRequest,
} from "./errorDiagnosticCopy.mjs";

type CommandPayload = Record<string, unknown> | undefined;

export type ErrorDiagnosticCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

export type ErrorDiagnosticCommandControllerOptions = {
  appVersion: string;
  platform?: string;
  arch?: string;
  writeClipboardText(text: string): void;
  now?(): Date;
};

const supportedCommands = new Set<AmeowRendererCommand>([
  "copy_error_diagnostics",
]);

export const createErrorDiagnosticCommandController = (
  options: ErrorDiagnosticCommandControllerOptions,
): ErrorDiagnosticCommandController => ({
  supports(command) {
    return supportedCommands.has(command);
  },

  async invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: CommandPayload,
  ): Promise<TResult> {
    switch (command) {
      case "copy_error_diagnostics": {
        const request = normalizeErrorDiagnosticCopyRequest(payload);
        const text = buildErrorDiagnosticCopyText({
          request,
          appVersion: options.appVersion,
          platform: options.platform,
          arch: options.arch,
          now: options.now,
        });
        options.writeClipboardText(text);
        return true as TResult;
      }
      default:
        throw new Error(`Unsupported error diagnostic command: ${command}`);
    }
  },
});
