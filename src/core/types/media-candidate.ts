export type MediaCandidate = {
  url: string;
  type?: string;
  source?: string;
  confidence?: string;
  mediaType?: "video" | "image";
};
