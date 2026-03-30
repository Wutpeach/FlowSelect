import type { DownloadErrorCode } from "../constants/error-codes.js";

export class DownloadRuntimeError extends Error {
  readonly code: DownloadErrorCode;
  readonly context?: Record<string, unknown>;
  readonly fallbackable: boolean;

  constructor(
    code: DownloadErrorCode,
    message: string,
    options: {
      cause?: unknown;
      context?: Record<string, unknown>;
      fallbackable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "DownloadRuntimeError";
    this.code = code;
    this.context = options.context;
    this.fallbackable = options.fallbackable ?? true;
  }
}
