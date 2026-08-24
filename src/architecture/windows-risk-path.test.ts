import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MR0 Windows risk path regression gates (Slice 6).
 *
 * Both observed Windows issues are independent correctness chains; replacing
 * Reveal/Progress visuals does NOT remove either chain. MR6 closes the two
 * risks at their existing authority boundaries, and these static gates pin the
 * repaired links so future changes remain deliberate and re-validated.
 *
 * Risk A (native argument conversion / compact reachability):
 *   src/App.tsx (presentationDependencies -> ensureMainWindowCompactReachable)
 *   -> src/desktop/runtime.ts (currentWindow passthrough)
 *   -> electron/preload.mts (ipcRenderer.invoke/send with the request object)
 *   -> electron/main.mts (ensure-compact-reachable / set-position handlers,
 *      Number() conversion with finite-coordinate guards)
 *   -> electron/mainWindowSurfacePolicy.mts (resolveCompactReachablePosition /
 *      interpolatePosition -> win.setPosition)
 *
 * Risk B (terminal window remains full):
 *   terminal event -> App.tsx onDownloadTerminal -> showForegroundTaskOutcome
 *   -> src/utils/centerOverlayState.ts (request-id/timer policy)
 *   -> App.tsx presentation locks (centerOutcome lock projection)
 *   -> lifecycle.ts setLock(false) -> collapsePending -> single-ack compact
 */

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const read = (relative: string): string =>
  readFileSync(path.join(repoRoot, relative), "utf8");

describe("MR0 Windows risk A: native argument conversion chain", () => {
  it("link 1: App projects the compact-reachability request with numeric arguments", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("ensureMainWindowCompactReachable(");
    expect(app).toContain("reachableFrameSize:");
    expect(app).toContain("edgePadding:");
    expect(app).toContain("requestEpoch,");
    // The request crosses the bridge as plain numeric data, not DOM/native refs.
    expect(app).toContain("getMainWindowCompactOuterSize(");
  });

  it("link 2: desktop runtime passes the request to the Electron bridge", () => {
    const runtime = read("src/desktop/runtime.ts");
    expect(runtime).toContain("currentWindow.ensureMainWindowCompactReachable(options)");
    expect(runtime).toContain("currentWindow.setPosition(position)");
    expect(runtime).toContain("currentWindow.setInteractionMode(mode)");
  });

  it("link 3: preload crosses the IPC boundary with the request object", () => {
    const preload = read("electron/preload.mts");
    expect(preload).toContain(
      'invoke("ameow:current-window:ensure-compact-reachable", options)',
    );
    expect(preload).toContain(
      'ipcRenderer.send("ameow:current-window:set-position", position)',
    );
    expect(preload).toContain(
      'ipcRenderer.send("ameow:current-window:set-interaction-mode", { mode })',
    );
  });

  it("link 4: Main rejects non-finite coordinates before rounding and native writes", () => {
    const main = read("electron/main.mts");
    expect(main).toContain('"ameow:current-window:ensure-compact-reachable"');
    expect(main).toContain('"ameow:current-window:set-position"');
    const manualPosition = read("electron/mainWindowManualPosition.mts");
    expect(main).toContain("resolveMainWindowManualPosition(payload)");
    expect(manualPosition).toContain("Number(payload?.x)");
    expect(manualPosition).toContain("Number.isFinite(x)");
    expect(manualPosition).toContain("Number.isFinite(y)");
    expect(manualPosition).toContain("Math.round(x)");
    expect(manualPosition).toContain("Math.round(y)");
    const handler = main.slice(
      main.indexOf('ipcMain.on("ameow:current-window:set-position"'),
      main.indexOf('ipcMain.on("ameow:current-window:set-interaction-mode"'),
    );
    expect(handler).toContain("if (!position)");
    expect(handler.match(/win\.setPosition\(/g)).toHaveLength(1);
    expect(main).toContain("Number(request?.reachableFrameSize)");
    expect(main).toContain("Number.isFinite(reachableFrameSize)");
    expect(main).toContain('"ameow:current-window:set-interaction-mode"');
  });

  it("link 5: native policy owns position-only compact reachability", () => {
    const policy = read("electron/mainWindowSurfacePolicy.mts");
    expect(policy).toContain("resolveCompactReachablePosition");
    expect(policy).toContain("interpolatePosition");
    expect(policy).toContain("win.setPosition(");
    expect(policy).toContain("ensureMainWindowCompactReachable");
    // Position-only: the policy never resizes the window.
    expect(policy).not.toContain("win.setSize(");
    expect(policy).not.toContain("win.setBounds(");
  });

  it("documents the repair dependency: no visual replacement claim exists in MR0 artifacts", () => {
    // The chain is renderer-bridge-native and independent of M3 visuals; the
    // gate keeps it reachable until an approved repair changes these exact
    // paths. Asserting presence is the gate — absence would require a review.
    expect(
      read("src/App.tsx") + read("src/desktop/runtime.ts")
      + read("electron/preload.mts") + read("electron/main.mts")
      + read("electron/mainWindowSurfacePolicy.mts"),
    ).toMatch(/ensureMainWindowCompactReachable/);
  });
});

describe("MR0 Windows risk B: terminal-not-compact chain", () => {
  it("link 1: terminal event dispatches into a bounded outcome independent of renderer frames", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("onDownloadTerminal(");
    expect(app).toContain("showForegroundTaskOutcome(");
    expect(app).toContain("durationMs:");
    expect(app).toContain("beginTaskOutcomeLoading");

    const outcomePolicy = app.slice(
      app.indexOf("const showForegroundTaskOutcome"),
      app.indexOf("const showFolderDropOutcome"),
    );
    expect(outcomePolicy).toContain("prepareMainWindowForForegroundTask()");
    expect(outcomePolicy).toContain('type: "showTaskOutcome"');
    expect(outcomePolicy).toContain("window.setTimeout");
    expect(outcomePolicy).toContain('type: "finishTaskOutcome"');
    expect(outcomePolicy).not.toContain("requestAnimationFrame");
    expect(outcomePolicy.indexOf('type: "showTaskOutcome"'))
      .toBeLessThan(outcomePolicy.indexOf("window.setTimeout"));

    const terminalPolicy = app.slice(
      app.indexOf("useEffect(() => onDownloadTerminal"),
      app.indexOf("// Listen for output path changes"),
    );
    expect(terminalPolicy).toContain("selectPrimaryDownloadTask(postReductionState)");
    expect(terminalPolicy.match(/durationMs: 1500/g)).toHaveLength(2);
    expect(terminalPolicy.match(/durationMs: 5000/g)).toHaveLength(1);
    expect(terminalPolicy.match(/origin: "terminal"/g)).toHaveLength(3);
  });

  it("link 2: center overlay owns request-id/timer policy for the hold", () => {
    const overlay = read("src/utils/centerOverlayState.ts");
    expect(overlay).toContain("requestId");
    expect(overlay).toContain("finishTaskOutcome");
    expect(overlay).toContain("beginTaskOutcomeLoading");
    expect(overlay).toContain("dismissTransient");
  });

  it("link 3: App projects the centerOutcome lifecycle lock from overlay policy state", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("centerOutcome: centerOverlayLockActive");
    expect(app).toContain("isCenterOverlayLockActive(");
  });

  it("link 4: lifecycle lock release feeds the normal collapse path", () => {
    const lifecycle = read("src/presentation/main-window/lifecycle.ts");
    expect(lifecycle).toContain('{ type: "setLock"; lock: MainWindowPresentationLock; active: boolean }');
    expect(lifecycle).toContain("beginCollapseDelay");
    expect(lifecycle).toContain("collapsePending");
    expect(lifecycle).toContain("visualTransitionCompleted");
    // Compact is entered only by the matching collapse completion; the
    // non-full branch of the same event settles compact + passthrough.
    expect(lifecycle).toContain('event.target === "full"');
    expect(lifecycle).toContain('mode: "compact-passthrough"');
  });

  it("records MR6 closure at the existing boundaries, not as a visual replacement claim", () => {
    const plan = read(".trellis/spec/frontend/motion-guidelines.md")
      + read(".trellis/spec/frontend/state-management.md");
    expect(plan).toContain("Windows correctness closures (MR6");
    expect(plan).toContain("independent repairs");
    expect(plan).toContain("rejects every");
    expect(plan).toContain("non-finite converted coordinate");
    expect(plan).toContain("without waiting for renderer frames");
    expect(plan).not.toMatch(/visual replacement.{0,60}(fixed|solved|resolved)/i);
  });
});
