"""
Comprehensive Unit and Integration Tests for Local AI Video Clipper Pipeline.
Tests:
1. ASS Subtitle generation with dynamic karaoke word highlighting.
2. Ollama / Heuristic hook analysis & sequential chunking with word boundary snapping.
3. End-to-end FFmpeg 9:16 composite rendering, speed adjustment, and subtitle burn-in on synthetic video.
"""
import os
import sys
import subprocess
import unittest
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.config import TEMP_DIR, OUTPUT_CLIPS_DIR, SUBTITLES_DIR
from backend.services.subtitle_gen import SubtitleGenerator, format_ass_time, hex_to_ass_color
from backend.services.analyzer import VideoAnalyzer
from backend.services.ffmpeg_pipeline import FFmpegPipeline, escape_ffmpeg_filter_path, build_atempo_chain
from backend.services.downloader import get_video_metadata


class TestVideoClipperPipeline(unittest.TestCase):

    def setUp(self):
        self.test_dir = TEMP_DIR / "unit_tests"
        self.test_dir.mkdir(parents=True, exist_ok=True)

    def test_01_ass_time_and_colors(self):
        """Test ASS time formatting and hex color conversion."""
        self.assertEqual(format_ass_time(0.0), "0:00:00.00")
        self.assertEqual(format_ass_time(12.345), "0:00:12.35")
        self.assertEqual(format_ass_time(65.5), "0:01:05.50")
        self.assertEqual(format_ass_time(3661.2), "1:01:01.20")

        # Test Hex to ASS color format (&HAABBGGRR&)
        self.assertEqual(hex_to_ass_color("#FFFFFF"), "&H00FFFFFF&")
        self.assertEqual(hex_to_ass_color("#FFFF00"), "&H0000FFFF&") # Yellow: B=00, G=FF, R=FF
        self.assertEqual(hex_to_ass_color("#00FF66"), "&H0066FF00&")

    def test_02_subtitle_generator(self):
        """Test ASS file generation with word-level highlight animation."""
        sample_words = [
            {"word": "This", "start": 10.0, "end": 10.4},
            {"word": "simple", "start": 10.45, "end": 10.9},
            {"word": "trick", "start": 10.95, "end": 11.4},
            {"word": "changed", "start": 11.5, "end": 12.0},
            {"word": "my", "start": 12.05, "end": 12.3},
            {"word": "workflow", "start": 12.35, "end": 12.9},
            {"word": "completely.", "start": 12.95, "end": 13.6},
        ]

        sub_path = self.test_dir / "test_sub.ass"
        out = SubtitleGenerator.generate_ass(
            words=sample_words,
            clip_start=10.0,
            clip_end=14.0,
            preset_name="hormozi",
            output_path=sub_path
        )

        self.assertTrue(out.exists())
        with open(out, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("[Script Info]", content)
        self.assertIn("Style: Default,Arial Black", content)
        self.assertIn("Dialogue:", content)
        self.assertIn(r"{\c&H0000FFFF&", content) # Active yellow highlight
        self.assertIn("THIS", content)

    def test_03_analyzer_heuristics_and_sequential(self):
        """Test heuristic viral hook detection and sequential chunking."""
        sample_transcript = {
            "duration": 90.0,
            "text": "Did you know this simple secret? Stop doing this mistake now. Here is how to fix it in 3 steps.",
            "segments": [
                {
                    "id": 0,
                    "start": 0.0,
                    "end": 8.0,
                    "text": "Did you know this simple secret?",
                    "words": [
                        {"word": "Did", "start": 0.0, "end": 0.5},
                        {"word": "you", "start": 0.5, "end": 0.8},
                        {"word": "know", "start": 0.8, "end": 1.4},
                        {"word": "this", "start": 1.4, "end": 1.8},
                        {"word": "simple", "start": 1.8, "end": 2.5},
                        {"word": "secret?", "start": 2.5, "end": 3.2},
                    ]
                },
                {
                    "id": 1,
                    "start": 8.0,
                    "end": 32.0,
                    "text": "Stop doing this mistake now. It ruins your productivity every single day.",
                    "words": [
                        {"word": "Stop", "start": 8.0, "end": 8.5},
                        {"word": "doing", "start": 8.5, "end": 9.0},
                        {"word": "this", "start": 9.0, "end": 9.5},
                        {"word": "mistake", "start": 9.5, "end": 10.2},
                    ]
                },
                {
                    "id": 2,
                    "start": 32.0,
                    "end": 65.0,
                    "text": "Here is how to fix it in three easy steps. First do this, then do that.",
                    "words": [
                        {"word": "Here", "start": 32.0, "end": 32.5},
                        {"word": "is", "start": 32.5, "end": 32.8},
                        {"word": "how", "start": 32.8, "end": 33.2},
                    ]
                }
            ]
        }

        # 1. Test Heuristic Hook Finder
        hooks = VideoAnalyzer.analyze_viral_hooks_heuristic(
            sample_transcript, min_duration=20.0, max_duration=60.0, max_clips=3
        )
        self.assertGreater(len(hooks), 0)
        self.assertIn("virality_score", hooks[0])
        self.assertIn("title", hooks[0])

        # 2. Test Sequential Chunker with snapping
        seq_clips = VideoAnalyzer.chunk_sequentially(
            sample_transcript, chunk_duration=30.0, overlap_seconds=2.0, snap_to_boundaries=True
        )
        self.assertGreater(len(seq_clips), 0)
        self.assertIn("Part 1", seq_clips[0]["title"])

    def test_04_ffmpeg_pipeline_synthetic_render(self):
        """Generate a 2-second synthetic 16:9 test video and render a complete 9:16 clip with effects."""
        raw_video = self.test_dir / "synthetic_landscape.mp4"
        
        # 1. Create a 2s 1280x720 16:9 test video with audio test tone
        cmd_gen = [
            "ffmpeg",
            "-y",
            "-f", "lavfi",
            "-i", "testsrc=duration=2:size=1280x720:rate=30",
            "-f", "lavfi",
            "-i", "sine=frequency=440:duration=2",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            str(raw_video)
        ]
        res = subprocess.run(cmd_gen, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(res.returncode, 0)
        self.assertTrue(raw_video.exists())

        # 2. Generate test subtitle file
        words = [
            {"word": "LOCAL", "start": 0.2, "end": 0.8},
            {"word": "AI", "start": 0.9, "end": 1.4},
        ]
        sub_file = self.test_dir / "test_render.ass"
        SubtitleGenerator.generate_ass(
            words=words,
            clip_start=0.0,
            clip_end=1.8,
            preset_name="hormozi",
            output_path=sub_file
        )

        # 3. Render 9:16 Vertical Clip with Effects & Subtitles
        rendered_output = self.test_dir / "output_test_9_16.mp4"
        render_opts = {
            "vertical_9_16": True,
            "speed": 1.05,
            "zoom_factor": 1.05,
            "hflip": False,
            "saturation": 1.2,
            "contrast": 1.05,
            "burn_subtitles": True,
            "preset": "ultrafast"
        }

        out = FFmpegPipeline.render_clip(
            source_video=raw_video,
            start_time=0.0,
            end_time=1.8,
            output_file=rendered_output,
            subtitle_path=sub_file,
            render_options=render_opts
        )

        self.assertTrue(out.exists())
        self.assertGreater(out.stat().st_size, 1000)

        # 4. Verify output metadata
        meta = get_video_metadata(out)
        self.assertEqual(meta.get("width"), 1080)
        self.assertEqual(meta.get("height"), 1920)
        self.assertTrue(meta.get("is_vertical"))
        self.assertGreater(meta.get("duration", 0), 1.0)


if __name__ == "__main__":
    unittest.main()
