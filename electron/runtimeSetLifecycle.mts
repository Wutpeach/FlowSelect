/**
 * One target-scoped guard for the mutable managed runtime set. A lease keeps
 * the current paths stable until the spawned process tree has settled; a
 * repair/bootstrap mutation fails busy rather than replacing those paths.
 */
export type RuntimeSetLease = {
  release(): void;
};

export type RuntimeSetCapability = "yt-dlp" | "ffmpeg" | "deno" | "gallery-dl";

export class RuntimeSetBusyError extends Error {
  constructor() {
    super("Managed runtime is busy with an active process");
    this.name = "RuntimeSetBusyError";
  }
}

export type RuntimeSetLifecycleCoordinator = {
  acquireLease(
    capabilities: readonly RuntimeSetCapability[],
    prepare: (missingCapabilities: readonly RuntimeSetCapability[]) => Promise<void>,
  ): Promise<RuntimeSetLease>;
  runMutation<T>(mutation: () => Promise<T>): Promise<T>;
  activeLeaseCount(): number;
};

export const createRuntimeSetLifecycleCoordinator = (): RuntimeSetLifecycleCoordinator => {
  let activeLeases = 0;
  const activeCapabilityRefs = new Map<RuntimeSetCapability, number>();
  let preparedCapabilities = new Set<RuntimeSetCapability>();
  let exclusiveTail = Promise.resolve();

  const runExclusive = async <T,>(operation: () => Promise<T>): Promise<T> => {
    const previous = exclusiveTail;
    let releaseExclusive = (): void => undefined;
    exclusiveTail = new Promise<void>((resolve) => {
      releaseExclusive = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      releaseExclusive();
    }
  };

  const createLease = (capabilities: readonly RuntimeSetCapability[]): RuntimeSetLease => {
    for (const capability of capabilities) {
      activeCapabilityRefs.set(capability, (activeCapabilityRefs.get(capability) ?? 0) + 1);
    }
    let released = false;
    return {
      release() {
        if (released) {
          return;
        }
        released = true;
        activeLeases -= 1;
        for (const capability of capabilities) {
          const remaining = (activeCapabilityRefs.get(capability) ?? 1) - 1;
          if (remaining === 0) {
            activeCapabilityRefs.delete(capability);
          } else {
            activeCapabilityRefs.set(capability, remaining);
          }
        }
        if (activeLeases === 0) {
          preparedCapabilities.clear();
        }
      },
    };
  };

  return {
    async acquireLease(capabilities, prepare) {
      return await runExclusive(async () => {
        const requiredCapabilities = [...new Set(capabilities)];
        const missingCapabilities = requiredCapabilities.filter(
          (capability) => !preparedCapabilities.has(capability),
        );
        if (missingCapabilities.some((capability) => activeCapabilityRefs.has(capability))) {
          throw new RuntimeSetBusyError();
        }
        if (missingCapabilities.length > 0) {
          // Only readiness for disjoint paths may run while another lease is
          // active; every referenced capability remains prepared and untouched.
          await prepare(missingCapabilities);
          for (const capability of missingCapabilities) {
            preparedCapabilities.add(capability);
          }
        }
        activeLeases += 1;
        return createLease(requiredCapabilities);
      });
    },
    async runMutation(mutation) {
      return await runExclusive(async () => {
        if (activeLeases > 0) {
          throw new RuntimeSetBusyError();
        }
        try {
          return await mutation();
        } finally {
          preparedCapabilities.clear();
        }
      });
    },
    activeLeaseCount() {
      return activeLeases;
    },
  };
};
