import {
  DownloadRuntimeError,
  downloadIntentSchema,
  enginePlanSchema,
  type EnginePlan,
  rawDownloadInputSchema,
  type DownloadErrorCode,
  type EngineExecutionContext,
  type RawDownloadInput,
  type ResolvedDownloadPlan,
} from "../core/index.js";
import type { EngineRegistry } from "../engines/engine-registry.js";
import type { SiteRegistry } from "../sites/site-registry.js";
import type { DownloadResultPayload } from "../types/videoRuntime.js";

const shouldFallbackForError = (
  error: DownloadRuntimeError,
  plan: EnginePlan,
): boolean => {
  if (!error.fallbackable) {
    return false;
  }
  if (!plan.fallbackOn || plan.fallbackOn === "any") {
    return true;
  }
  return plan.fallbackOn.includes(error.code);
};

const toRuntimeError = (error: unknown, code: DownloadErrorCode): DownloadRuntimeError => {
  if (error instanceof DownloadRuntimeError) {
    return error;
  }
  return new DownloadRuntimeError(
    code,
    error instanceof Error ? error.message : String(error ?? "Unknown error"),
    {
      cause: error,
    },
  );
};

export class DownloadOrchestrator {
  constructor(
    private readonly siteRegistry: SiteRegistry,
    private readonly engineRegistry: EngineRegistry,
  ) {}

  async execute(
    input: RawDownloadInput,
    buildContext: (
      plan: ResolvedDownloadPlan,
      enginePlan: EnginePlan,
    ) => EngineExecutionContext,
  ): Promise<DownloadResultPayload> {
    const normalizedInput = rawDownloadInputSchema.parse(input);
    const resolvedPlan = this.siteRegistry.resolve(normalizedInput);
    if (!resolvedPlan) {
      throw new DownloadRuntimeError(
        "E_NO_PROVIDER_MATCH",
        "No site provider matched the incoming download request",
        {
          context: { input: normalizedInput },
          fallbackable: false,
        },
      );
    }

    downloadIntentSchema.parse(resolvedPlan.intent);
    const orderedPlans = resolvedPlan.engines
      .slice()
      .sort((left, right) => right.priority - left.priority);

    let lastError: DownloadRuntimeError | null = null;
    for (const enginePlan of orderedPlans) {
      enginePlanSchema.parse(enginePlan);
      const engine = this.engineRegistry.get(enginePlan.engine);
      if (!engine) {
        lastError = new DownloadRuntimeError(
          "E_ENGINE_NOT_FOUND",
          `Engine not registered: ${enginePlan.engine}`,
          {
            context: { providerId: resolvedPlan.providerId },
          },
        );
        continue;
      }

      const validationError = engine.validateIntent(resolvedPlan.intent, enginePlan);
      if (validationError) {
        lastError = validationError;
        if (shouldFallbackForError(validationError, enginePlan)) {
          continue;
        }
        throw validationError;
      }

      try {
        return await engine.execute(buildContext(resolvedPlan, enginePlan));
      } catch (error) {
        lastError = toRuntimeError(error, "E_EXECUTION_FAILED");
        if (shouldFallbackForError(lastError, enginePlan)) {
          continue;
        }
        throw lastError;
      }
    }

    throw lastError ?? new DownloadRuntimeError(
      "E_NO_ENGINE_SUCCEEDED",
      "No engine succeeded for the resolved download plan",
      {
        context: { input: normalizedInput },
      },
    );
  }
}
