import type { RawDownloadInput } from "./raw-download-input.js";
import type { ResolvedDownloadPlan } from "./engine-plan.js";

export interface SiteProvider {
  readonly id: string;
  matches(input: RawDownloadInput): boolean;
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan | null;
}
