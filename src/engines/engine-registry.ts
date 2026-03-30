import type { DownloadEngine, EngineId } from "../core/index.js";

export class EngineRegistry {
  private readonly engines = new Map<EngineId, DownloadEngine>();

  constructor(engines: DownloadEngine[]) {
    for (const engine of engines) {
      this.engines.set(engine.id, engine);
    }
  }

  get(id: EngineId): DownloadEngine | undefined {
    return this.engines.get(id);
  }

  list(): DownloadEngine[] {
    return [...this.engines.values()];
  }
}

export const createEngineRegistry = (engines: DownloadEngine[]): EngineRegistry =>
  new EngineRegistry(engines);
