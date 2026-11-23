"""
ASS (Advanced SubStation Alpha) Animated Subtitle Generator.
Generates word-by-word karaoke style animations (Hormozi, Beast, Minimal, Cyberpunk).
"""
import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from backend.config import SUBTITLE_PRESETS, SUBTITLES_DIR


def format_ass_time(seconds: float) -> str:
    """Convert seconds float to ASS timestamp format: H:MM:SS.cc (centiseconds)."""
    seconds = max(0.0, seconds)
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centis = int(round((seconds - int(seconds)) * 100))
    if centis >= 100:
        secs += 1
        centis = 0
        if secs >= 60:
            mins += 1
            secs = 0
            if mins >= 60:
                hrs += 1
                mins = 0
    return f"{hrs}:{mins:02d}:{secs:02d}.{centis:02d}"


def hex_to_ass_color(hex_str: str, alpha: int = 0) -> str:
    """
    Convert CSS hex color (#RRGGBB) to ASS color format &HAABBGGRR&.
    """
    if hex_str.startswith("&H"):
        return hex_str
    
    clean_hex = hex_str.lstrip("#")
    if len(clean_hex) == 6:
        r = clean_hex[0:2]
        g = clean_hex[2:4]
        b = clean_hex[4:6]
        return f"&H{alpha:02X}{b}{g}{r}&"
    elif len(clean_hex) == 8:
        # #AARRGGBB
        a = clean_hex[0:2]
        r = clean_hex[2:4]
        g = clean_hex[4:6]
        b = clean_hex[6:8]
        return f"&H{a}{b}{g}{r}&"
    return "&H00FFFFFF&"


class SubtitleGenerator:
    """Engine for generating styled .ass karaoke subtitle files."""

    @classmethod
    def generate_ass(
        cls,
        words: List[Dict[str, Any]],
        clip_start: float,
        clip_end: float,
        preset_name: str = "hormozi",
        custom_options: Optional[Dict[str, Any]] = None,
        output_path: Optional[Path] = None,
        video_width: int = 1080,
        video_height: int = 1920,
    ) -> Path:
        """
        Generate ASS subtitle file with word-by-word active highlighting.
        """
        preset = dict(SUBTITLE_PRESETS.get(preset_name, SUBTITLE_PRESETS["hormozi"]))
        if custom_options:
            preset.update({k: v for k, v in custom_options.items() if v is not None})

        font_name = preset.get("font_name", "Arial Black")
        font_size = int(preset.get("font_size", 48))
        primary_color = hex_to_ass_color(str(preset.get("primary_color", "&H00FFFFFF&")))
        highlight_color = hex_to_ass_color(str(preset.get("highlight_color", "&H0000FFFF&")))
        secondary_color = hex_to_ass_color(str(preset.get("secondary_color", "&H0000FF66&")))
        outline_color = hex_to_ass_color(str(preset.get("outline_color", "&H00000000&")))
        back_color = hex_to_ass_color(str(preset.get("back_color", "&H80000000&")), alpha=128)
        
        bold = -1 if preset.get("bold", True) else 0
        italic = -1 if preset.get("italic", False) else 0
        outline = float(preset.get("outline", 4.0))
        shadow = float(preset.get("shadow", 2.0))
        alignment = int(preset.get("alignment", 2)) # 2 = bottom-center, 5 = center
        margin_v = int(preset.get("margin_v", 160))
        uppercase = bool(preset.get("uppercase", True))
        words_per_line = int(preset.get("words_per_line", 3))
        max_chars = int(preset.get("max_chars_per_line", 28))
        animation_style = preset.get("animation", "pop")

        # Filter words within the clip range
        clip_words = []
        for w in words:
            w_start = float(w.get("start", 0.0))
            w_end = float(w.get("end", 0.0))
            w_text = w.get("word", "").strip()

            if not w_text:
                continue

            # Word overlaps clip window
            if w_end > clip_start and w_start < clip_end:
                # Clamp to clip bounds and compute relative timestamps
                rel_start = max(0.0, w_start - clip_start)
                rel_end = max(rel_start + 0.05, min(w_end - clip_start, clip_end - clip_start))
                
                text_formatted = w_text.upper() if uppercase else w_text
                clip_words.append({
                    "word": text_formatted,
                    "rel_start": rel_start,
                    "rel_end": rel_end,
                    "abs_start": w_start,
                    "abs_end": w_end
                })

        if not output_path:
            out_file = SUBTITLES_DIR / f"sub_{int(clip_start)}_{int(clip_end)}_{preset_name}.ass"
        else:
            out_file = Path(output_path)

        out_file.parent.mkdir(parents=True, exist_ok=True)

        # Build ASS file header
        ass_content = [
            "[Script Info]",
            "Title: Local AI Video Clipper Animated Subtitles",
            "ScriptType: v4.00+",
            "WrapStyle: 0",
            f"PlayResX: {video_width}",
            f"PlayResY: {video_height}",
            "ScaledBorderAndShadow: yes",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            f"Style: Default,{font_name},{font_size},{primary_color},{secondary_color},{outline_color},{back_color},{bold},{italic},0,0,100,100,0,0,1,{outline},{shadow},{alignment},40,40,{margin_v},1",
            f"Style: ActiveWord,{font_name},{font_size},{highlight_color},{secondary_color},{outline_color},{back_color},{bold},{italic},0,0,100,100,0,0,1,{outline},{shadow},{alignment},40,40,{margin_v},1",
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
        ]

        if not clip_words:
            # Write empty subtitle file with valid structure
            with open(out_file, "w", encoding="utf-8") as f:
                f.write("\n".join(ass_content) + "\n")
            return out_file

        # Group words into subtitle lines (chunks of N words or length constraints)
        chunks: List[List[Dict[str, Any]]] = []
        current_chunk: List[Dict[str, Any]] = []
        current_len = 0

        for w in clip_words:
            w_len = len(w["word"])
            if (len(current_chunk) >= words_per_line) or (current_len + w_len > max_chars and current_chunk):
                chunks.append(current_chunk)
                current_chunk = [w]
                current_len = w_len
            else:
                current_chunk.append(w)
                current_len += w_len + 1

        if current_chunk:
            chunks.append(current_chunk)

        # Generate active word highlight events for each chunk
        for chunk in chunks:
            chunk_start = chunk[0]["rel_start"]
            chunk_end = chunk[-1]["rel_end"]

            # Add slight hold on last word of the chunk so it doesn't vanish instantly
            chunk_end = max(chunk_end, chunk_start + 0.4)

            for i, active_w in enumerate(chunk):
                w_start = active_w["rel_start"]
                # Active window lasts until next word starts or until chunk ends
                if i < len(chunk) - 1:
                    w_end = chunk[i + 1]["rel_start"]
                else:
                    w_end = chunk_end

                if w_end <= w_start:
                    w_end = w_start + 0.1

                start_str = format_ass_time(w_start)
                end_str = format_ass_time(w_end)

                # Construct dialogue line with active word highlighted
                line_parts = []
                for j, w in enumerate(chunk):
                    if j == i:
                        # Active word with highlight color and optional bounce effect
                        if animation_style == "pop":
                            # Subtle pop animation (110% scale to 100%)
                            line_parts.append(r"{\c" + highlight_color + r"\t(0,80,\fscx108\fscy108)\t(80,160,\fscx100\fscy100)}" + w["word"] + r"{\r}")
                        else:
                            line_parts.append(r"{\c" + highlight_color + r"}" + w["word"] + r"{\r}")
                    else:
                        # Inactive word
                        line_parts.append(r"{\c" + primary_color + r"}" + w["word"] + r"{\r}")

                dialogue_text = " ".join(line_parts)
                event_line = f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{dialogue_text}"
                ass_content.append(event_line)

        with open(out_file, "w", encoding="utf-8") as f:
            f.write("\n".join(ass_content) + "\n")

        return out_file

    @classmethod
    def get_all_words_from_transcript(cls, transcript_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Flatten segments into an ordered list of words with absolute timestamps."""
        words = []
        for segment in transcript_data.get("segments", []):
            seg_words = segment.get("words", [])
            if seg_words:
                words.extend(seg_words)
            else:
                # If segment has no words, synthesize word timestamps from text
                seg_text = segment.get("text", "").strip()
                tokens = seg_text.split()
                s_start = segment.get("start", 0.0)
                s_end = segment.get("end", s_start + 1.0)
                dur = max(0.1, s_end - s_start)
                if tokens:
                    token_dur = dur / len(tokens)
                    for idx, tok in enumerate(tokens):
                        w_st = s_start + idx * token_dur
                        w_en = w_st + token_dur
                        words.append({"word": tok, "start": round(w_st, 3), "end": round(w_en, 3)})
        return words
