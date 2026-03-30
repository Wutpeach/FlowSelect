import type { SiteProvider } from "../core/index.js";
import { builtinProviders } from "./index.js";

export type SiteProviderLoader = () => SiteProvider[];

export const loadBuiltinProviders: SiteProviderLoader = () => builtinProviders.slice();
