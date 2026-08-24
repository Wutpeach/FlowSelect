import { describe, expect, it } from "vitest";
import { validateAvatarDefinition } from "@bible-strong/avatar-core";
import {
  STROBI_DEFAULT_ANIMATION,
  STROBI_DEFINITION,
  STROBI_UPSTREAM_REVISION,
} from "./strobiDefinition";

describe("Pinned Compact Strobi definition", () => {
  it("is the exact source-specific minimum for the approved first scope", () => {
    expect(STROBI_UPSTREAM_REVISION).toBe("175691ab32cefe5faec7828af62f3d50210a8eb2");
    expect(STROBI_DEFAULT_ANIMATION).toBe("proud");
    expect(STROBI_DEFINITION.colors).toEqual({ body: "#5b7fe5", eyes: "#111316" });
    expect(STROBI_DEFINITION.expressionOrder).toEqual([
      "neutral",
      "far-right-glance",
      "curious-left",
      "joyful-down-right",
    ]);
    expect(STROBI_DEFINITION.animations.proud.steps.map((step) => step.expression)).toEqual([
      "far-right-glance",
      "curious-left",
      "joyful-down-right",
    ]);
  });

  it("passes the official avatar-core definition validator", () => {
    expect(validateAvatarDefinition(STROBI_DEFINITION).ok).toBe(true);
  });
});
