import { desktopCommands, desktopEvents } from "../desktop/runtime";

type AppConfig = Record<string, unknown> & {
  outputPath?: string;
};

export async function saveOutputPath(nextOutputPath: string): Promise<boolean> {
  const configStr = await desktopCommands.invoke<string>("get_config");
  const config = JSON.parse(configStr) as AppConfig;
  const previousOutputPath =
    typeof config.outputPath === "string" ? config.outputPath : "";

  if (previousOutputPath === nextOutputPath) {
    return false;
  }

  config.outputPath = nextOutputPath;
  await desktopCommands.invoke<void>("save_config", { json: JSON.stringify(config) });
  await desktopEvents.emit("output-path-changed", { path: nextOutputPath });

  try {
    await desktopCommands.invoke<boolean>("reset_rename_counter");
  } catch (err) {
    console.error("Failed to reset rename counter after output path change:", err);
  }

  return true;
}
