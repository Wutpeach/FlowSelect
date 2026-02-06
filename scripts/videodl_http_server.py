"""
videodl HTTP Server for FlowSelect integration.

Provides REST API + SSE for video parsing and downloading.
Usage: python http_server.py [--port 18901]
"""
import os
import sys
import json
import asyncio
import threading
import queue
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
import requests

# Import videodl
from videodl.videodl import VideoClient


app = FastAPI(title="videodl HTTP Server", version="1.0.0")

# CDN direct link patterns (skip parsing, download directly)
CDN_PATTERNS = [
    "douyinvod.com",
    "douyincdn.com",
    "bytedance.com",
    "bytecdn.cn",
]

def is_cdn_direct_link(url: str) -> bool:
    """Check if URL is a CDN direct link that can be downloaded directly."""
    return any(pattern in url for pattern in CDN_PATTERNS)

# Global VideoClient instance (lazy init)
_video_client: Optional[VideoClient] = None
_video_client_lock = threading.Lock()


def get_video_client(work_dir: str = None) -> VideoClient:
    """Get or create VideoClient instance."""
    global _video_client
    with _video_client_lock:
        if _video_client is None:
            cfg = {}
            if work_dir:
                # Set work_dir for all clients
                for key in ['BilibiliVideoClient', 'DouyinVideoClient', 'KuaishouVideoClient',
                           'XiaohongshuVideoClient', 'WeiboVideoClient', 'AcFunVideoClient']:
                    cfg[key] = {'work_dir': work_dir}
            _video_client = VideoClient(init_video_clients_cfg=cfg)
        return _video_client


class ParseRequest(BaseModel):
    url: str
    work_dir: Optional[str] = None


class DownloadRequest(BaseModel):
    url: str
    work_dir: Optional[str] = None


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "videodl"}


@app.post("/parse")
async def parse_url(request: ParseRequest):
    """Parse video URL and return video info."""
    try:
        client = get_video_client(request.work_dir)
        video_infos = client.parsefromurl(request.url)

        # Convert to serializable format
        result = []
        for info in (video_infos or []):
            result.append({
                "title": info.get("title", ""),
                "download_url": info.get("download_url", ""),
                "source": info.get("source", ""),
                "ext": info.get("ext", "mp4"),
                "filesize": info.get("filesize", 0),
            })

        return {"success": True, "video_infos": result}
    except Exception as e:
        return {"success": False, "error": str(e), "video_infos": []}


@app.get("/download_stream")
async def download_stream(
    url: str = Query(..., description="Video URL to download"),
    work_dir: str = Query(None, description="Output directory"),
    title: str = Query(None, description="Video title"),
):
    """
    Stream download with SSE progress updates.
    Returns NDJSON stream with progress events.
    """
    # Resolve download directory - use absolute path
    if work_dir and work_dir.strip():
        download_dir = Path(work_dir).resolve()
    else:
        download_dir = Path.cwd() / "videodl_outputs"

    print(f"[videodl] Download dir: {download_dir}")

    async def event_generator():
        try:
            # Send start event
            yield json.dumps({"status": "start", "url": url, "work_dir": str(download_dir)}) + "\n"

            # Check if URL is a CDN direct link
            if is_cdn_direct_link(url):
                print(f"[videodl] CDN direct link detected, skipping parse")
                yield json.dumps({"status": "parsing", "note": "CDN direct link"}) + "\n"

                # Use provided title or extract video ID from URL
                video_title = title
                if not video_title:
                    video_id = "video"
                    if "__vid=" in url:
                        video_id = url.split("__vid=")[1].split("&")[0][:20]
                    video_title = f"douyin_{video_id}"

                video_info = {
                    "title": video_title,
                    "download_url": url,
                    "ext": "mp4",
                    "source": "CDN_Direct",
                }
            else:
                client = get_video_client(str(download_dir))

                # Parse URL first
                yield json.dumps({"status": "parsing"}) + "\n"
                video_infos = client.parsefromurl(url)

                if not video_infos:
                    yield json.dumps({"status": "error", "message": "No video found"}) + "\n"
                    return

                # Get first valid video info
                video_info = None
                for info in video_infos:
                    if info.get("download_url") and info.get("download_url") != "NULL":
                        video_info = info
                        break

                if not video_info:
                    yield json.dumps({"status": "error", "message": "No downloadable video found"}) + "\n"
                    return

            if not video_info:
                yield json.dumps({"status": "error", "message": "No downloadable video found"}) + "\n"
                return

            yield json.dumps({
                "status": "parsed",
                "title": video_info.get("title", ""),
                "source": video_info.get("source", ""),
            }) + "\n"

            # Download with progress tracking
            yield json.dumps({"status": "downloading", "percent": 0}) + "\n"

            # Ensure download directory exists
            download_dir.mkdir(parents=True, exist_ok=True)

            file_title = video_info.get("title", "video")
            ext = video_info.get("ext", "mp4")
            download_url = video_info.get("download_url", "")

            # Clean filename
            safe_title = "".join(c for c in file_title if c not in r'\/:*?"<>|')[:80]
            if not safe_title:
                safe_title = "video"
            output_path = download_dir / f"{safe_title}.{ext}"

            # Download headers
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": url,
            }

            # Download file with progress - use janus for thread-safe async queue
            import janus
            progress_queue = janus.Queue()

            def do_download():
                try:
                    resp = requests.get(download_url, headers=headers, stream=True, timeout=300)
                    resp.raise_for_status()
                    total = int(resp.headers.get('content-length', 0))
                    downloaded = 0
                    last_percent = 0
                    with open(output_path, 'wb') as f:
                        for chunk in resp.iter_content(chunk_size=65536):
                            if chunk:
                                f.write(chunk)
                                downloaded += len(chunk)
                                if total > 0:
                                    percent = int(downloaded * 100 / total)
                                    if percent > last_percent:
                                        progress_queue.sync_q.put({"type": "progress", "percent": percent})
                                        last_percent = percent
                    progress_queue.sync_q.put({"type": "complete", "path": str(output_path)})
                except Exception as e:
                    progress_queue.sync_q.put({"type": "error", "message": str(e)})

            # Start download in thread
            download_thread = threading.Thread(target=do_download)
            download_thread.start()

            # Stream progress events using async queue
            while True:
                try:
                    # Use asyncio.wait_for with async queue for non-blocking
                    msg = await asyncio.wait_for(progress_queue.async_q.get(), timeout=0.5)
                    if msg["type"] == "progress":
                        yield json.dumps({"status": "downloading", "percent": msg["percent"]}) + "\n"
                    elif msg["type"] == "complete":
                        yield json.dumps({
                            "status": "complete",
                            "percent": 100,
                            "file_path": msg["path"],
                            "title": file_title,
                        }) + "\n"
                        progress_queue.close()
                        await progress_queue.wait_closed()
                        break
                    elif msg["type"] == "error":
                        yield json.dumps({"status": "error", "message": msg["message"]}) + "\n"
                        progress_queue.close()
                        await progress_queue.wait_closed()
                        break
                except asyncio.TimeoutError:
                    if not download_thread.is_alive():
                        progress_queue.close()
                        await progress_queue.wait_closed()
                        break
                    continue

        except Exception as e:
            yield json.dumps({"status": "error", "message": str(e)}) + "\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


def main():
    import argparse
    parser = argparse.ArgumentParser(description="videodl HTTP Server")
    parser.add_argument("--port", type=int, default=18901, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    args = parser.parse_args()

    print(f"Starting videodl HTTP server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
