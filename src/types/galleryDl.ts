export type GalleryDlInfo = {
  current: string;
  source: "bundled" | "missing";
  path: string | null;
  updateChannel: "bundled_release" | "unavailable";
};
