import { invoke } from "../runtime/core";
import { emit } from "../runtime/event";

type AppConfig = Record<string, unknown> & {
  outputPath?: string;
};

export async function saveOutputPath(nextOutputPath: string): Promise<boolean> {
  const configStr = await invoke<string>("get_config");
  const config = JSON.parse(configStr) as AppConfig;
  const previousOutputPath =
    typeof config.outputPath === "string" ? config.outputPath : "";

  if (previousOutputPath === nextOutputPath) {
    return false;
  }

  config.outputPath = nextOutputPath;
  await invoke<void>("save_config", { json: JSON.stringify(config) });
  await emit("output-path-changed", { path: nextOutputPath });

  try {
    await invoke<boolean>("reset_rename_counter");
  } catch (err) {
    console.error("Failed to reset rename counter after output path change:", err);
  }

  return true;
}
