import {
  classifyDownloadFailure,
  isFallbackEligibleFailure,
  type DownloadFailureClassification,
} from "../constants/error-classifications.js";
import type { DownloadErrorCode } from "../constants/error-codes.js";

export class DownloadRuntimeError extends Error {
  readonly code: DownloadErrorCode;
  readonly classification: DownloadFailureClassification;
  readonly context?: Record<string, unknown>;
  readonly fallbackable: boolean;
  declare readonly cause?: unknown;

  constructor(
    code: DownloadErrorCode,
    message: string,
    options: {
      cause?: unknown;
      classification?: DownloadFailureClassification;
      context?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "DownloadRuntimeError";
    this.code = code;
    this.classification = options.classification ?? classifyDownloadFailure({
      code,
      message,
      context: options.context,
    });
    this.context = options.context;
    this.fallbackable = isFallbackEligibleFailure(this.classification);
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
