"""
Configuration and settings for Local AI Video Clipper & Repurposing Engine.
"""
import os
import sys
from pathlib import Path
from typing import Dict, Any

# Suppress Hugging Face symlink warning on Windows
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

# Project Root Directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Storage Directories
STORAGE_DIR = BASE_DIR / "storage"
RAW_VIDEOS_DIR = STORAGE_DIR / "raw_videos"
TRANSCRIPTS_DIR = STORAGE_DIR / "transcripts"
SUBTITLES_DIR = STORAGE_DIR / "subtitles"
OUTPUT_CLIPS_DIR = STORAGE_DIR / "output_clips"
UPLOADS_DIR = STORAGE_DIR / "uploads"
TEMP_DIR = STORAGE_DIR / "temp"

# Ensure all storage paths exist
for path in [
    STORAGE_DIR,
    RAW_VIDEOS_DIR,
    TRANSCRIPTS_DIR,
    SUBTITLES_DIR,
    OUTPUT_CLIPS_DIR,
    UPLOADS_DIR,
    TEMP_DIR,
]:
    path.mkdir(parents=True, exist_ok=True)

# Hardware and Execution Settings
def get_optimal_device() -> str:
    """Detect available compute device for faster-whisper."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"

DEVICE = get_optimal_device()
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"

# Model Defaults
DEFAULT_WHISPER_MODEL = "base"
AVAILABLE_WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"]

# Ollama LLM Settings
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
DEFAULT_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
AVAILABLE_OLLAMA_MODELS = [
    "llama3.2",
    "llama3.2:1b",
    "llama3.2:3b",
    "qwen2.5",
    "qwen2.5:3b",
    "qwen2.5:7b",
    "mistral",
    "llama3",
    "gemma2",
    "phi3",
]

# Subtitle Presets Definition
# Color format in ASS is &HAABBGGRR& (Alpha, Blue, Green, Red)
SUBTITLE_PRESETS: Dict[str, Dict[str, Any]] = {
    "hormozi": {
        "name": "Hormozi Punchy",
        "description": "Extra bold uppercase with dynamic vibrant yellow/green highlight and heavy black outline",
        "font_name": "Arial Black",
        "font_size": 48,
        "primary_color": "&H00FFFFFF&",    # White (inactive)
        "highlight_color": "&H0000FFFF&",  # Bright Yellow (active word)
        "secondary_color": "&H0000FF66&",  # Neon Green accent
        "outline_color": "&H00000000&",    # Solid Black
        "back_color": "&H80000000&",       # Semi-transparent shadow
        "bold": True,
        "italic": False,
        "uppercase": True,
        "outline": 4.0,
        "shadow": 2.5,
        "alignment": 2,                    # Bottom-center
        "margin_v": 160,                   # Vertical margin from bottom
        "words_per_line": 3,
        "max_chars_per_line": 28,
        "animation": "pop",                # Word pop/highlight
    },
    "beast": {
        "name": "Beast Dynamic",
        "description": "High-impact bold style with electric neon green active word and deep drop shadow",
        "font_name": "Impact",
        "font_size": 52,
        "primary_color": "&H00FFFFFF&",
        "highlight_color": "&H0000FF00&",  # Electric Green
        "secondary_color": "&H0000FFFF&",
        "outline_color": "&H00000000&",
        "back_color": "&HB0000000&",
        "bold": True,
        "italic": False,
        "uppercase": True,
        "outline": 4.5,
        "shadow": 3.0,
        "alignment": 2,
        "margin_v": 170,
        "words_per_line": 2,
        "max_chars_per_line": 22,
        "animation": "pop",
    },
    "minimal": {
        "name": "Minimal Clean",
        "description": "Modern clean typography with subtle outline for sleek educational content",
        "font_name": "Arial",
        "font_size": 40,
        "primary_color": "&H00F0F0F0&",    # Soft White
        "highlight_color": "&H0050C8FF&",  # Soft Cyan / Gold
        "secondary_color": "&H00E0E0E0&",
        "outline_color": "&H001A1A1A&",    # Dark Charcoal
        "back_color": "&H00000000&",
        "bold": True,
        "italic": False,
        "uppercase": False,
        "outline": 2.2,
        "shadow": 1.0,
        "alignment": 2,
        "margin_v": 140,
        "words_per_line": 4,
        "max_chars_per_line": 35,
        "animation": "color",
    },
    "cyberpunk": {
        "name": "Cyberpunk Neon",
        "description": "Futuristic neon cyan and magenta text with vibrant glow effect",
        "font_name": "Trebuchet MS",
        "font_size": 46,
        "primary_color": "&H00FFFFFF&",
        "highlight_color": "&H00FFFF00&",  # Electric Cyan
        "secondary_color": "&H00FF00FF&",  # Hot Magenta
        "outline_color": "&H00100510&",
        "back_color": "&H90300030&",
        "bold": True,
        "italic": False,
        "uppercase": True,
        "outline": 3.5,
        "shadow": 2.0,
        "alignment": 2,
        "margin_v": 150,
        "words_per_line": 3,
        "max_chars_per_line": 26,
        "animation": "pop",
    },
}

# Default Video Render Options
DEFAULT_RENDER_CONFIG = {
    "vertical_9_16": True,
    "target_width": 1080,
    "target_height": 1920,
    "blur_strength": 20,
    "blur_steps": 5,
    "zoom_factor": 1.0,
    "hflip": False,
    "speed": 1.0,
    "saturation": 1.15,
    "contrast": 1.05,
    "brightness": 0.02,
    "gamma": 1.0,
    "subtitle_preset": "hormozi",
    "burn_subtitles": True,
    "crf": 20,
    "preset": "fast",
}
