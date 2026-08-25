import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createConfigStore,
  parseJsonObject,
  resolveExtensionInjectionDebugEnabledFromConfigObject,
  resolveThemeFromConfigObject,
} from "./configStore.mjs";

const createMemoryFs = (initialFiles: Record<string, string> = {}) => {
  const files = new Map(Object.entries(initialFiles));
  const directories: string[] = [];

  return {
    files,
    directories,
    fs: {
      existsSync: vi.fn((path: string) => files.has(path)),
      mkdir: vi.fn(async (path: string) => {
        directories.push(path);
      }),
      readFile: vi.fn(async (path: string) => files.get(path) ?? ""),
      writeFile: vi.fn(async (path: string, value: string | Uint8Array) => {
        files.set(path, String(value));
      }),
    },
  };
};

const createStore = (overrides: Record<string, unknown> = {}) => {
  const memoryFs = createMemoryFs(overrides.initialFiles as Record<string, string> | undefined);
  const emitAppEvent = vi.fn();
  const broadcastWsMessage = vi.fn();
  const refreshTrayMenu = vi.fn(async () => undefined);
  const onTrayRefreshError = vi.fn();
  const store = createConfigStore({
    getUserDataDir: vi.fn(() => "/user-data"),
    getDesktopDir: vi.fn(() => "/desktop"),
    getLocale: vi.fn(() => "en-US"),
    logDirName: "logs",
    defaultOutputFolderName: "Ameow_Received",
    fallbackTheme: "black",
    languageChangedEventName: "language-changed",
    emitAppEvent,
    broadcastWsMessage,
    refreshTrayMenu,
    onTrayRefreshError,
    fs: memoryFs.fs,
    ...overrides,
  });

  return {
    ...memoryFs,
    broadcastWsMessage,
    emitAppEvent,
    onTrayRefreshError,
    refreshTrayMenu,
    store,
  };
};

describe("config selectors", () => {
  it("parses only object JSON and falls back to empty objects", () => {
    expect(parseJsonObject("{\"theme\":\"white\"}")).toEqual({ theme: "white" });
    expect(parseJsonObject("[]")).toEqual({});
    expect(parseJsonObject("{")).toEqual({});
  });

  it("resolves stable theme and extension debug defaults", () => {
    expect(resolveThemeFromConfigObject({ theme: "white" })).toBe("white");
    expect(resolveThemeFromConfigObject({ theme: "purple" }, "black")).toBe("black");
    expect(resolveExtensionInjectionDebugEnabledFromConfigObject({
      extensionInjectionDebugEnabled: true,
    })).toBe(true);
    expect(resolveExtensionInjectionDebugEnabledFromConfigObject({})).toBe(false);
  });
});

describe("createConfigStore", () => {
  it("creates user-data directories and returns empty config for missing settings", async () => {
    const { directories, store } = createStore();

    await expect(store.readConfigString()).resolves.toBe("{}");
    await expect(store.readConfigObject()).resolves.toEqual({});

    expect(directories).toContain("/user-data");
    expect(directories).toContain(join("/user-data", "logs"));
    expect(store.getConfigPath()).toBe(join("/user-data", "settings.json"));
    expect(store.getLogsDir()).toBe(join("/user-data", "logs"));
  });

  it("reads diagnostics config facts without creating directories or persisting defaults", async () => {
    const { directories, fs, store } = createStore();

    await expect(store.readConfigObjectNoCreate()).resolves.toEqual({});
    await expect(store.resolveCurrentOutputFolderPathNoCreate()).resolves.toBe(
      join("/desktop", "Ameow_Received"),
    );

    expect(directories).toEqual([]);
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("returns empty objects for invalid JSON without throwing", async () => {
    const configPath = join("/user-data", "settings.json");
    const { store } = createStore({
      initialFiles: {
        [configPath]: "{",
      },
    });

    await expect(store.readConfigString()).resolves.toBe("{");
    await expect(store.readConfigObject()).resolves.toEqual({});
  });

  it("persists startup language when a config file has no language", async () => {
    const configPath = join("/user-data", "settings.json");
    const { files, store } = createStore({
      getLocale: vi.fn(() => "zh-Hant"),
      initialFiles: {
        [configPath]: JSON.stringify({ theme: "black" }),
      },
    });

    await expect(store.readConfigString()).resolves.toBe(JSON.stringify({
      theme: "black",
      language: "zh-CN",
    }));
    expect(files.get(configPath)).toBe(JSON.stringify({
      theme: "black",
      language: "zh-CN",
    }));
  });

  it("builds startup snapshots with raw config, language, theme, and shortcut", () => {
    const { store } = createStore({
      getLocale: vi.fn(() => "zh-CN"),
    });

    expect(store.buildStartupConfigSnapshot(JSON.stringify({
      language: "en-US",
      theme: "white",
      shortcut: "  Ctrl+Alt+A  ",
    }))).toEqual({
      raw: JSON.stringify({
        language: "en-US",
        theme: "white",
        shortcut: "  Ctrl+Alt+A  ",
      }),
      config: {
        language: "en-US",
        theme: "white",
        shortcut: "  Ctrl+Alt+A  ",
      },
      language: "en",
      theme: "white",
      shortcut: "Ctrl+Alt+A",
    });
  });

  it("fires save side effects only for changed language and extension debug config", async () => {
    const configPath = join("/user-data", "settings.json");
    const {
      broadcastWsMessage,
      emitAppEvent,
      refreshTrayMenu,
      store,
    } = createStore({
      initialFiles: {
        [configPath]: JSON.stringify({
          language: "en",
          extensionInjectionDebugEnabled: false,
        }),
      },
    });

    await store.saveConfigString(JSON.stringify({
      language: "zh-CN",
      extensionInjectionDebugEnabled: true,
    }));

    expect(emitAppEvent).toHaveBeenCalledWith("language-changed", { language: "zh-CN" });
    expect(broadcastWsMessage).toHaveBeenCalledWith({
      action: "language_changed",
      data: { language: "zh-CN" },
    });
    expect(broadcastWsMessage).toHaveBeenCalledWith({
      action: "extension_debug_config_changed",
      data: { enabled: true },
    });
    expect(refreshTrayMenu).toHaveBeenCalledTimes(1);

    broadcastWsMessage.mockClear();
    emitAppEvent.mockClear();
    refreshTrayMenu.mockClear();

    await store.saveConfigString(JSON.stringify({
      language: "zh-CN",
      extensionInjectionDebugEnabled: true,
    }));

    expect(emitAppEvent).not.toHaveBeenCalled();
    expect(broadcastWsMessage).not.toHaveBeenCalled();
    expect(refreshTrayMenu).not.toHaveBeenCalled();
  });

  it("uses configured outputPath before desktop fallback", async () => {
    const configPath = join("/user-data", "settings.json");
    const { store } = createStore({
      initialFiles: {
        [configPath]: JSON.stringify({ outputPath: "  /downloads  " }),
      },
    });

    await expect(store.resolveCurrentOutputFolderPath()).resolves.toBe("/downloads");

    const fallback = createStore();
    await expect(fallback.store.resolveCurrentOutputFolderPath()).resolves.toBe(
      join("/desktop", "Ameow_Received"),
    );
  });

  it("preserves arbitrary config keys such as global proxy settings", async () => {
    const configPath = join("/user-data", "settings.json");
    const { store } = createStore({
      initialFiles: {
        [configPath]: JSON.stringify({
          globalProxyEnabled: true,
          globalProxyUrl: "http://127.0.0.1:7897",
        }),
      },
    });

    await expect(store.readConfigObject()).resolves.toEqual({
      globalProxyEnabled: true,
      globalProxyUrl: "http://127.0.0.1:7897",
      language: "en",
    });
  });
});
