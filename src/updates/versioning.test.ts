import { describe, expect, it } from "vitest";

import { compareAppVersions } from "./versioning";

describe("compareAppVersions", () => {
  it("treats stable releases as newer than prereleases on the same base version", () => {
    expect(compareAppVersions("0.3.0", "0.3.0-rc6")).toBe(1);
    expect(compareAppVersions("0.3.0-rc6", "0.3.0")).toBe(-1);
  });

  it("orders prerelease identifiers using semver precedence", () => {
    expect(compareAppVersions("0.3.0-beta.2", "0.3.0-beta.1")).toBe(1);
    expect(compareAppVersions("0.3.0-rc1", "0.3.0-beta.9")).toBe(1);
  });

  it("prefers higher normal versions regardless of prerelease suffix length", () => {
    expect(compareAppVersions("0.3.1-rc1", "0.3.0")).toBe(1);
    expect(compareAppVersions("0.4.0-beta.1", "0.3.9")).toBe(1);
  });
});
