"""
AI Viral Hook & Segmentation Analyzer.
Supports Mode 1 (Ollama LLM Viral Hook Detection with Heuristic Fallback) and
Mode 2 (Sequential Chunker with Whisper Word-Boundary Snapping).
"""
import re
import json
import requests
from typing import Dict, Any, List, Optional

from backend.config import OLLAMA_HOST, DEFAULT_OLLAMA_MODEL, AVAILABLE_OLLAMA_MODELS


# Common viral trigger phrases and hook indicators
HOOK_PATTERNS = [
    r"\b(how to|secret to|the reason why|never do this|stop doing|this simple trick|the biggest mistake)\b",
    r"\b(what if|did you know|here is why|most people don't know|the truth about|you won't believe)\b",
    r"\b(watch this|listen to this|number one rule|if you want to|this changed everything)\b",
    r"\b(step one|first thing|rule number|the best way|unbelievable|mind blowing|crazy)\b",
    r"\?",  # Questions are natural hooks
]


def check_ollama_status(host: str = OLLAMA_HOST) -> Dict[str, Any]:
    """Check if Ollama server is running and list available local models."""
    try:
        resp = requests.get(f"{host.rstrip('/')}/api/tags", timeout=2.5)
        if resp.status_code == 200:
            data = resp.json()
            models = [m.get("name") for m in data.get("models", [])]
            return {
                "online": True,
                "host": host,
                "models": models,
                "default_model": DEFAULT_OLLAMA_MODEL
            }
    except Exception:
        pass
    return {
        "online": False,
        "host": host,
        "models": [],
        "default_model": DEFAULT_OLLAMA_MODEL,
        "message": "Ollama not running locally. Fallback heuristic engine will be used automatically."
    }


class VideoAnalyzer:
    """Orchestrates AI Viral Hook analysis and Sequential chunking."""

    @staticmethod
    def _extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
        """Extract valid JSON object from LLM response text."""
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if match:
            text = match.group(1)
        
        start_idx = text.find("{")
        end_idx = text.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            candidate = text[start_idx : end_idx + 1]
            try:
                return json.loads(candidate)
            except Exception:
                pass

        try:
            return json.loads(text.strip())
        except Exception:
            return None

    @classmethod
    def analyze_viral_hooks_ollama(
        cls,
        transcript_data: Dict[str, Any],
        model_name: str = DEFAULT_OLLAMA_MODEL,
        host: str = OLLAMA_HOST,
        min_duration: float = 20.0,
        max_duration: float = 60.0,
        max_clips: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Send timestamped transcript to Ollama with a strict JSON schema prompt.
        """
        segments = transcript_data.get("segments", [])
        total_duration = float(transcript_data.get("duration", 0.0))

        if not segments or total_duration <= 0:
            return []

        transcript_lines = []
        for s in segments:
            transcript_lines.append(f"[{s['start']:.1f}s - {s['end']:.1f}s] {s['text']}")
        transcript_text = "\n".join(transcript_lines)

        system_prompt = (
            "You are an elite short-form video editor and viral content strategist (specializing in TikTok, YouTube Shorts, and Instagram Reels). "
            "Your task is to analyze the timestamped transcript and identify the most viral, high-retention standalone clips."
        )

        user_prompt = f"""
Analyze this timestamped video transcript and extract the top {max_clips} standalone viral clips.

CONSTRAINTS:
1. Target clip duration: {min_duration} to {max_duration} seconds.
2. Must have a strong initial hook in the first 3 seconds (provocative question, shocking statement, high value promise).
3. Must have a complete coherent narrative or educational payoff.
4. Timestamps MUST be strictly within [0.0s and {total_duration:.1f}s].
5. Use exact start_time and end_time from the transcript brackets.

TRANSCRIPT:
{transcript_text}

OUTPUT FORMAT:
Return strictly a valid JSON object matching this schema:
{{
  "clips": [
    {{
      "title": "Short Catchy Click-Worthy Title",
      "start_time": 12.4,
      "end_time": 45.2,
      "virality_score": 92,
      "hook_sentence": "Opening hook sentence...",
      "reasoning": "Why this snippet has high retention and virality potential."
    }}
  ]
}}
"""

        try:
            payload = {
                "model": model_name,
                "prompt": user_prompt,
                "system": system_prompt,
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": 0.3,
                    "top_p": 0.9,
                }
            }

            resp = requests.post(
                f"{host.rstrip('/')}/api/generate",
                json=payload,
                timeout=45.0
            )

            if resp.status_code == 200:
                response_json = resp.json()
                raw_response = response_json.get("response", "")
                parsed = cls._extract_json_from_text(raw_response)

                if parsed and isinstance(parsed, dict) and "clips" in parsed:
                    clips = parsed["clips"]
                    validated_clips = cls._validate_and_refine_clips(
                        clips, transcript_data, min_duration, max_duration
                    )
                    if validated_clips:
                        return validated_clips
        except Exception as e:
            print(f"[Analyzer] Ollama generation unavailable ({e}). Running heuristic fallback.")

        return cls.analyze_viral_hooks_heuristic(
            transcript_data, min_duration=min_duration, max_duration=max_duration, max_clips=max_clips
        )

    @classmethod
    def analyze_viral_hooks_heuristic(
        cls,
        transcript_data: Dict[str, Any],
        min_duration: float = 20.0,
        max_duration: float = 60.0,
        max_clips: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Intelligent rule-based hook detection fallback when Ollama is offline.
        Scores candidate segments based on hook keywords, question density, and speech pace.
        """
        segments = transcript_data.get("segments", [])
        total_duration = float(transcript_data.get("duration", 0.0))

        if not segments or total_duration <= 0:
            return []

        candidates = []

        for i, start_seg in enumerate(segments):
            start_time = float(start_seg["start"])
            hook_text = str(start_seg.get("text", ""))

            hook_score = 45.0
            for pattern in HOOK_PATTERNS:
                if re.search(pattern, hook_text, re.IGNORECASE):
                    hook_score += 20.0

            accumulated_text = [hook_text]
            for j in range(i + 1, len(segments)):
                curr_seg = segments[j]
                curr_end = float(curr_seg["end"])
                current_duration = curr_end - start_time

                if current_duration < min_duration:
                    accumulated_text.append(str(curr_seg.get("text", "")))
                    continue

                if current_duration > max_duration:
                    break

                end_time = curr_end
                full_clip_text = " ".join(accumulated_text + [str(curr_seg.get("text", ""))])
                word_count = len(full_clip_text.split())

                pace_score = min(20.0, (word_count / max(1.0, current_duration)) * 6.0)
                ending_bonus = 10.0 if curr_seg.get("text", "").rstrip().endswith((".", "!", "?")) else 0.0
                total_score = min(98, int(hook_score + pace_score + ending_bonus))

                title = cls._generate_title_from_text(hook_text, full_clip_text)

                candidates.append({
                    "title": title,
                    "start_time": round(start_time, 2),
                    "end_time": round(end_time, 2),
                    "virality_score": total_score,
                    "hook_sentence": hook_text[:120].strip(),
                    "reasoning": f"Detected high engagement opener with {word_count} spoken words and clear cadence.",
                    "duration": round(end_time - start_time, 2)
                })

        candidates.sort(key=lambda x: x["virality_score"], reverse=True)

        selected = []
        for cand in candidates:
            overlap = False
            for s in selected:
                overlap_start = max(cand["start_time"], s["start_time"])
                overlap_end = min(cand["end_time"], s["end_time"])
                if overlap_end - overlap_start > 10.0:
                    overlap = True
                    break
            if not overlap:
                selected.append(cand)
            if len(selected) >= max_clips:
                break

        if not selected:
            return cls.chunk_sequentially(
                transcript_data, chunk_duration=min_duration + (max_duration - min_duration) / 2
            )

        return selected

    @classmethod
    def chunk_sequentially(
        cls,
        transcript_data: Dict[str, Any],
        chunk_duration: float = 30.0,
        overlap_seconds: float = 2.0,
        snap_to_boundaries: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Split video into sequential fixed-duration clips with intelligent word-boundary snapping.
        """
        segments = transcript_data.get("segments", [])
        total_duration = float(transcript_data.get("duration", 0.0))

        if not segments or total_duration <= 0:
            return []

        all_words = []
        for s in segments:
            for w in s.get("words", []):
                all_words.append(w)

        clips = []
        current_start = 0.0
        part_num = 1
        step_advance = max(5.0, chunk_duration - overlap_seconds)

        while current_start < total_duration - 3.0:
            target_end = min(total_duration, current_start + chunk_duration)

            if snap_to_boundaries and all_words:
                start_snapped = cls._snap_time_to_word(all_words, current_start, is_start=True, max_snap_distance=3.5)
                end_snapped = cls._snap_time_to_word(all_words, target_end, is_start=False, max_snap_distance=3.5)
                
                if end_snapped <= start_snapped + 5.0:
                    end_snapped = min(total_duration, start_snapped + chunk_duration)
            else:
                start_snapped = current_start
                end_snapped = target_end

            # Ensure start_snapped is monotonic
            if clips and start_snapped < clips[-1]["start_time"] + 5.0:
                start_snapped = clips[-1]["start_time"] + step_advance

            if end_snapped <= start_snapped + 4.0:
                end_snapped = min(total_duration, start_snapped + chunk_duration)

            if end_snapped - start_snapped < 6.0 and clips:
                clips[-1]["end_time"] = round(total_duration, 2)
                clips[-1]["duration"] = round(clips[-1]["end_time"] - clips[-1]["start_time"], 2)
                break

            clip_words = [
                w["word"] for w in all_words
                if w.get("start", 0) >= start_snapped and w.get("end", 0) <= end_snapped
            ]
            first_few = " ".join(clip_words[:6]) if clip_words else f"Segment {part_num}"

            clips.append({
                "title": f"Part {part_num}: {first_few}...",
                "start_time": round(start_snapped, 2),
                "end_time": round(end_snapped, 2),
                "virality_score": 75,
                "hook_sentence": first_few,
                "reasoning": f"Sequential clip segment (Part {part_num}) with natural speech boundary snapping.",
                "duration": round(end_snapped - start_snapped, 2)
            })

            part_num += 1
            current_start += step_advance

        return clips

    @staticmethod
    def _snap_time_to_word(
        words: List[Dict[str, Any]], target_time: float, is_start: bool, max_snap_distance: float = 3.5
    ) -> float:
        """Snap target time to closest word boundary within max_snap_distance."""
        if not words:
            return target_time

        best_diff = float("inf")
        best_time = target_time

        if is_start:
            for w in words:
                w_st = float(w.get("start", 0.0))
                diff = abs(w_st - target_time)
                if diff < best_diff:
                    best_diff = diff
                    best_time = w_st
        else:
            for w in words:
                w_en = float(w.get("end", 0.0))
                diff = abs(w_en - target_time)
                if w.get("word", "").endswith((".", "!", "?", ",")):
                    diff -= 0.5
                if diff < best_diff:
                    best_diff = diff
                    best_time = w_en

        if best_diff <= max_snap_distance:
            return best_time
        return target_time

    @classmethod
    def _validate_and_refine_clips(
        cls,
        clips: List[Dict[str, Any]],
        transcript_data: Dict[str, Any],
        min_duration: float,
        max_duration: float,
    ) -> List[Dict[str, Any]]:
        """Validate LLM output timestamps and refine boundary alignment."""
        total_duration = float(transcript_data.get("duration", 0.0))
        refined = []

        for clip in clips:
            try:
                start = float(clip.get("start_time", 0.0))
                end = float(clip.get("end_time", 0.0))

                start = max(0.0, min(start, total_duration - 5.0))
                end = max(start + 5.0, min(end, total_duration))
                dur = end - start

                if dur < 8.0:
                    continue

                if dur > max_duration + 15.0:
                    end = start + max_duration

                refined.append({
                    "title": clip.get("title", f"Clip at {int(start)}s"),
                    "start_time": round(start, 2),
                    "end_time": round(end, 2),
                    "virality_score": int(clip.get("virality_score", 85)),
                    "hook_sentence": clip.get("hook_sentence", ""),
                    "reasoning": clip.get("reasoning", "Selected by AI Viral Hook Analyzer."),
                    "duration": round(end - start, 2)
                })
            except Exception:
                continue

        return refined

    @staticmethod
    def _generate_title_from_text(hook: str, full: str) -> str:
        """Create a clean, punchy title from hook words."""
        clean = re.sub(r"[^\w\s]", "", hook).strip()
        words = clean.split()
        if len(words) >= 3:
            return " ".join(words[:6]).title()
        return "High Impact Moment"
