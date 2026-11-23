# Local AI Video Clipper & Repurposing Engine (100% Free & Self-Hosted)

A high-performance, zero-cost, fully offline video clipping and short-form repurposing engine (similar to Opus Clip, but running 100% locally on your own hardware).

---

## Key Features

- **Zero API Costs**: No OpenAI, no paid cloud transcription services, no cloud renderers. Runs 100% locally.
- **Hardware-Friendly**: Auto-detects NVIDIA CUDA GPU acceleration or runs multi-threaded on CPU via CTranslate2.
- **Speech-to-Text with Word Timestamps**: Powered by `faster-whisper` for 4x faster transcription with millisecond-precision word timestamps.
- **Dual Splitting Modes**:
  1. **AI Viral Hook Finder (Smart Mode)**: Analyzes timestamped transcripts using local Ollama (`llama3.2`, `qwen2.5`, `mistral`) with strict JSON schema output and intelligent heuristic fallback.
  2. **Sequential Chunker (Manual Mode)**: Slices videos into fixed duration chunks (30s, 45s, 60s) with smart word-boundary snapping to pauses or sentence endings.
- **FFmpeg Composite Pipeline**:
  - 9:16 Vertical Video conversion (crisp source centered over heavy Gaussian blurred background stack).
  - Horizontal mirror flip (`hflip`).
  - Zoom / punch-in (1.05x to 1.3x).
  - Color grading & equalizer (Saturation, Contrast, Brightness, Gamma).
  - Fine-grained playback speed multipliers (e.g. 1.05x, 1.1x) with synced audio tempo (`setpts` + `atempo`).
  - Native `.ass` karaoke subtitle burn-in.
- **Animated Karaoke Subtitles**:
  - **Hormozi / Punchy**: Extra bold uppercase, vibrant yellow highlight on active word, thick black outline.
  - **Beast Dynamic**: High-impact electric green active word with deep drop shadow.
  - **Minimal Clean**: Modern sans-serif typography with subtle outline.
  - **Cyberpunk Neon**: Glowing cyan and magenta text.
- **Modern Responsive Web Dashboard**: Dark theme glassmorphism UI with real-time SSE progress tracking, candidate clip ranking, interactive transcript viewer, in-browser video playback, and 1-click downloads.

---

## Directory Structure

```
Clipping Tool - Antigravity/
├── backend/
│   ├── config.py                 # Paths, hardware detection, subtitle presets & render defaults
│   ├── main.py                   # FastAPI REST API, background workers & SSE stream
│   └── services/
│       ├── downloader.py         # yt-dlp URL fetcher & local file ingestion
│       ├── transcriber.py        # faster-whisper STT engine with word timestamps
│       ├── analyzer.py           # Ollama LLM hook analyzer & sequential chunker
│       ├── subtitle_gen.py       # ASS dynamic karaoke subtitle generator
│       ├── ffmpeg_pipeline.py    # FFmpeg composite filtergraph builder & executor
│       └── job_manager.py        # Job state manager & real-time SSE broadcaster
│
├── frontend/
│   └── static/
│       ├── index.html            # Responsive dark mode dashboard
│       ├── css/
│       │   └── custom.css        # Glassmorphism styling and subtitle previews
│       └── js/
│           └── app.js            # Frontend orchestration, SSE listener & gallery
│
├── storage/
│   ├── raw_videos/               # Source video files
│   ├── transcripts/              # Cached word-level transcript JSON files
│   ├── subtitles/                # Generated .ass subtitle files
│   └── output_clips/             # Rendered 9:16 short-form MP4 videos
│
├── tests/
│   └── test_pipeline.py          # Automated unit and integration test suite
├── requirements.txt              # Project dependencies
├── start.py                      # One-click launcher with diagnostics
└── README.md
```

---

## Quick Start

### 1. Prerequisites
- Python 3.10+
- FFmpeg installed and available in system PATH.
- (Optional) [Ollama](https://ollama.com/) for AI Hook Analysis (`ollama run llama3.2` or `ollama run qwen2.5`). If Ollama is not installed or offline, the tool automatically uses an intelligent local heuristic hook analyzer.

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Launch the Application
Run the one-click launcher:
```bash
python start.py
```
Or start via Uvicorn directly:
```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
Open your browser at `http://127.0.0.1:8000`.

---

## API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `GET /api/status` | `GET` | System hardware, Ollama online status, and Whisper models. |
| `POST /api/process/url` | `POST` | Ingest and process a video URL (YouTube, Vimeo, etc.). |
| `POST /api/process/upload`| `POST` | Ingest and process a local video file upload (`multipart/form-data`). |
| `POST /api/render-clip` | `POST` | Render an individual clip with custom filters, speed, and subtitle style. |
| `POST /api/batch-render` | `POST` | Batch render all identified clips for a job. |
| `GET /api/jobs/events` | `GET` | Server-Sent Events (SSE) live progress stream. |
| `GET /api/clips` | `GET` | List all rendered 9:16 MP4 clips in the output gallery. |
| `DELETE /api/clips/{filename}` | `DELETE` | Delete a rendered clip. |

---

## Running Tests

Run the comprehensive unit and integration test suite:
```bash
python tests/test_pipeline.py
```
This tests ASS subtitle generation, keyword/speech rate heuristic hook analysis, sequential boundary snapping, and synthetic FFmpeg 9:16 rendering.
