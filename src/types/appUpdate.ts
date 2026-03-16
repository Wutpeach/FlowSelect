export type AppUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export type AppUpdateInfo = {
  current: string;
  latest: string;
  notes: string | null;
  publishedAt: string | null;
};
