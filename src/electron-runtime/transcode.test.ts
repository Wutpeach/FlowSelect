import { describe, expect, it } from "vitest";
import {
  parseFfmpegProbeSummaryOutput,
  summarizeMediaProbe,
} from "./transcode.js";

describe("electron transcode helpers", () => {
  it("detects AE-safe mp4 h264+aac sources", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/sample.mp4",
      [
        "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:/Temp/sample.mp4':",
        "  Duration: 00:00:10.00, start: 0.000000, bitrate: 612 kb/s",
        "  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080",
        "  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: true,
      plan: null,
    });
  });

  it("uses remux-only when video is already h264/aac but the container is not mp4", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/archive.mkv",
      [
        "Input #0, matroska,webm, from 'C:/Temp/archive.mkv':",
        "  Duration: 00:02:15.50, start: 0.000000, bitrate: 712 kb/s",
        "  Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080",
        "  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: false,
      plan: "remux_only",
    });
  });

  it("uses full transcode when codecs are not AE-safe", () => {
    const summary = parseFfmpegProbeSummaryOutput(
      "C:/Temp/archive.webm",
      [
        "Input #0, matroska,webm, from 'C:/Temp/archive.webm':",
        "  Duration: 00:03:48.00, start: 0.000000, bitrate: 1120 kb/s",
        "  Stream #0:0: Video: vp9, yuv420p(progressive), 1920x1080",
        "  Stream #0:1: Audio: opus, 48000 Hz, stereo, fltp, 160 kb/s",
      ].join("\n"),
    );

    expect(summarizeMediaProbe(summary)).toEqual({
      isAeSafe: false,
      plan: "full_transcode",
    });
  });
});
