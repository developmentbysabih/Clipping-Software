"""
Downloader and Ingestion Service.
Handles YouTube / URL downloads using yt-dlp and local file uploads.
"""
import os
import re
import json
import uuid
import shutil
import asyncio
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Callable

import yt_dlp

from backend.config import RAW_VIDEOS_DIR, UPLOADS_DIR


def sanitize_filename(name: str) -> str:
    """Sanitize string to be safe for filenames."""
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = re.sub(r"\s+", "_", name)
    return name[:60]


def get_video_metadata(video_path: Path) -> Dict[str, Any]:
    """
    Extract video metadata (duration, width, height, fps, codec) using ffprobe.
    """
    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration,size,bit_rate:stream=width,height,r_frame_rate,codec_name,codec_type",
            "-of", "json",
            str(video_path)
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        data = json.loads(result.stdout)
        
        format_info = data.get("format", {})
        duration = float(format_info.get("duration", 0.0))
        size = int(format_info.get("size", 0))
        
        video_stream = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
        width = int(video_stream.get("width", 0))
        height = int(video_stream.get("height", 0))
        codec = video_stream.get("codec_name", "unknown")
        
        # Calculate fps
        fps_str = video_stream.get("r_frame_rate", "30/1")
        if "/" in fps_str:
            num, den = fps_str.split("/")
            fps = float(num) / float(den) if float(den) != 0 else 30.0
        else:
            fps = float(fps_str) if fps_str else 30.0

        return {
            "duration": duration,
            "width": width,
            "height": height,
            "fps": round(fps, 2),
            "size": size,
            "codec": codec,
            "aspect_ratio": f"{width}:{height}" if width and height else "unknown",
            "is_vertical": height > width if width and height else False,
        }
    except Exception as e:
        return {
            "duration": 0.0,
            "width": 0,
            "height": 0,
            "fps": 30.0,
            "size": os.path.getsize(video_path) if video_path.exists() else 0,
            "codec": "unknown",
            "aspect_ratio": "unknown",
            "is_vertical": False,
            "error": str(e)
        }


class VideoDownloader:
    """Downloader for remote and local video ingestion."""

    @staticmethod
    def download_url(
        url: str,
        output_dir: Optional[Path] = None,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> Dict[str, Any]:
        """
        Download video from YouTube or other supported URL using yt-dlp.
        """
        target_dir = output_dir or RAW_VIDEOS_DIR
        video_id = str(uuid.uuid4())[:8]
        output_template = str(target_dir / f"%(id)s_%(title).50s.%(ext)s")

        last_percent = [0.0]

        def ytdl_hook(d: Dict[str, Any]):
            if not progress_callback:
                return

            status = d.get("status")
            if status == "downloading":
                percent = 0.0
                
                # 1. Check _percent_str
                pct_str = d.get("_percent_str")
                if pct_str:
                    clean = re.sub(r"[^\d.]", "", pct_str)
                    try:
                        percent = float(clean)
                    except ValueError:
                        pass
                
                # 2. Check fragment counts (for DASH streams / YouTube 1080p)
                if percent <= 0.0 and d.get("fragment_count"):
                    frag_idx = d.get("fragment_index") or 0
                    frag_tot = d.get("fragment_count") or 1
                    percent = round((frag_idx / frag_tot) * 100.0, 1)

                # 3. Check byte counts
                if percent <= 0.0:
                    tot = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                    dl = d.get("downloaded_bytes") or 0
                    if tot > 0:
                        percent = round((dl / tot) * 100.0, 1)

                speed_str = d.get("_speed_str") or ""
                eta_str = d.get("_eta_str") or ""

                msg = f"Downloading video stream ({percent:.1f}%)"
                if speed_str:
                    msg += f" at {speed_str.strip()}"
                if eta_str:
                    msg += f" (ETA {eta_str.strip()})"

                progress_callback({
                    "stage": "downloading",
                    "percent": percent,
                    "downloaded_bytes": d.get("downloaded_bytes", 0),
                    "total_bytes": d.get("total_bytes", 0),
                    "speed_str": speed_str,
                    "eta_str": eta_str,
                    "message": msg,
                })
            elif status == "finished":
                progress_callback({
                    "stage": "processing_download",
                    "percent": 100.0,
                    "message": "Finalizing video streams & muxing MP4..."
                })

        ydl_opts = {
            "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "outtmpl": output_template,
            "merge_output_format": "mp4",
            "progress_hooks": [ytdl_hook],
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if not info:
                raise ValueError(f"Unable to extract video from {url}")

            filename = ydl.prepare_filename(info)
            # yt-dlp might have merged into .mp4
            if not os.path.exists(filename):
                mp4_file = os.path.splitext(filename)[0] + ".mp4"
                if os.path.exists(mp4_file):
                    filename = mp4_file

            file_path = Path(filename)
            meta = get_video_metadata(file_path)

            return {
                "id": info.get("id", video_id),
                "title": info.get("title", "Downloaded Video"),
                "file_path": str(file_path),
                "duration": meta.get("duration", info.get("duration", 0)),
                "width": meta.get("width", info.get("width", 0)),
                "height": meta.get("height", info.get("height", 0)),
                "fps": meta.get("fps", 30.0),
                "thumbnail": info.get("thumbnail", ""),
                "author": info.get("uploader", "Unknown"),
                "source_url": url,
                "is_vertical": meta.get("is_vertical", False),
            }

    @staticmethod
    def handle_local_upload(
        file_obj,
        filename: str,
        target_dir: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Save and inspect locally uploaded video file.
        """
        dest_dir = target_dir or RAW_VIDEOS_DIR
        file_id = str(uuid.uuid4())[:8]
        safe_name = sanitize_filename(os.path.splitext(filename)[0])
        ext = os.path.splitext(filename)[1].lower() or ".mp4"
        out_filename = f"{file_id}_{safe_name}{ext}"
        out_path = dest_dir / out_filename

        with open(out_path, "wb") as f:
            if hasattr(file_obj, "read"):
                shutil.copyfileobj(file_obj, f)
            else:
                f.write(file_obj)

        meta = get_video_metadata(out_path)

        return {
            "id": file_id,
            "title": safe_name,
            "file_path": str(out_path),
            "duration": meta.get("duration", 0),
            "width": meta.get("width", 0),
            "height": meta.get("height", 0),
            "fps": meta.get("fps", 30.0),
            "thumbnail": "",
            "author": "Local Upload",
            "source_url": "",
            "is_vertical": meta.get("is_vertical", False),
        }
