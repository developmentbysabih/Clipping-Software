"""
Speech-to-Text Transcription Service using faster-whisper.
Extracts high-precision word-level timestamps with local CTranslate2 execution.
"""
import os
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

from faster_whisper import WhisperModel

from backend.config import (
    TRANSCRIPTS_DIR,
    TEMP_DIR,
    DEVICE,
    COMPUTE_TYPE,
    DEFAULT_WHISPER_MODEL,
    AVAILABLE_WHISPER_MODELS,
)


class VideoTranscriber:
    """Handles speech-to-text transcription with word-level timestamps."""

    _models: Dict[str, WhisperModel] = {}

    @classmethod
    def get_model(
        cls,
        model_size: str = DEFAULT_WHISPER_MODEL,
        device: Optional[str] = None,
        compute_type: Optional[str] = None
    ) -> WhisperModel:
        """Cache and retrieve WhisperModel instance."""
        target_device = device or DEVICE
        target_compute = compute_type or COMPUTE_TYPE
        cache_key = f"{model_size}_{target_device}_{target_compute}"

        if cache_key not in cls._models:
            print(f"[Transcriber] Loading faster-whisper model '{model_size}' on {target_device} ({target_compute})...")
            cls._models[cache_key] = WhisperModel(
                model_size,
                device=target_device,
                compute_type=target_compute,
                download_root=str(TEMP_DIR / "whisper_models")
            )
        return cls._models[cache_key]

    @staticmethod
    def extract_audio(video_path: Path, output_wav: Path) -> Path:
        """Extract 16kHz mono WAV audio from video using FFmpeg for optimal Whisper performance."""
        output_wav.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(video_path),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            str(output_wav)
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return output_wav

    @classmethod
    def transcribe(
        cls,
        video_path: str,
        video_id: str,
        model_size: str = DEFAULT_WHISPER_MODEL,
        language: Optional[str] = None,
        force_recompute: bool = False,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> Dict[str, Any]:
        """
        Transcribe video file and return structured JSON with word timestamps.
        Caches results on disk.
        """
        cache_file = TRANSCRIPTS_DIR / f"{video_id}_{model_size}_transcript.json"

        # Return cached transcript if available
        if cache_file.exists() and not force_recompute:
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)
                if cached_data.get("segments") and len(cached_data["segments"]) > 0:
                    if progress_callback:
                        progress_callback({
                            "stage": "transcription",
                            "percent": 100.0,
                            "message": "Loaded cached transcript"
                        })
                    return cached_data
            except Exception:
                pass

        video_file = Path(video_path)
        if not video_file.exists():
            raise FileNotFoundError(f"Video file not found: {video_path}")

        if progress_callback:
            progress_callback({
                "stage": "transcription",
                "percent": 10.0,
                "message": f"Extracting audio and loading Whisper '{model_size}' model..."
            })

        temp_wav = TEMP_DIR / f"{video_id}_audio.wav"
        try:
            cls.extract_audio(video_file, temp_wav)
            audio_source = str(temp_wav)
        except Exception:
            # Fallback to direct video path if audio extraction fails
            audio_source = str(video_file)

        model = cls.get_model(model_size=model_size)

        if progress_callback:
            progress_callback({
                "stage": "transcription",
                "percent": 30.0,
                "message": "Generating word-level speech timestamps..."
            })

        # Run transcription with word timestamps enabled
        segments_gen, info = model.transcribe(
            audio_source,
            language=language,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
            beam_size=5,
        )

        segments: List[Dict[str, Any]] = []
        full_text_parts: List[str] = []
        total_duration = info.duration if info.duration > 0 else 1.0

        for seg_idx, segment in enumerate(segments_gen):
            words_list = []
            if segment.words:
                for w in segment.words:
                    words_list.append({
                        "word": w.word.strip(),
                        "start": round(w.start, 3),
                        "end": round(w.end, 3),
                        "probability": round(w.probability, 3)
                    })

            seg_dict = {
                "id": seg_idx,
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
                "words": words_list
            }
            segments.append(seg_dict)
            full_text_parts.append(segment.text.strip())

            if progress_callback and total_duration > 0:
                current_percent = min(95.0, 30.0 + (segment.end / total_duration) * 65.0)
                progress_callback({
                    "stage": "transcription",
                    "percent": round(current_percent, 1),
                    "message": f"Transcribing ({round(segment.end, 1)}s / {round(total_duration, 1)}s)..."
                })

        # Cleanup temp audio
        if temp_wav.exists():
            try:
                os.remove(temp_wav)
            except Exception:
                pass

        result_data = {
            "video_id": video_id,
            "model": model_size,
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
            "duration": round(info.duration, 2),
            "text": " ".join(full_text_parts),
            "segments": segments,
            "total_words": sum(len(s.get("words", [])) for s in segments)
        }

        # Save to disk
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(result_data, f, indent=2, ensure_ascii=False)

        if progress_callback:
            progress_callback({
                "stage": "transcription",
                "percent": 100.0,
                "message": f"Transcription complete! Found {len(segments)} segments, {result_data['total_words']} words."
            })

        return result_data
