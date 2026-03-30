export type GalleryDlInfo = {
  current: string;
  source: "bundled" | "system_path" | "missing";
  path: string | null;
  updateChannel: "bundled_release" | "system_path" | "unavailable";
};
