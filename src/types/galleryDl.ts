export type GalleryDlInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean | null;
  latestError: string | null;
  source: "bundled" | "missing";
  path: string | null;
  updateChannel: "bundled_release" | "unavailable";
};
