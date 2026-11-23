r"""
FFmpeg Dynamic Composite Pipeline.
Constructs and executes complex filtergraphs for 9:16 vertical conversion,
blurred background stacking, zoom/punch-in, horizontal flip, color tuning,
audio speed/tempo synchronization, and ASS subtitle burn-in.
"""
import os
import re
import math
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Callable, List

from backend.config import OUTPUT_CLIPS_DIR, DEFAULT_RENDER_CONFIG


def escape_ffmpeg_filter_path(file_path: Path) -> str:
    r"""
    Format and escape file path for FFmpeg filter arguments (subtitles / ass).
    Handles Windows drive letters, backslashes, and special characters.
    Example: D:\storage\sub.ass -> D\:/storage/sub.ass
    """
    posix_path = file_path.resolve().as_posix()
    # On Windows, escape colon after drive letter: 'D:/foo' -> 'D\:/foo'
    if len(posix_path) > 1 and posix_path[1] == ":":
        posix_path = posix_path[0] + r"\:" + posix_path[2:]
    
    # Escape single quotes and spaces
    posix_path = posix_path.replace("'", r"\'")
    return f"'{posix_path}'"


def build_atempo_chain(speed: float) -> str:
    """Build FFmpeg audio atempo filter chain for any speed multiplier."""
    speed = max(0.25, min(4.0, speed))
    if abs(speed - 1.0) < 0.001:
        return "anull"

    filters = []
    curr = speed
    while curr > 2.0:
        filters.append("atempo=2.0")
        curr /= 2.0
    while curr < 0.5:
        filters.append("atempo=0.5")
        curr /= 0.5
    
    if abs(curr - 1.0) >= 0.001:
        filters.append(f"atempo={curr:.4f}")

    return ",".join(filters) if filters else "anull"


class FFmpegPipeline:
    """Dynamic builder and executor for FFmpeg video transformation jobs."""

    @classmethod
    def render_clip(
        cls,
        source_video: Path,
        start_time: float,
        end_time: float,
        output_file: Optional[Path] = None,
        subtitle_path: Optional[Path] = None,
        render_options: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> Path:
        """
        Slice and composite video with 9:16 layout, effects, speed sync, and subtitle burn-in.
        """
        opts = dict(DEFAULT_RENDER_CONFIG)
        if render_options:
            opts.update(render_options)

        duration = max(0.5, end_time - start_time)
        target_w = int(opts.get("target_width", 1080))
        target_h = int(opts.get("target_height", 1920))
        speed = float(opts.get("speed", 1.0))
        hflip = bool(opts.get("hflip", False))
        zoom = float(opts.get("zoom_factor", 1.0))
        saturation = float(opts.get("saturation", 1.15))
        contrast = float(opts.get("contrast", 1.05))
        brightness = float(opts.get("brightness", 0.02))
        gamma = float(opts.get("gamma", 1.0))
        vertical_9_16 = bool(opts.get("vertical_9_16", True))
        burn_subs = bool(opts.get("burn_subtitles", True)) and subtitle_path is not None and subtitle_path.exists()
        blur_rad = int(opts.get("blur_strength", 20))
        blur_steps = int(opts.get("blur_steps", 5))

        if not output_file:
            out_name = f"clip_{int(start_time)}_{int(end_time)}_{int(speed*100)}.mp4"
            output_file = OUTPUT_CLIPS_DIR / out_name

        output_file.parent.mkdir(parents=True, exist_ok=True)

        # Build dynamic Filtergraph
        if vertical_9_16:
            # Blurred Background + Crisp Foreground Overlay
            filter_complex_str = (
                f"[0:v]scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
                f"crop={target_w}:{target_h},boxblur={blur_rad}:{blur_steps}[bg];"
                f"[0:v]scale={target_w}:-1[fg];"
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2[v_base]"
            )
            current_v_label = "[v_base]"
        else:
            # Standard scale maintaining aspect ratio
            filter_complex_str = f"[0:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2[v_base]"
            current_v_label = "[v_base]"

        # Secondary Video Filters Pipeline
        post_filters = []

        # 1. Zoom / Punch-in
        if zoom > 1.001:
            z = min(1.5, zoom)
            post_filters.append(f"scale=iw*{z:.3f}:-1,crop=iw/{z:.3f}:ih/{z:.3f}")

        # 2. Horizontal Flip
        if hflip:
            post_filters.append("hflip")

        # 3. Color Grading & Equalizer
        eq_parts = []
        if abs(saturation - 1.0) > 0.01:
            eq_parts.append(f"saturation={saturation:.2f}")
        if abs(contrast - 1.0) > 0.01:
            eq_parts.append(f"contrast={contrast:.2f}")
        if abs(brightness) > 0.005:
            eq_parts.append(f"brightness={brightness:.3f}")
        if abs(gamma - 1.0) > 0.01:
            eq_parts.append(f"gamma={gamma:.2f}")
        
        if eq_parts:
            post_filters.append(f"eq={':'.join(eq_parts)}")

        # 4. Playback Speed Multiplier on Video PTS
        if abs(speed - 1.0) > 0.005:
            post_filters.append(f"setpts=PTS/{speed:.4f}")

        # 5. Burn Subtitles via libass filter
        if burn_subs and subtitle_path:
            escaped_sub = escape_ffmpeg_filter_path(subtitle_path)
            post_filters.append(f"ass={escaped_sub}")

        if post_filters:
            filter_complex_str += f";{current_v_label}{','.join(post_filters)}[v_out]"
            final_v_map = "[v_out]"
        else:
            final_v_map = current_v_label

        # Audio Filtergraph: atempo
        a_filter = build_atempo_chain(speed)
        filter_complex_str += f";[0:a]{a_filter}[a_out]"
        final_a_map = "[a_out]"

        # Construct FFmpeg command
        cmd = [
            "ffmpeg",
            "-y",
            "-ss", f"{start_time:.3f}",
            "-to", f"{end_time:.3f}",
            "-i", str(source_video),
            "-filter_complex", filter_complex_str,
            "-map", final_v_map,
            "-map", final_a_map,
            "-c:v", "libx264",
            "-preset", str(opts.get("preset", "fast")),
            "-crf", str(opts.get("crf", 20)),
            "-c:a", "aac",
            "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-progress", "pipe:1",
            str(output_file)
        ]

        if progress_callback:
            progress_callback({
                "stage": "rendering",
                "percent": 0.0,
                "message": "Starting FFmpeg rendering pipeline..."
            })

        # Run process redirecting stderr to stdout to prevent pipe buffer deadlock
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True
        )

        expected_duration = (duration / speed) * 1000000.0  # in microseconds
        full_logs = []

        try:
            for line in process.stdout:
                full_logs.append(line)
                line = line.strip()
                if line.startswith("out_time_us="):
                    time_us_str = line.split("=")[1]
                    try:
                        time_us = float(time_us_str)
                        if expected_duration > 0:
                            percent = min(99.0, max(0.0, (time_us / expected_duration) * 100.0))
                            if progress_callback:
                                progress_callback({
                                    "stage": "rendering",
                                    "percent": round(percent, 1),
                                    "message": f"Rendering video ({round(percent, 1)}%)..."
                                })
                    except ValueError:
                        pass
                elif line == "progress=end":
                    if progress_callback:
                        progress_callback({
                            "stage": "rendering",
                            "percent": 100.0,
                            "message": "Rendering complete!"
                        })

            process.wait()
            if process.returncode != 0:
                err_text = "".join(full_logs[-25:])
                raise RuntimeError(f"FFmpeg render failed (code {process.returncode}):\n{err_text}")

        except Exception as e:
            process.kill()
            raise e

        return output_file

    @classmethod
    def generate_thumbnail(cls, video_path: Path, output_thumb: Path, timestamp: float = 1.0) -> Path:
        """Generate a JPEG thumbnail image for video preview."""
        output_thumb.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(timestamp),
            "-i", str(video_path),
            "-vframes", "1",
            "-q:v", "2",
            str(output_thumb)
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return output_thumb
