import { downloadToFile } from "file:///D:/Ameow/.p2v-release-evidence/portable-repair-extracted/Ameow_portable/resources/app/dist-electron/electron/managedRuntimeBootstrap.mjs";

const output = "D:/Ameow/.trellis/tasks/08-25-managed-ytdlp-p2v-release-runtime-evidence/evidence/portable-package-timeout-probe.bin";
const uncaught = [];
const onUncaught = (error) => uncaught.push(error);
process.once("uncaughtException", onUncaught);
try {
  try {
    await downloadToFile("https://fixture.invalid/stall.zip", output, {
      configDir: "D:/Ameow/.p2v-release-evidence/portable-repair-profile/user-data",
      platform: "win32",
      arch: "x64",
      timeoutMs: 20,
      timeoutErrorMessage: "portable package timeout normalized",
      fetch: async (_url, init) => {
        let streamController;
        const body = new ReadableStream({
          start(controller) {
            streamController = controller;
            controller.enqueue(new TextEncoder().encode("partial"));
          },
        });
        init.signal.addEventListener("abort", () => {
          streamController.error(new Error("fixture stalled"));
        }, { once: true });
        return new Response(body, { headers: { "content-length": "8" } });
      },
    });
    throw new Error("expected timeout rejection");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "portable package timeout normalized") throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (uncaught.length > 0) throw uncaught[0];
  console.log("PACKAGED_TIMEOUT_PROBE normalized rejection with no uncaught stream error");
} finally {
  process.removeListener("uncaughtException", onUncaught);
}
