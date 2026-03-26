import { describe, expect, it } from "vitest";
import { parseYtDlpProgressLine } from "./ytDlpProgress";

describe("parseYtDlpProgressLine", () => {
  it("parses standard yt-dlp download lines", () => {
    const payload = parseYtDlpProgressLine(
      "trace-1",
      "[download]  37.5% of 12.34MiB at 1.23MiB/s ETA 00:12",
    );

    expect(payload).not.toBeNull();
    expect(payload?.traceId).toBe("trace-1");
    expect(payload?.percent).toBe(37.5);
    expect(payload?.stage).toBe("downloading");
    expect(payload?.speed).toBe("1.23MiB/s");
    expect(payload?.eta).toBe("00:12");
  });

  it("maps merge lines into merging stage", () => {
    const payload = parseYtDlpProgressLine(
      "trace-2",
      "[Merger] Merging formats into \"output.mp4\"",
    );

    expect(payload).not.toBeNull();
    expect(payload?.stage).toBe("merging");
    expect(payload?.percent).toBe(100);
  });

  it("ignores non-progress noise", () => {
    expect(parseYtDlpProgressLine("trace-3", "WARNING: extractor failed")).toBeNull();
  });
});

