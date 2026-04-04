import { describe, expect, it } from "vitest";
import {
  applyAppVersionToExtensionManifest,
  assertValidChromiumExtensionVersion,
  deriveChromiumExtensionVersion,
  isValidChromiumExtensionVersion,
} from "./browser-extension-versioning.mjs";

describe("deriveChromiumExtensionVersion", () => {
  it("keeps stable versions numeric", () => {
    expect(deriveChromiumExtensionVersion("0.3.0")).toBe("0.3.0");
  });

  it("maps dotted prerelease versions to a fourth numeric segment", () => {
    expect(deriveChromiumExtensionVersion("0.4.0-beta.8")).toBe("0.4.0.8");
  });

  it("maps compact prerelease versions to a fourth numeric segment", () => {
    expect(deriveChromiumExtensionVersion("0.4.0-rc1")).toBe("0.4.0.1");
  });

  it("uses 1 when the prerelease label has no numeric token", () => {
    expect(deriveChromiumExtensionVersion("0.4.0-beta")).toBe("0.4.0.1");
  });
});

describe("Chromium extension version validation", () => {
  it("accepts numeric dot-separated versions", () => {
    expect(isValidChromiumExtensionVersion("1.2.3")).toBe(true);
    expect(isValidChromiumExtensionVersion("1.2.3.4")).toBe(true);
  });

  it("rejects semantic prerelease versions directly", () => {
    expect(isValidChromiumExtensionVersion("0.4.0-beta.8")).toBe(false);
    expect(() => assertValidChromiumExtensionVersion("0.4.0-beta.8")).toThrow(/invalid for Chromium/i);
  });
});

describe("applyAppVersionToExtensionManifest", () => {
  it("removes version_name for stable versions", () => {
    const manifest = applyAppVersionToExtensionManifest({
      manifest_version: 3,
      name: "FlowSelect Video Picker",
      version: "0.0.0",
      version_name: "old-value",
    }, "0.3.0");

    expect(manifest.version).toBe("0.3.0");
    expect("version_name" in manifest).toBe(false);
  });

  it("stores the full prerelease in version_name while keeping version installable", () => {
    const manifest = applyAppVersionToExtensionManifest({
      manifest_version: 3,
      name: "FlowSelect Video Picker",
      version: "0.0.0",
    }, "0.4.0-beta.8");

    expect(manifest.version).toBe("0.4.0.8");
    expect(manifest.version_name).toBe("0.4.0-beta.8");
  });
});
