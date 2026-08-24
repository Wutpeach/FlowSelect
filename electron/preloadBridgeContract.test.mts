// Static guard: electron/preload.mts is @ts-nocheck, so the typed renderer
// contract (src/types/electronBridge.ts) can drift from the actual preload
// bridge without any compiler catching it (this happened once:
// `ensureCompactReachable` vs `ensureMainWindowCompactReachable`). This test
// pins the `currentWindow` method names in both files to identical sets so a
// rename must land in both places at once.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readSource = (relative: string): string => (
  readFileSync(path.join(repoRoot, relative), "utf8").replace(/\r\n/g, "\n")
);

const extractMethodNames = (
  source: string,
  blockStart: string,
  blockEnd: string,
  methodPattern: RegExp,
): string[] => {
  const start = source.indexOf(blockStart);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(blockEnd, start);
  expect(end).toBeGreaterThanOrEqual(0);
  const block = source.slice(start + blockStart.length, end);
  return [...new Set([...block.matchAll(methodPattern)].map((match) => match[1]))].sort();
};

describe("preload bridge contract parity", () => {
  it("exposes exactly the typed currentWindow methods", () => {
    const preloadMethods = extractMethodNames(
      readSource("electron/preload.mts"),
      "currentWindow: {",
      "\n  },\n",
      // Methods sit at 4-space indent; bodies are deeper, so body calls like
      // `listener({ ... })` cannot be mistaken for method definitions.
      /^\s{4}(?:async\s+)?(\w+)\(/gm,
    );
    const typedMethods = extractMethodNames(
      readSource("src/types/electronBridge.ts"),
      "export interface AmeowCurrentWindowApi {",
      "\n}\n",
      /^\s{2}(\w+)\(/gm,
    );
    expect(preloadMethods).toEqual(typedMethods);
  });
});
