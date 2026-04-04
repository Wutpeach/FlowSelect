import { promises as fs } from "node:fs";
import path from "node:path";
import { runCapturedCommand, runStreamingCommand } from "./processRunner.js";
import { summarizeError } from "./runtimeUtils.js";

export type VideoTranscodeStage = "analyzing" | "transcoding" | "finalizing_mp4" | "failed";

export type PreparedVideoTranscodeTask = {
  traceId: string;
  label: string;
  sourcePath: string;
  sourceFormat: string | null;
  targetFormat: "mp4";
  plan: "remux_only" | "audio_transcode" | "full_transcode";
  durationSeconds: number | null;
  finalPath: string;
};

type MediaProbeStream = {
  codec_type?: string;
  codec_name?: string;
};

type MediaProbeFormat = {
  format_name?: string;
  duration?: string;
};

type MediaProbeResult = {
  streams?: MediaProbeStream[];
  format?: MediaProbeFormat;
};

type MediaProbeSummary = {
  containerNames: string[];
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
  durationSeconds: number | null;
};

type VideoTranscodeProgressUpdate = {
  stage: VideoTranscodeStage;
  progressPercent: number | null;
  etaSeconds: number | null;
};

const AE_SAFE_AUDIO_BITRATE = "320k";
const AE_SAFE_LIBX264_CRF = "18";

const parseClockTimeSeconds = (raw: string): number | null => {
  const parts = raw.trim().split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [hours, minutes, seconds] = parts.map((value) => Number.parseFloat(value.trim()));
  if (![hours, minutes, seconds].every((value) => Number.isFinite(value))) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
};

export const parseFfprobeDurationSeconds = (raw: string | undefined): number | null => {
  const value = raw == null ? Number.NaN : Number.parseFloat(raw.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
};

const parseFfmpegProbeDurationSeconds = (line: string): number | null => {
  const durationPart = line.trim().match(/^Duration:\s*([^,]+)/i)?.[1];
  return durationPart ? parseClockTimeSeconds(durationPart) : null;
};

export const parseFfmpegProgressOutTimeSeconds = (line: string): number | null => {
  const value = line.trim().match(/^out_time=(.+)$/)?.[1];
  return value ? parseClockTimeSeconds(value) : null;
};

export const parseFfmpegProgressSpeedRatio = (line: string): number | null => {
  const raw = line.trim().match(/^speed=(.+)$/)?.[1];
  if (!raw) {
    return null;
  }

  const value = Number.parseFloat(raw.replace(/x$/i, "").trim());
  return Number.isFinite(value) && value > 0 ? value : null;
};

const inferMediaFormatFromPath = (targetPath: string): string | null => {
  const extension = path.extname(targetPath).trim().replace(/^\./, "").toLowerCase();
  return extension.length > 0 ? extension : null;
};

export const summarizeMediaProbe = (summary: MediaProbeSummary): {
  isAeSafe: boolean;
  plan: PreparedVideoTranscodeTask["plan"] | null;
} => {
  const isMp4Container = summary.containerNames.includes("mp4");
  const isAeSafe = isMp4Container
    && summary.videoCodec === "h264"
    && (!summary.hasAudioStream || summary.audioCodec === "aac");

  if (isAeSafe) {
    return {
      isAeSafe: true,
      plan: null,
    };
  }

  if (summary.videoCodec === "h264") {
    return {
      isAeSafe: false,
      plan: summary.hasAudioStream && summary.audioCodec !== "aac"
        ? "audio_transcode"
        : "remux_only",
    };
  }

  return {
    isAeSafe: false,
    plan: "full_transcode",
  };
};

export const parseFfmpegProbeSummaryOutput = (
  targetPath: string,
  stderr: string,
): MediaProbeSummary => {
  const summary: MediaProbeSummary = {
    containerNames: [],
    hasVideoStream: false,
    hasAudioStream: false,
    videoCodec: null,
    audioCodec: null,
    durationSeconds: null,
  };

  for (const rawLine of stderr.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (summary.containerNames.length === 0) {
      const containerMatch = line.match(/^Input #\d+,\s*([^,]+(?:,[^,]+)*),\s*from\s+/i);
      if (containerMatch) {
        summary.containerNames = containerMatch[1]
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        continue;
      }
    }

    if (summary.durationSeconds == null) {
      summary.durationSeconds = parseFfmpegProbeDurationSeconds(line);
    }

    if (!summary.videoCodec && line.includes("Video:")) {
      summary.hasVideoStream = true;
      const codec = line.split("Video:")[1]
        ?.trim()
        .split(/[,\s]+/)[0]
        ?.trim()
        .toLowerCase();
      summary.videoCodec = codec || null;
      continue;
    }

    if (!summary.audioCodec && line.includes("Audio:")) {
      summary.hasAudioStream = true;
      const codec = line.split("Audio:")[1]
        ?.trim()
        .split(/[,\s]+/)[0]
        ?.trim()
        .toLowerCase();
      summary.audioCodec = codec || null;
    }
  }

  if (summary.containerNames.length === 0 && !summary.videoCodec && !summary.audioCodec) {
    const failure = stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?? "ffmpeg probe produced no recognizable metadata";
    throw new Error(`ffmpeg probe failed for ${targetPath}: ${failure}`);
  }

  return summary;
};

const probeMediaSummaryWithFfprobe = async (
  ffprobePath: string,
  targetPath: string,
  signal?: AbortSignal,
): Promise<MediaProbeSummary> => {
  const result = await runCapturedCommand(ffprobePath, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_entries",
    "format=format_name,duration:stream=codec_type,codec_name",
    targetPath,
  ], {
    signal,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `ffprobe failed for ${targetPath}: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
    );
  }

  const parsed = JSON.parse(result.stdout) as MediaProbeResult;
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const formatNames = parsed.format?.format_name
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    ?? [];

  return {
    containerNames: formatNames,
    hasVideoStream: Boolean(videoStream),
    hasAudioStream: Boolean(audioStream),
    videoCodec: videoStream?.codec_name?.trim().toLowerCase() || null,
    audioCodec: audioStream?.codec_name?.trim().toLowerCase() || null,
    durationSeconds: parseFfprobeDurationSeconds(parsed.format?.duration),
  };
};

const probeMediaSummary = async (
  ffprobePath: string,
  ffmpegPath: string,
  targetPath: string,
  signal?: AbortSignal,
): Promise<MediaProbeSummary> => {
  try {
    return await probeMediaSummaryWithFfprobe(ffprobePath, targetPath, signal);
  } catch (ffprobeError) {
    const fallback = await runCapturedCommand(ffmpegPath, [
      "-hide_banner",
      "-i",
      targetPath,
    ], {
      signal,
    });
    try {
      return parseFfmpegProbeSummaryOutput(targetPath, fallback.stderr);
    } catch (ffmpegError) {
      throw new Error(
        `${summarizeError(ffmpegError)} (ffprobe unavailable: ${summarizeError(ffprobeError)})`,
      );
    }
  }
};

const siblingPathWithSuffix = (
  targetPath: string,
  suffix: string,
  extension: string,
): string => {
  const parsed = path.parse(targetPath);
  return path.join(parsed.dir, `${parsed.name}.${suffix}${extension}`);
};

const resolveTempOutputPath = (task: PreparedVideoTranscodeTask): string => {
  const basePath = task.finalPath === task.sourcePath ? task.sourcePath : task.finalPath;
  return siblingPathWithSuffix(basePath, "flowselect-transcode", ".mp4");
};

const replaceFile = async (targetPath: string, sourcePath: string): Promise<void> => {
  await fs.unlink(targetPath).catch(() => undefined);
  await fs.rename(sourcePath, targetPath);
};

const resolveProgressStage = (
  plan: PreparedVideoTranscodeTask["plan"],
): VideoTranscodeStage => (
  plan === "remux_only" ? "finalizing_mp4" : "transcoding"
);

const buildFfmpegArgs = (
  task: PreparedVideoTranscodeTask,
  outputPath: string,
): string[] => {
  const baseArgs = [
    "-y",
    "-progress",
    "pipe:1",
    "-nostats",
    "-i",
    task.sourcePath,
    "-map",
    "0:v?",
    "-map",
    "0:a?",
    "-dn",
  ];

  switch (task.plan) {
    case "remux_only":
      return [
        ...baseArgs,
        "-c:v",
        "copy",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        outputPath,
      ];
    case "audio_transcode":
      return [
        ...baseArgs,
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        AE_SAFE_AUDIO_BITRATE,
        "-movflags",
        "+faststart",
        outputPath,
      ];
    case "full_transcode":
    default:
      return [
        ...baseArgs,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        AE_SAFE_LIBX264_CRF,
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        AE_SAFE_AUDIO_BITRATE,
        "-movflags",
        "+faststart",
        outputPath,
      ];
  }
};

export const prepareVideoTranscodeTaskFromDownload = async (
  input: {
    traceId: string;
    label: string;
    sourcePath: string;
    ffprobePath: string;
    ffmpegPath: string;
    signal?: AbortSignal;
  },
): Promise<PreparedVideoTranscodeTask | null> => {
  await fs.access(input.sourcePath);

  let sourceFormat = inferMediaFormatFromPath(input.sourcePath);
  let durationSeconds: number | null = null;
  let plan: PreparedVideoTranscodeTask["plan"] = "full_transcode";

  try {
    const summary = await probeMediaSummary(
      input.ffprobePath,
      input.ffmpegPath,
      input.sourcePath,
      input.signal,
    );
    durationSeconds = summary.durationSeconds;
    if (!sourceFormat) {
      sourceFormat = summary.containerNames[0] ?? null;
    }
    const next = summarizeMediaProbe(summary);
    if (next.isAeSafe || !next.plan) {
      return null;
    }
    plan = next.plan;
  } catch {
    // Keep the conservative full-transcode fallback when the probe is unavailable.
  }

  const parsed = path.parse(input.sourcePath);
  return {
    traceId: input.traceId,
    label: input.label,
    sourcePath: input.sourcePath,
    sourceFormat,
    targetFormat: "mp4",
    plan,
    durationSeconds,
    finalPath: path.join(parsed.dir, `${parsed.name}.mp4`),
  };
};

export const runPreparedVideoTranscodeTask = async (
  task: PreparedVideoTranscodeTask,
  input: {
    ffmpegPath: string;
    signal?: AbortSignal;
    onProgress?(progress: VideoTranscodeProgressUpdate): void | Promise<void>;
  },
): Promise<{ filePath: string }> => {
  const tempOutputPath = resolveTempOutputPath(task);
  const stage = resolveProgressStage(task.plan);
  const stderrLines: string[] = [];
  let latestOutTimeSeconds: number | null = null;
  let latestSpeedRatio: number | null = null;

  try {
    await input.onProgress?.({
      stage,
      progressPercent: null,
      etaSeconds: null,
    });

    const exitCode = await runStreamingCommand(
      input.ffmpegPath,
      buildFfmpegArgs(task, tempOutputPath),
      {
        signal: input.signal,
        onStdoutLine: async (line) => {
          const outTimeSeconds = parseFfmpegProgressOutTimeSeconds(line);
          if (outTimeSeconds != null) {
            latestOutTimeSeconds = outTimeSeconds;
          }

          const speedRatio = parseFfmpegProgressSpeedRatio(line);
          if (speedRatio != null) {
            latestSpeedRatio = speedRatio;
          }

          if (outTimeSeconds == null && speedRatio == null) {
            return;
          }

          const progressPercent = task.durationSeconds && latestOutTimeSeconds != null
            ? Math.max(0, Math.min(100, (latestOutTimeSeconds / task.durationSeconds) * 100))
            : null;
          const etaSeconds = task.durationSeconds && latestOutTimeSeconds != null && latestSpeedRatio
            ? Math.max(
              0,
              Math.round((task.durationSeconds - latestOutTimeSeconds) / latestSpeedRatio),
            )
            : null;

          await input.onProgress?.({
            stage,
            progressPercent,
            etaSeconds,
          });
        },
        onStderrLine: async (line) => {
          if (line.trim()) {
            stderrLines.push(line.trim());
          }
        },
      },
    );

    if (input.signal?.aborted) {
      throw new Error("Transcode cancelled");
    }
    if (exitCode !== 0) {
      throw new Error(stderrLines[stderrLines.length - 1] ?? `ffmpeg exited with code ${exitCode}`);
    }

    if (task.finalPath === task.sourcePath) {
      await replaceFile(task.sourcePath, tempOutputPath);
    } else {
      await replaceFile(task.finalPath, tempOutputPath);
      await fs.unlink(task.sourcePath).catch(() => undefined);
    }

    return {
      filePath: task.finalPath,
    };
  } catch (error) {
    await fs.unlink(tempOutputPath).catch(() => undefined);
    throw new Error(summarizeError(error));
  }
};
