import type { RawDownloadInput, ResolvedDownloadPlan, SiteProvider } from "../core/index.js";

export class SiteRegistry {
  private readonly providers: SiteProvider[];

  constructor(providers: SiteProvider[]) {
    this.providers = providers.slice();
  }

  list(): SiteProvider[] {
    return this.providers.slice();
  }

  resolve(input: RawDownloadInput): ResolvedDownloadPlan | null {
    for (const provider of this.providers) {
      if (!provider.matches(input)) {
        continue;
      }
      const resolved = provider.resolvePlan(input);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
}

export const createSiteRegistry = (providers: SiteProvider[]): SiteRegistry =>
  new SiteRegistry(providers);
