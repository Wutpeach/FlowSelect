#!/usr/bin/env python3
import argparse
import importlib
import json
import os
import site
import subprocess
import sys
import tempfile
from pathlib import Path

RESULT_PREFIX = "FLOWSELECT_PINTEREST_RESULT"
PROGRESS_PREFIX = "FLOWSELECT_PINTEREST_PROGRESS"
PINTEREST_DL_SITE_DIR = (
    Path(tempfile.gettempdir())
    / "flowselect_pinterest_runtime"
    / f"py{sys.version_info.major}{sys.version_info.minor}"
    / "site-packages"
)
PIP_PROXY_ENV_KEYS = (
    "ALL_PROXY",
    "all_proxy",
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "NO_PROXY",
    "no_proxy",
)


def import_pinterest_dl():
    from pinterest_dl.domain.media import PinterestMedia, VideoStreamInfo
    from pinterest_dl.download import USER_AGENT
    from pinterest_dl.download.downloader import MediaDownloader

    return PinterestMedia, VideoStreamInfo, USER_AGENT, MediaDownloader


def ensure_bootstrap_site_dir():
    PINTEREST_DL_SITE_DIR.mkdir(parents=True, exist_ok=True)
    site_dir = str(PINTEREST_DL_SITE_DIR)
    if site_dir not in sys.path:
        site.addsitedir(site_dir)
    importlib.invalidate_caches()


def build_pip_env():
    env = os.environ.copy()
    for key in PIP_PROXY_ENV_KEYS:
        env.pop(key, None)
    return env


def install_pinterest_dl():
    ensure_bootstrap_site_dir()
    print(
        f"Bootstrapping pinterest-dl into {PINTEREST_DL_SITE_DIR}",
        file=sys.stderr,
        flush=True,
    )
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--isolated",
            "--disable-pip-version-check",
            "-q",
            "--upgrade",
            "--target",
            str(PINTEREST_DL_SITE_DIR),
            "pinterest-dl",
        ],
        env=build_pip_env(),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return

    error_output = (result.stderr or result.stdout or "").strip()
    if not error_output:
        error_output = f"pip exited with code {result.returncode}"
    raise RuntimeError(
        "Failed to install pinterest-dl into "
        f"{PINTEREST_DL_SITE_DIR}: {error_output}"
    )


def ensure_pinterest_dl():
    ensure_bootstrap_site_dir()
    try:
        return import_pinterest_dl()
    except ImportError:
        install_pinterest_dl()
        return import_pinterest_dl()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-json", required=True)
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args()


def to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def main():
    args = parse_args()
    payload = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
    PinterestMedia, VideoStreamInfo, user_agent, MediaDownloader = ensure_pinterest_dl()

    image = payload.get("image") or {}
    video = payload.get("video") or {}
    pin_id = to_int(payload.get("pinId"))
    image_url = image.get("url") or video.get("posterUrl") or video.get("url") or ""
    video_url = video.get("url") if isinstance(video.get("url"), str) else None

    if pin_id <= 0:
        raise ValueError("Missing valid pinId")

    if not image_url:
        raise ValueError("Missing Pinterest image URL for runtime payload")

    video_stream = None
    if video_url:
        video_stream = VideoStreamInfo(
            url=video_url,
            resolution=(to_int(video.get("width")), to_int(video.get("height"))),
            duration=to_int(video.get("durationSeconds")),
        )

    media = PinterestMedia(
        id=pin_id,
        src=image_url,
        alt=payload.get("title"),
        origin=payload.get("origin"),
        resolution=(to_int(image.get("width")), to_int(image.get("height"))),
        video_stream=video_stream,
    )

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    downloader = MediaDownloader(user_agent=user_agent, timeout=20, max_retries=3)

    print(f"{PROGRESS_PREFIX}\t0\t1", flush=True)
    final_path = downloader.download(
        media,
        output_dir,
        download_streams=video_stream is not None,
        skip_remux=False,
    )
    print(f"{PROGRESS_PREFIX}\t1\t1", flush=True)
    print(f"{RESULT_PREFIX}\t{Path(final_path).resolve()}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover - runtime script
        print(str(exc), file=sys.stderr, flush=True)
        raise
