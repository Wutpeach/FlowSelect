from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


ANOMALY = {
    "isolated_mean_jump": 0.20,
    "isolated_mean_margin": 0.10,
    "large_bright90_fraction": 0.50,
    "large_bright98_fraction": 0.10,
    "large_bright_margin": 0.05,
}


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout or "{}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffprobe(path: Path) -> dict[str, Any]:
    return run_json(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)])


def ffprobe_frames(path: Path) -> list[dict[str, Any]]:
    data = run_json([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=best_effort_timestamp_time,pkt_duration_time,key_frame,pict_type",
        "-of", "json", str(path),
    ])
    return data.get("frames", [])


def percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    return sorted_values[int(q * (len(sorted_values) - 1))]


def rgb_luma(rgb: bytes) -> list[float]:
    values: list[float] = []
    for index in range(0, len(rgb), 3):
        values.append((0.2126 * rgb[index] + 0.7152 * rgb[index + 1] + 0.0722 * rgb[index + 2]) / 255.0)
    return values


def frame_metrics(luma: list[float], width: int, height: int, previous: list[float] | None) -> dict[str, Any]:
    count = len(luma)
    ordered = sorted(luma)
    bright90 = sum(1 for value in luma if value >= 0.90)
    bright98 = sum(1 for value in luma if value >= 0.98)
    delta_mean = None
    delta_max_tile = None
    delta_tile_x = None
    delta_tile_y = None
    delta_fraction_01 = None
    if previous is not None:
        delta = [abs(current - old) for current, old in zip(luma, previous)]
        delta_mean = sum(delta) / count
        delta_fraction_01 = sum(1 for value in delta if value >= 0.10) / count
        tile_size = 40
        best = -1.0
        for y in range(0, height, tile_size):
            for x in range(0, width, tile_size):
                values = [delta[row * width + column] for row in range(y, min(y + tile_size, height)) for column in range(x, min(x + tile_size, width))]
                tile_mean = sum(values) / max(1, len(values))
                if tile_mean > best:
                    best = tile_mean
                    delta_tile_x = x
                    delta_tile_y = y
        delta_max_tile = best
    return {
        "meanY": sum(luma) / count,
        "p50Y": percentile(ordered, 0.50),
        "p95Y": percentile(ordered, 0.95),
        "p99Y": percentile(ordered, 0.99),
        "maxY": max(luma),
        "bright90Fraction": bright90 / count,
        "bright98Fraction": bright98 / count,
        "deltaMean": delta_mean,
        "deltaFraction01": delta_fraction_01,
        "deltaMaxTile": delta_max_tile,
        "deltaTileX": delta_tile_x,
        "deltaTileY": delta_tile_y,
    }


def decode_metrics(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]], dict[int, bytes]]:
    probe = ffprobe(path)
    stream = next(item for item in probe.get("streams", []) if item.get("codec_type") == "video")
    width = int(stream["width"])
    height = int(stream["height"])
    raw = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-map", "0:v:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ])
    frame_bytes = width * height * 3
    count = len(raw) // frame_bytes
    timestamp_frames = ffprobe_frames(path)
    rows: list[dict[str, Any]] = []
    rgb_frames: dict[int, bytes] = {}
    previous: list[float] | None = None
    for index in range(count):
        frame = raw[index * frame_bytes:(index + 1) * frame_bytes]
        luma = rgb_luma(frame)
        metrics = frame_metrics(luma, width, height, previous)
        timestamp = timestamp_frames[index].get("best_effort_timestamp_time") if index < len(timestamp_frames) else None
        duration = timestamp_frames[index].get("pkt_duration_time") if index < len(timestamp_frames) else None
        rows.append({
            "index": index,
            "timestampSec": float(timestamp) if timestamp not in (None, "N/A") else None,
            "durationSec": float(duration) if duration not in (None, "N/A") else None,
            "keyFrame": timestamp_frames[index].get("key_frame") if index < len(timestamp_frames) else None,
            "pictureType": timestamp_frames[index].get("pict_type") if index < len(timestamp_frames) else None,
            **metrics,
        })
        rgb_frames[index] = frame
        previous = luma
    facts = {
        "path": str(path),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "probe": probe,
        "decoded": {
            "width": width,
            "height": height,
            "frameCount": count,
            "rgb24Bytes": len(raw),
            "timestampFrameCount": len(timestamp_frames),
        },
    }
    return facts, rows, rgb_frames


def anomaly_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        if index == 0 or index == len(rows) - 1:
            continue
        previous = rows[index - 1]
        following = rows[index + 1]
        mean_isolated = (
            (row["deltaMean"] or 0) >= ANOMALY["isolated_mean_jump"]
            and row["meanY"] - max(previous["meanY"], following["meanY"]) >= ANOMALY["isolated_mean_margin"]
        )
        bright_isolated = (
            (
                row["bright90Fraction"] >= ANOMALY["large_bright90_fraction"]
                or row["bright98Fraction"] >= ANOMALY["large_bright98_fraction"]
            )
            and row["bright90Fraction"] - max(previous["bright90Fraction"], following["bright90Fraction"]) >= ANOMALY["large_bright_margin"]
        )
        if mean_isolated or bright_isolated:
            anomalies.append({"index": index, "meanJump": mean_isolated, "brightAreaJump": bright_isolated, **row})
    return anomalies


def frame_indices(rows: list[dict[str, Any]]) -> list[int]:
    if not rows:
        return []
    ranked_bright = sorted(rows, key=lambda row: (row["bright98Fraction"], row["p99Y"], row["meanY"]), reverse=True)[:2]
    ranked_delta = sorted((row for row in rows if row["deltaMean"] is not None), key=lambda row: row["deltaMean"], reverse=True)[:2]
    selected: set[int] = set()
    for row in [*ranked_bright, *ranked_delta]:
        selected.update(range(max(0, row["index"] - 1), min(len(rows), row["index"] + 2)))
    selected.update({0, len(rows) - 1})
    return sorted(selected)


def make_sheet(path: Path, title: str, rows: list[dict[str, Any]], rgb_frames: dict[int, bytes] | None = None, png_frames: dict[int, Path] | None = None) -> None:
    selected = frame_indices(rows)
    if png_frames is not None:
        selected = [index for index in selected if index in png_frames]
    if not selected:
        return
    tile_width = 200
    tile_height = 224
    columns = min(4, len(selected))
    rows_count = (len(selected) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * tile_width, rows_count * tile_height), (24, 22, 30))
    draw = ImageDraw.Draw(sheet)
    for position, index in enumerate(selected):
        if rgb_frames is not None:
            image = Image.frombytes("RGB", (200, 200), rgb_frames[index])
        elif png_frames is not None and index in png_frames:
            image = Image.open(png_frames[index]).convert("RGB")
        else:
            continue
        x = (position % columns) * tile_width
        y = (position // columns) * tile_height
        sheet.paste(image, (x, y))
        row = rows[index]
        label = f"f{index} t={row.get('timestampSec', row.get('tMs', 0)):.3f} Y={row['meanY']:.3f} Y90={row['bright90Fraction']:.3f} d={row.get('deltaMean') or 0:.3f}"
        draw.rectangle((x, y + 200, x + tile_width, y + tile_height), fill=(24, 22, 30))
        draw.text((x + 2, y + 204), label, fill=(240, 238, 246))
    sheet.save(path)


def parse_review_html(review_path: Path, embedded_dir: Path) -> list[dict[str, Any]]:
    text = review_path.read_text("utf8")
    tags = re.findall(r"<video\\b([^>]*)>", text, flags=re.IGNORECASE)
    data_urls = re.findall(r"data:video/webm;base64,([A-Za-z0-9+/=]+)", text, flags=re.IGNORECASE)
    embedded_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for index, encoded in enumerate(data_urls):
        payload = base64.b64decode(encoded)
        output = embedded_dir / f"video-{index}.webm"
        output.write_bytes(payload)
        attrs = tags[index] if index < len(tags) else ""
        clean_attrs = dict(re.findall(r"([A-Za-z][A-Za-z0-9_-]*)(?:=\"([^\"]*)\")?", attrs))
        if "src" in clean_attrs and clean_attrs["src"].startswith("data:"):
            clean_attrs["src"] = f"data:video/webm;base64,<omitted:{len(encoded)} chars>"
        records.append({
            "index": index,
            "sourceHtml": str(review_path),
            "encodedBase64Length": len(encoded),
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
            "videoAttrs": clean_attrs,
            "path": str(output),
        })
    return records


def load_browser_metrics(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text("utf8"))


def png_metric(path: Path) -> dict[str, Any]:
    image = Image.open(path).convert("RGB")
    rgb = image.tobytes()
    luma = rgb_luma(rgb)
    return {"path": str(path), "width": image.width, "height": image.height, **frame_metrics(luma, image.width, image.height, None)}


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    keys = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf8") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("worktree", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    evidence = args.worktree / "evidence" / "mr9-ripple"
    args.output.mkdir(parents=True, exist_ok=True)
    originals = {
        "center": evidence / "single-scene-center-full-duration.webm",
        "off-center": evidence / "single-scene-off-center-full-duration.webm",
    }
    review_path = evidence / "single-scene-review.html"
    embedded = parse_review_html(review_path, args.output / "embedded")
    original_records: dict[str, Any] = {}
    all_rows: dict[str, list[dict[str, Any]]] = {}
    decoded_frames: dict[str, dict[int, bytes]] = {}
    for name, path in originals.items():
        facts, rows, frames = decode_metrics(path)
        original_records[name] = facts
        all_rows[f"original-{name}"] = rows
        decoded_frames[f"original-{name}"] = frames
        make_sheet(args.output / f"original-{name}-top-sheet.png", f"original {name}", rows, rgb_frames=frames)
    embedded_records: dict[str, Any] = {}
    for item in embedded:
        facts, rows, frames = decode_metrics(Path(item["path"]))
        item["probeFacts"] = facts
        item["matchesOriginal"] = next((name for name, original in original_records.items() if original["sha256"] == item["sha256"]), None)
        embedded_records[f"video-{item['index']}"] = item
        all_rows[f"embedded-video-{item['index']}"] = rows
        decoded_frames[f"embedded-video-{item['index']}"] = frames
        make_sheet(args.output / f"embedded-video-{item['index']}-top-sheet.png", f"embedded video-{item['index']}", rows, rgb_frames=frames)
    for source_name, source_rows in list(all_rows.items()):
        write_csv(args.output / f"{source_name}-frame-metrics.csv", source_rows)
    browser_live = load_browser_metrics(args.output / "live-metrics.json")
    browser_review = load_browser_metrics(args.output / "review-playback-metrics.json")
    browser_compositor = load_browser_metrics(args.output / "live-compositor-captures.json")
    browser_live_summary: dict[str, Any] = {}
    for lane, lane_data in browser_live["lanes"].items():
        lane_rows = lane_data["frames"]
        browser_live_summary[lane] = {
            "frameCount": len(lane_rows),
            "highestMean": max(lane_rows, key=lambda row: row["meanY"]),
            "highestDelta": max((row for row in lane_rows if row["deltaMean"] is not None), key=lambda row: row["deltaMean"]),
            "anomalies": anomaly_rows(lane_rows),
        }
    browser_review_summary: dict[str, Any] = {}
    for name, video in browser_review["videos"].items():
        rows = video["frames"]
        png_paths = {int(path.stem.rsplit("-", 1)[-1]): path for path in (args.output / "review").glob(f"{name}-*.png")}
        png_metric_rows = []
        for index, image_path in png_paths.items():
            metric = png_metric(image_path)
            metric["index"] = index
            png_metric_rows.append(metric)
        make_sheet(args.output / f"{name}-top-sheet.png", name, rows, png_frames=png_paths)
        browser_review_summary[name] = {
            "frameCount": len(rows),
            "highestMean": max(rows, key=lambda row: row["meanY"]),
            "highestDelta": max((row for row in rows if row["deltaMean"] is not None), key=lambda row: row["deltaMean"]),
            "anomalies": anomaly_rows(rows),
            "capturedPngMetrics": png_metric_rows,
        }
        write_csv(args.output / f"{name}-frame-metrics.csv", rows)
    browser_compositor_summary: dict[str, Any] = {}
    for lane, captures in browser_compositor["captures"].items():
        rows: list[dict[str, Any]] = []
        png_paths: dict[int, Path] = {}
        for index, capture in enumerate(captures):
            image_path = Path(capture["path"])
            metric = png_metric(image_path)
            row = {"index": index, "phaseMs": capture["phaseMs"], **{key: value for key, value in metric.items() if key not in {"path", "width", "height"}}}
            rows.append(row)
            png_paths[index] = image_path
        make_sheet(args.output / f"live-{lane}-compositor-sheet.png", f"live compositor {lane}", rows, png_frames=png_paths)
        browser_compositor_summary[lane] = {
            "frameCount": len(rows),
            "frames": rows,
            "highestMean": max(rows, key=lambda row: row["meanY"]),
            "highestBright90": max(rows, key=lambda row: row["bright90Fraction"]),
        }
    hashes = {
        "anomalyCriterion": ANOMALY,
        "reviewHtml": {"path": str(review_path), "sha256": sha256(review_path), "bytes": review_path.stat().st_size},
        "originals": original_records,
        "embedded": embedded_records,
        "liveCaptureFiles": {
            lane: {"path": str(args.output / "live" / f"{lane.replace(' ', '-')}-canvas-capture.webm"), "sha256": sha256(args.output / "live" / f"{lane.replace(' ', '-')}-canvas-capture.webm"), "bytes": (args.output / "live" / f"{lane.replace(' ', '-')}-canvas-capture.webm").stat().st_size}
            for lane in ("center", "off-center")
        },
    }
    summary = {
        "anomalyCriterion": ANOMALY,
        "originals": original_records,
        "embedded": embedded_records,
        "browserLive": browser_live_summary,
        "browserReview": browser_review_summary,
        "browserCompositor": browser_compositor_summary,
        "environment": {"live": browser_live.get("environment"), "review": browser_review.get("environment")},
    }
    (args.output / "input-hashes-and-facts.json").write_text(json.dumps(hashes, indent=2), "utf8")
    (args.output / "webm-frame-metrics.json").write_text(json.dumps({"anomalyCriterion": ANOMALY, "sources": all_rows}, indent=2), "utf8")
    (args.output / "white-flash-summary.json").write_text(json.dumps(summary, indent=2), "utf8")
    print(json.dumps({"output": str(args.output), "originals": list(original_records), "embedded": len(embedded_records), "live": list(browser_live_summary), "review": list(browser_review_summary)}, indent=2))


if __name__ == "__main__":
    main()
