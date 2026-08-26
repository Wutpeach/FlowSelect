import { describe, expect, it, vi } from "vitest";
import {
  RuntimeSetBusyError,
  createRuntimeSetLifecycleCoordinator,
} from "./runtimeSetLifecycle.mjs";

describe("runtime set lifecycle", () => {
  it("does not mutate a leased runtime set and permits repair after settlement", async () => {
    const lifecycle = createRuntimeSetLifecycleCoordinator();
    const prepare = vi.fn(async () => undefined);
    const mutation = vi.fn(async () => "repaired");
    const lease = await lifecycle.acquireLease(["yt-dlp", "ffmpeg", "deno"], prepare);

    await expect(lifecycle.runMutation(mutation)).rejects.toBeInstanceOf(RuntimeSetBusyError);
    expect(mutation).not.toHaveBeenCalled();

    lease.release();
    await expect(lifecycle.runMutation(mutation)).resolves.toBe("repaired");
    expect(lifecycle.activeLeaseCount()).toBe(0);
  });

  it("shares one prepared set between same-capability consumers", async () => {
    const lifecycle = createRuntimeSetLifecycleCoordinator();
    const prepare = vi.fn(async () => undefined);

    const first = await lifecycle.acquireLease(["yt-dlp", "ffmpeg", "deno"], prepare);
    const second = await lifecycle.acquireLease(["yt-dlp", "ffmpeg", "deno"], prepare);

    expect(prepare).toHaveBeenCalledTimes(1);
    expect(lifecycle.activeLeaseCount()).toBe(2);
    first.release();
    await expect(lifecycle.runMutation(async () => undefined)).rejects.toBeInstanceOf(RuntimeSetBusyError);

    second.release();
    await expect(lifecycle.runMutation(async () => undefined)).resolves.toBeUndefined();
  });

  it("lets media tools join an active yt-dlp set without preparing FFmpeg again", async () => {
    const lifecycle = createRuntimeSetLifecycleCoordinator();
    const prepareYtDlp = vi.fn(async () => undefined);
    const prepareMediaTools = vi.fn(async () => undefined);
    const ytDlpLease = await lifecycle.acquireLease(["yt-dlp", "ffmpeg", "deno"], prepareYtDlp);
    const mediaToolsLease = await lifecycle.acquireLease(["ffmpeg"], prepareMediaTools);

    expect(prepareYtDlp).toHaveBeenCalledTimes(1);
    expect(prepareMediaTools).not.toHaveBeenCalled();

    ytDlpLease.release();
    mediaToolsLease.release();
  });

  it("prepares only yt-dlp and Deno when media tools already hold FFmpeg", async () => {
    const lifecycle = createRuntimeSetLifecycleCoordinator();
    const prepare = vi.fn(async () => undefined);
    const mediaToolsLease = await lifecycle.acquireLease(["ffmpeg"], prepare);
    const ytDlpLease = await lifecycle.acquireLease(["yt-dlp", "ffmpeg", "deno"], prepare);

    expect(prepare).toHaveBeenNthCalledWith(1, ["ffmpeg"]);
    expect(prepare).toHaveBeenNthCalledWith(2, ["yt-dlp", "deno"]);
    expect(lifecycle.activeLeaseCount()).toBe(2);

    ytDlpLease.release();
    mediaToolsLease.release();
  });

  it("prepares yt-dlp capabilities alongside an active gallery-dl lease", async () => {
    const lifecycle = createRuntimeSetLifecycleCoordinator();
    const prepare = vi.fn(async () => undefined);
    const galleryLease = await lifecycle.acquireLease(["gallery-dl"], prepare);
    const ytDlpLease = await lifecycle.acquireLease(["yt-dlp", "ffmpeg", "deno"], prepare);

    expect(prepare).toHaveBeenNthCalledWith(1, ["gallery-dl"]);
    expect(prepare).toHaveBeenNthCalledWith(2, ["yt-dlp", "ffmpeg", "deno"]);

    ytDlpLease.release();
    galleryLease.release();
  });
});
