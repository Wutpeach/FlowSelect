import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsPageSource = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");

describe("Settings diagnostics report projection", () => {
  it("uses localized facts and does not render backend diagnostic summaries", () => {
    expect(settingsPageSource).not.toContain("diagnosticsSnapshot.outputDirectory.writable.summary");
    expect(settingsPageSource).toContain("desktop:settings.diagnostics.conclusion.");
    expect(settingsPageSource).toContain("desktop:settings.diagnostics.writePermissionCaveat");
  });

  it("projects the required self-check headlines as compact rows", () => {
    expect(settingsPageSource).toContain("desktop:settings.diagnostics.runtimeGate");
    expect(settingsPageSource).toContain("desktop:settings.diagnostics.outputRead");
    expect(settingsPageSource).toContain("desktop:settings.diagnostics.outputWrite");
    expect(settingsPageSource).toContain("desktop:settings.diagnostics.browserBridge");
    expect(settingsPageSource).toContain("desktop:settings.diagnostics.browserClients");
    expect(settingsPageSource).toContain("desktop:settings.diagnostics.queueLabel");
  });
});
