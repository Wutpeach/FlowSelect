from __future__ import annotations

import argparse
import dataclasses
import json
import re
import sys
import types
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin

from progress import emit_progress, emit_result, emit_stage
from version import load_lock, sidecar_version

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/133.0.0.0 Safari/537.36"
)

EXIT_SUCCESS = 0
EXIT_NO_VIDEO = 10
EXIT_INVALID_PAYLOAD = 11
EXIT_DOWNLOAD_FAILED = 12
EXIT_CANCELLED = 13


@dataclasses.dataclass(frozen=True)
class Asset:
    url: str
    width: int = 0
    height: int = 0
    duration_seconds: int = 0


@dataclasses.dataclass(frozen=True)
class RuntimePayload:
    trace_id: str
    page_url: str
    pin_id: int
    title: str
    origin: str
    cookies_header: Optional[str]
    image: Asset
    video: Optional[Asset]
    output_dir: Path


class SidecarError(Exception):
    def __init__(self, message: str, exit_code: int) -> None:
        super().__init__(message)
        self.exit_code = exit_code


class RequestsM3u8HttpClient:
    def __init__(self, session: Any) -> None:
        self.session = session

    def download(
        self,
        uri: str,
        timeout: Optional[float] = None,
        headers: Optional[dict[str, str]] = None,
        verify_ssl: bool = True,
    ) -> tuple[str, str]:
        merged_headers = dict(self.session.headers)
        if headers:
            merged_headers.update(headers)

        response = self.session.get(
            uri,
            timeout=timeout,
            headers=merged_headers,
            verify=verify_ssl,
        )
        response.raise_for_status()
        return response.text, urljoin(str(response.url), ".")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-json")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--version", action="store_true")
    return parser.parse_args()


def read_payload(input_json: Optional[str]) -> RuntimePayload:
    if not input_json:
        raise SidecarError("Missing --input-json", EXIT_INVALID_PAYLOAD)

    path = Path(input_json)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SidecarError(f"Input payload not found: {path}", EXIT_INVALID_PAYLOAD) from exc
    except json.JSONDecodeError as exc:
        raise SidecarError(f"Input payload is not valid JSON: {exc}", EXIT_INVALID_PAYLOAD) from exc

    return parse_payload(raw)


def parse_payload(raw: dict[str, Any]) -> RuntimePayload:
    pin_id_raw = raw.get("pinId")
    try:
        pin_id = int(pin_id_raw)
    except (TypeError, ValueError) as exc:
        raise SidecarError("Payload pinId must be an integer", EXIT_INVALID_PAYLOAD) from exc

    page_url = expect_non_empty_string(raw.get("pageUrl"), "pageUrl")
    output_dir = Path(expect_non_empty_string(raw.get("outputDir"), "outputDir"))

    image = parse_asset(raw.get("image"), "image", require_url=True)
    video = parse_asset(raw.get("video"), "video", require_url=False)

    return RuntimePayload(
        trace_id=optional_string(raw.get("traceId")) or "",
        page_url=page_url,
        pin_id=pin_id,
        title=optional_string(raw.get("title")) or "",
        origin=optional_string(raw.get("origin")) or page_url,
        cookies_header=optional_string(raw.get("cookiesHeader")),
        image=image,
        video=video,
        output_dir=output_dir,
    )


def parse_asset(raw: Any, field_name: str, require_url: bool) -> Optional[Asset]:
    if raw is None:
        if require_url:
            raise SidecarError(f"Payload {field_name} is required", EXIT_INVALID_PAYLOAD)
        return None

    if not isinstance(raw, dict):
        raise SidecarError(f"Payload {field_name} must be an object", EXIT_INVALID_PAYLOAD)

    url = optional_string(raw.get("url"))
    if require_url and not url:
        raise SidecarError(f"Payload {field_name}.url is required", EXIT_INVALID_PAYLOAD)
    if not url:
        return None

    return Asset(
        url=url,
        width=to_int(raw.get("width")),
        height=to_int(raw.get("height")),
        duration_seconds=to_int(raw.get("durationSeconds")),
    )


def expect_non_empty_string(value: Any, field_name: str) -> str:
    resolved = optional_string(value)
    if not resolved:
        raise SidecarError(f"Payload {field_name} must be a non-empty string", EXIT_INVALID_PAYLOAD)
    return resolved


def optional_string(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def to_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def configure_downloader_headers(downloader: Any, payload: RuntimePayload) -> None:
    session = downloader.http_client.session
    session.trust_env = True
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Referer": payload.origin,
        }
    )
    if payload.cookies_header:
        session.headers["Cookie"] = payload.cookies_header


def install_hls_hooks(downloader: Any) -> None:
    try:
        import m3u8
    except ImportError as exc:
        raise SidecarError(
            "m3u8 is not installed in the runtime environment",
            EXIT_DOWNLOAD_FAILED,
        ) from exc

    hls_processor = downloader.http_client.hls_processor
    session = downloader.http_client.session
    http_client = RequestsM3u8HttpClient(session)
    progress_state = {
        "done": 0,
        "total": 0,
        "last_bucket": -1,
    }

    original_fetch_playlist = hls_processor.fetch_playlist
    original_enumerate_segments = hls_processor.enumerate_segments
    original_download_segment = hls_processor.download_segment

    def emit_hls_progress() -> None:
        total = progress_state["total"]
        done = progress_state["done"]
        if total <= 0:
            return

        bucket = int((done / total) * 100)
        if bucket == progress_state["last_bucket"] and done < total:
            return

        progress_state["last_bucket"] = bucket
        emit_progress(done, total)

    def fetch_playlist_with_session(self: Any, url: str) -> Any:
        if not url.startswith("http"):
            return original_fetch_playlist(url)
        return m3u8.load(
            url,
            timeout=self.timeout,
            headers=dict(session.headers),
            http_client=http_client,
            verify_ssl=True,
        )

    def enumerate_segments_with_progress(self: Any, playlist: Any, base_uri: str) -> Any:
        segments = original_enumerate_segments(playlist, base_uri)
        progress_state["done"] = 0
        progress_state["total"] = len(segments)
        progress_state["last_bucket"] = -1
        emit_hls_progress()
        return segments

    def download_segment_with_progress(self: Any, url: str) -> bytes:
        segment = original_download_segment(url)
        if progress_state["total"] > 0:
            progress_state["done"] += 1
            emit_hls_progress()
        return segment

    hls_processor.fetch_playlist = types.MethodType(fetch_playlist_with_session, hls_processor)
    hls_processor.enumerate_segments = types.MethodType(
        enumerate_segments_with_progress,
        hls_processor,
    )
    hls_processor.download_segment = types.MethodType(
        download_segment_with_progress,
        hls_processor,
    )


def iter_video_url_candidates(video_url: str) -> list[str]:
    candidates: list[str] = []

    def push(url: Optional[str]) -> None:
        if not url or url in candidates:
            return
        candidates.append(url)

    push(video_url)
    if re.search(r"\.cmfv(?:$|[?#])", video_url, flags=re.IGNORECASE):
        push(re.sub(r"\.cmfv(?=($|[?#]))", ".m3u8", video_url, flags=re.IGNORECASE))

    return candidates


def build_media(payload: RuntimePayload, video_url_override: Optional[str] = None) -> Any:
    try:
        from pinterest_dl.domain.media import PinterestMedia, VideoStreamInfo
    except ImportError as exc:
        raise SidecarError(
            "pinterest-dl is not installed in the runtime environment",
            EXIT_DOWNLOAD_FAILED,
        ) from exc

    video_stream = None
    resolved_video_url = video_url_override or (payload.video.url if payload.video else None)
    if payload.video and resolved_video_url:
        video_stream = VideoStreamInfo(
            url=resolved_video_url,
            resolution=(payload.video.width, payload.video.height),
            duration=payload.video.duration_seconds,
        )

    return PinterestMedia(
        id=payload.pin_id,
        src=payload.image.url,
        alt=payload.title or None,
        origin=payload.origin,
        resolution=(payload.image.width, payload.image.height),
        video_stream=video_stream,
    )


def build_downloader(progress_callback: Any) -> Any:
    try:
        from pinterest_dl.download.downloader import MediaDownloader
    except ImportError as exc:
        raise SidecarError(
            "pinterest-dl is not installed in the runtime environment",
            EXIT_DOWNLOAD_FAILED,
        ) from exc

    return MediaDownloader(
        user_agent=USER_AGENT,
        timeout=20,
        max_retries=3,
        progress_callback=progress_callback,
    )


def run_self_test(payload: RuntimePayload) -> Path:
    emit_stage("preparing")
    payload.output_dir.mkdir(parents=True, exist_ok=True)

    test_path = payload.output_dir / f"{payload.pin_id}-sidecar-self-test.txt"
    test_path.write_text(
        json.dumps(
            {
                "traceId": payload.trace_id,
                "pinId": payload.pin_id,
                "pageUrl": payload.page_url,
                "origin": payload.origin,
                "upstream": load_lock()["upstream"],
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )

    emit_stage("downloading")
    emit_progress(0, 1)
    emit_progress(1, 1)
    emit_stage("completed")
    return test_path.resolve()


def run_download(payload: RuntimePayload) -> Path:
    if not payload.video or not payload.video.url:
        raise SidecarError(
            "Pinterest payload does not contain a downloadable video stream",
            EXIT_NO_VIDEO,
        )

    emit_stage("preparing")
    payload.output_dir.mkdir(parents=True, exist_ok=True)

    emit_stage("downloading")
    emit_progress(0, 1)

    last_error: Optional[Exception] = None
    video_urls = iter_video_url_candidates(payload.video.url)
    for index, video_url in enumerate(video_urls):
        downloader = build_downloader(progress_callback=emit_progress)
        configure_downloader_headers(downloader, payload)
        install_hls_hooks(downloader)
        media = build_media(payload, video_url_override=video_url)

        try:
            final_path = downloader.download(
                media,
                payload.output_dir,
                download_streams=True,
                skip_remux=False,
            )
            emit_progress(1, 1)
            emit_stage("completed")
            return Path(final_path).resolve()
        except KeyboardInterrupt as exc:
            raise SidecarError("Pinterest sidecar download cancelled", EXIT_CANCELLED) from exc
        except Exception as exc:
            last_error = exc
            if index + 1 < len(video_urls):
                print(
                    "Pinterest sidecar retrying with normalized manifest URL",
                    file=sys.stderr,
                    flush=True,
                )
                continue
            raise SidecarError(
                f"Pinterest sidecar download failed: {exc}",
                EXIT_DOWNLOAD_FAILED,
            ) from exc

    raise SidecarError(
        f"Pinterest sidecar download failed: {last_error or 'unknown error'}",
        EXIT_DOWNLOAD_FAILED,
    )


def main() -> int:
    args = parse_args()

    if args.version:
        print(sidecar_version(), flush=True)
        return EXIT_SUCCESS

    payload = read_payload(args.input_json)
    final_path = run_self_test(payload) if args.self_test else run_download(payload)
    emit_result(str(final_path))
    return EXIT_SUCCESS


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SidecarError as exc:
        print(str(exc), file=sys.stderr, flush=True)
        sys.exit(exc.exit_code)
