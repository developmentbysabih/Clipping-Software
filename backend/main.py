"""
FastAPI Backend Application for Local AI Video Clipper & Repurposing Engine.
Zero API Costs, 100% Offline & Local Execution.
"""
import os
import sys
import json
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.config import (
    BASE_DIR,
    STORAGE_DIR,
    RAW_VIDEOS_DIR,
    OUTPUT_CLIPS_DIR,
    DEVICE,
    COMPUTE_TYPE,
    DEFAULT_WHISPER_MODEL,
    AVAILABLE_WHISPER_MODELS,
    OLLAMA_HOST,
    DEFAULT_OLLAMA_MODEL,
    AVAILABLE_OLLAMA_MODELS,
    SUBTITLE_PRESETS,
    DEFAULT_RENDER_CONFIG,
)
from backend.services.downloader import VideoDownloader, get_video_metadata
from backend.services.transcriber import VideoTranscriber
from backend.services.analyzer import VideoAnalyzer, check_ollama_status
from backend.services.subtitle_gen import SubtitleGenerator
from backend.services.ffmpeg_pipeline import FFmpegPipeline
from backend.services.job_manager import JobManager

# Initialize FastAPI App
app = FastAPI(
    title="Local AI Video Clipper Engine",
    description="100% Free, Local Short-Form Video Repurposing Tool",
    version="1.0.0"
)

# Enable CORS for local cross-origin development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Static and Storage Folders
STATIC_DIR = BASE_DIR / "frontend" / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
(STATIC_DIR / "css").mkdir(parents=True, exist_ok=True)
(STATIC_DIR / "js").mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")


# ==========================================
# Pydantic Request Models
# ==========================================

class IngestUrlRequest(BaseModel):
    url: str
    whisper_model: str = DEFAULT_WHISPER_MODEL
    clipping_mode: str = "ai_hook"  # "ai_hook", "sequential", or "live_peaks"
    ollama_model: str = DEFAULT_OLLAMA_MODEL
    min_clip_duration: float = 20.0
    max_clip_duration: float = 60.0
    sequential_duration: float = 30.0
    sequential_overlap: float = 2.0
    snap_boundaries: bool = True
    auto_render: bool = False
    is_live_stream: bool = False
    render_options: Optional[Dict[str, Any]] = None


class AnalyzeRequest(BaseModel):
    video_id: str
    clipping_mode: str = "ai_hook"
    ollama_model: str = DEFAULT_OLLAMA_MODEL
    min_clip_duration: float = 20.0
    max_clip_duration: float = 60.0
    sequential_duration: float = 30.0
    sequential_overlap: float = 2.0
    snap_boundaries: bool = True


class RenderClipRequest(BaseModel):
    video_id: str
    clip_index: int = 0
    start_time: float
    end_time: float
    title: str = "Viral Clip"
    subtitle_preset: str = "hormozi"
    custom_subtitle_options: Optional[Dict[str, Any]] = None
    render_options: Optional[Dict[str, Any]] = None


class BatchRenderRequest(BaseModel):
    job_id: str
    clip_indices: Optional[List[int]] = None
    subtitle_preset: str = "hormozi"
    render_options: Optional[Dict[str, Any]] = None


# ==========================================
# Background Processing Pipelines
# ==========================================

async def run_full_pipeline_task(job_id: str, request_data: IngestUrlRequest, source_file: Optional[Path] = None):
    """Orchestrates full ingestion -> transcription -> analysis -> optional auto-render."""
    try:
        JobManager.update_job(
            job_id,
            status="running",
            stage="ingestion",
            progress=5.0,
            message="Ingesting source video..."
        )

        # 1. Ingestion
        if source_file:
            meta = get_video_metadata(source_file)
            video_info = {
                "id": job_id,
                "title": source_file.stem,
                "file_path": str(source_file),
                "duration": meta.get("duration", 0),
                "width": meta.get("width", 0),
                "height": meta.get("height", 0),
                "fps": meta.get("fps", 30.0),
                "author": "Local Upload",
                "source_url": "",
                "is_vertical": meta.get("is_vertical", False),
            }
        else:
            def dl_cb(d):
                dl_pct = float(d.get("percent", 0.0))
                overall_pct = min(25.0, 5.0 + (dl_pct * 0.2))
                msg = d.get("message", f"Downloading video from URL ({dl_pct:.1f}%)...")
                JobManager.update_job(
                    job_id,
                    stage="downloading",
                    progress=overall_pct,
                    message=msg
                )

            # Download using yt-dlp in a thread pool
            loop = asyncio.get_event_loop()
            video_info = await loop.run_in_executor(
                None,
                lambda: VideoDownloader.download_url(
                    request_data.url,
                    progress_callback=dl_cb
                )
            )

        JobManager.update_job(
            job_id,
            stage="transcription",
            progress=25.0,
            message="Loading faster-whisper STT model & extracting 16kHz audio...",
            video_metadata=video_info
        )

        # 2. Transcription
        def transcribe_cb(d):
            pct = 25.0 + (d.get("percent", 0.0) * 0.45)
            JobManager.update_job(
                job_id,
                stage="transcription",
                progress=round(pct, 1),
                message=d.get("message", "Transcribing speech...")
            )

        loop = asyncio.get_event_loop()
        transcript_data = await loop.run_in_executor(
            None,
            lambda: VideoTranscriber.transcribe(
                video_path=video_info["file_path"],
                video_id=video_info["id"],
                model_size=request_data.whisper_model,
                progress_callback=transcribe_cb
            )
        )

        JobManager.update_job(
            job_id,
            stage="analyzing",
            progress=75.0,
            message="Analyzing transcript for viral hooks and segment boundaries...",
            transcript=transcript_data
        )

        # 3. Clip Segmentation & Hook Analysis
        is_live_target = bool(request_data.is_live_stream or video_info.get("is_live_stream") or request_data.clipping_mode == "live_peaks")

        if request_data.clipping_mode == "sequential":
            clips = VideoAnalyzer.chunk_sequentially(
                transcript_data=transcript_data,
                chunk_duration=request_data.sequential_duration,
                overlap_seconds=request_data.sequential_overlap,
                snap_to_boundaries=request_data.snap_boundaries
            )
        elif is_live_target or float(transcript_data.get("duration", 0.0)) > 900.0:
            clips = VideoAnalyzer.analyze_livestream_peaks(
                transcript_data=transcript_data,
                min_duration=request_data.min_clip_duration,
                max_duration=request_data.max_clip_duration,
                max_clips=8
            )
        else:
            clips = VideoAnalyzer.analyze_viral_hooks_ollama(
                transcript_data=transcript_data,
                model_name=request_data.ollama_model,
                min_duration=request_data.min_clip_duration,
                max_duration=request_data.max_clip_duration,
                max_clips=6
            )

        JobManager.update_job(
            job_id,
            stage="ready",
            progress=100.0,
            message=f"Analysis complete! Identified {len(clips)} candidate clips.",
            clips=clips,
            status="completed"
        )

        # 4. Optional Auto-Render
        if request_data.auto_render and clips:
            await run_batch_render_task(
                job_id=job_id,
                clip_indices=list(range(len(clips))),
                subtitle_preset=request_data.render_options.get("subtitle_preset", "hormozi") if request_data.render_options else "hormozi",
                render_options=request_data.render_options
            )

    except Exception as e:
        import traceback
        traceback.print_exc()
        JobManager.update_job(
            job_id,
            status="failed",
            stage="error",
            progress=0.0,
            message=f"Pipeline error: {str(e)}",
            error=str(e)
        )


async def run_batch_render_task(
    job_id: str,
    clip_indices: Optional[List[int]] = None,
    subtitle_preset: str = "hormozi",
    render_options: Optional[Dict[str, Any]] = None,
):
    """Render one or multiple clips for an existing job."""
    try:
        job = JobManager.get_job(job_id)
        if not job:
            return

        video_info = job.get("video_metadata", {})
        transcript = job.get("transcript", {})
        clips = job.get("clips", [])
        source_video = Path(video_info.get("file_path", ""))

        if not source_video.exists() or not clips:
            JobManager.update_job(job_id, error="Source video or clips not found")
            return

        target_indices = clip_indices if clip_indices is not None else list(range(len(clips)))
        rendered_outputs = list(job.get("rendered_clips", []))
        total_clips = len(target_indices)

        words = SubtitleGenerator.get_all_words_from_transcript(transcript)

        for step_idx, idx in enumerate(target_indices):
            if idx < 0 or idx >= len(clips):
                continue
            
            clip = clips[idx]
            c_start = float(clip["start_time"])
            c_end = float(clip["end_time"])
            c_title = clip.get("title", f"Clip_{idx+1}")

            JobManager.update_job(
                job_id,
                status="rendering",
                stage="rendering",
                progress=round((step_idx / total_clips) * 100.0, 1),
                message=f"Rendering clip {step_idx+1} of {total_clips}: '{c_title}'..."
            )

            # 1. Generate ASS Subtitles
            sub_file = SubtitleGenerator.generate_ass(
                words=words,
                clip_start=c_start,
                clip_end=c_end,
                preset_name=subtitle_preset,
                custom_options=render_options.get("custom_subtitle_options") if render_options else None
            )

            # 2. Render Video with FFmpeg
            opts = dict(DEFAULT_RENDER_CONFIG)
            if render_options:
                opts.update(render_options)
            opts["subtitle_preset"] = subtitle_preset

            out_clip_name = f"clip_{job_id}_{idx+1}_{int(c_start)}_{int(c_end)}.mp4"
            out_clip_path = OUTPUT_CLIPS_DIR / out_clip_name

            def render_cb(d):
                clip_pct = d.get("percent", 0.0)
                overall_pct = ((step_idx + (clip_pct / 100.0)) / total_clips) * 100.0
                JobManager.update_job(
                    job_id,
                    stage="rendering",
                    progress=round(overall_pct, 1),
                    message=f"Rendering clip {step_idx+1}/{total_clips} ({round(clip_pct, 1)}%)..."
                )

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: FFmpegPipeline.render_clip(
                    source_video=source_video,
                    start_time=c_start,
                    end_time=c_end,
                    output_file=out_clip_path,
                    subtitle_path=sub_file,
                    render_options=opts,
                    progress_callback=render_cb
                )
            )

            # 3. Generate Thumbnail
            thumb_name = f"thumb_{job_id}_{idx+1}.jpg"
            thumb_path = OUTPUT_CLIPS_DIR / thumb_name
            try:
                FFmpegPipeline.generate_thumbnail(out_clip_path, thumb_path, timestamp=0.5)
            except Exception:
                pass

            clip_record = {
                "clip_id": f"{job_id}_{idx+1}",
                "job_id": job_id,
                "title": c_title,
                "virality_score": clip.get("virality_score", 85),
                "hook_type": clip.get("hook_type", "Curiosity Hook"),
                "reasoning": clip.get("reasoning", ""),
                "hashtags": clip.get("hashtags", ["#Shorts", "#Viral", "#Fyp"]),
                "caption_idea": clip.get("caption_idea", ""),
                "start_time": c_start,
                "end_time": c_end,
                "duration": round(c_end - c_start, 2),
                "file_path": str(out_clip_path),
                "url": f"/storage/output_clips/{out_clip_name}",
                "thumbnail_url": f"/storage/output_clips/{thumb_name}" if thumb_path.exists() else "",
                "subtitle_preset": subtitle_preset,
            }

            # Replace or append
            rendered_outputs = [r for r in rendered_outputs if r["clip_id"] != clip_record["clip_id"]]
            rendered_outputs.append(clip_record)

            JobManager.update_job(
                job_id,
                rendered_clips=rendered_outputs
            )

        JobManager.update_job(
            job_id,
            status="completed",
            stage="complete",
            progress=100.0,
            message=f"All {total_clips} clips rendered successfully!",
            rendered_clips=rendered_outputs
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        JobManager.update_job(
            job_id,
            status="failed",
            stage="error",
            message=f"Render error: {str(e)}",
            error=str(e)
        )


# ==========================================
# REST API Endpoints
# ==========================================

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Serve main frontend web dashboard."""
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Local AI Video Clipper Dashboard</h1><p>Frontend static files loading...</p>")


@app.get("/api/status")
async def get_system_status():
    """Returns local system hardware, whisper models, and Ollama status."""
    ollama_info = check_ollama_status()
    return {
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "whisper": {
            "default_model": DEFAULT_WHISPER_MODEL,
            "available_models": AVAILABLE_WHISPER_MODELS,
        },
        "ollama": ollama_info,
        "subtitle_presets": SUBTITLE_PRESETS,
        "default_render_config": DEFAULT_RENDER_CONFIG,
    }


@app.post("/api/test-ollama")
async def test_ollama_endpoint(host: str = OLLAMA_HOST):
    """Test connection to a specific Ollama instance."""
    status = check_ollama_status(host)
    return status


@app.post("/api/process/url")
async def process_url_video(request: IngestUrlRequest, background_tasks: BackgroundTasks):
    """Ingest and process a video from URL."""
    job_id = JobManager.create_job(job_type="url_process")
    background_tasks.add_task(run_full_pipeline_task, job_id, request, None)
    return {"job_id": job_id, "status": "started", "message": "Video processing queued."}


@app.post("/api/process/upload")
async def process_upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    whisper_model: str = Form(DEFAULT_WHISPER_MODEL),
    clipping_mode: str = Form("ai_hook"),
    ollama_model: str = Form(DEFAULT_OLLAMA_MODEL),
    min_clip_duration: float = Form(20.0),
    max_clip_duration: float = Form(60.0),
    sequential_duration: float = Form(30.0),
    sequential_overlap: float = Form(2.0),
    snap_boundaries: bool = Form(True),
    auto_render: bool = Form(False),
):
    """Ingest and process a local video file upload."""
    job_id = JobManager.create_job(job_type="upload_process")
    
    # Save uploaded file
    upload_result = VideoDownloader.handle_local_upload(file.file, file.filename)
    saved_path = Path(upload_result["file_path"])

    req_data = IngestUrlRequest(
        url="",
        whisper_model=whisper_model,
        clipping_mode=clipping_mode,
        ollama_model=ollama_model,
        min_clip_duration=min_clip_duration,
        max_clip_duration=max_clip_duration,
        sequential_duration=sequential_duration,
        sequential_overlap=sequential_overlap,
        snap_boundaries=snap_boundaries,
        auto_render=auto_render
    )

    background_tasks.add_task(run_full_pipeline_task, job_id, req_data, saved_path)
    return {"job_id": job_id, "status": "started", "video_info": upload_result}


@app.post("/api/render-clip")
async def render_single_clip(req: RenderClipRequest, background_tasks: BackgroundTasks):
    """Render a single clip on demand."""
    job = JobManager.get_job(req.video_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    background_tasks.add_task(
        run_batch_render_task,
        job_id=req.video_id,
        clip_indices=[req.clip_index],
        subtitle_preset=req.subtitle_preset,
        render_options=req.render_options
    )
    return {"status": "rendering_started", "job_id": req.video_id, "clip_index": req.clip_index}


@app.post("/api/batch-render")
async def batch_render_clips(req: BatchRenderRequest, background_tasks: BackgroundTasks):
    """Render multiple or all clips for a job."""
    job = JobManager.get_job(req.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    background_tasks.add_task(
        run_batch_render_task,
        job_id=req.job_id,
        clip_indices=req.clip_indices,
        subtitle_preset=req.subtitle_preset,
        render_options=req.render_options
    )
    return {"status": "batch_render_started", "job_id": req.job_id}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Favicon endpoint to avoid 404 in browser."""
    from fastapi.responses import Response
    return Response(status_code=204)


@app.get("/api/jobs/events")
async def sse_job_events(request: Request):
    """Server-Sent Events (SSE) live progress stream."""
    queue = JobManager.subscribe()

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    # Send keep-alive heartbeat
                    yield ": ping\n\n"
        finally:
            JobManager.unsubscribe(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/jobs")
async def list_all_jobs():
    """List recent jobs."""
    return JobManager.list_jobs()


@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get complete status, transcript, and clips for a job."""
    job = JobManager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/clips")
async def list_rendered_clips():
    """List all finished clips in output directory."""
    clips = []
    for f in OUTPUT_CLIPS_DIR.glob("*.mp4"):
        thumb = OUTPUT_CLIPS_DIR / f"{f.stem}.jpg"
        if not thumb.exists():
            thumb = OUTPUT_CLIPS_DIR / f"thumb_{f.stem}.jpg"

        meta = get_video_metadata(f)
        clips.append({
            "filename": f.name,
            "url": f"/storage/output_clips/{f.name}",
            "thumbnail_url": f"/storage/output_clips/{thumb.name}" if thumb.exists() else "",
            "size": meta.get("size", f.stat().st_size),
            "duration": meta.get("duration", 0),
            "width": meta.get("width", 1080),
            "height": meta.get("height", 1920),
            "modified": f.stat().st_mtime
        })
    clips.sort(key=lambda x: x["modified"], reverse=True)
    return clips


@app.delete("/api/clips/{filename}")
async def delete_clip(filename: str):
    """Delete a rendered clip."""
    safe_name = os.path.basename(filename)
    clip_path = OUTPUT_CLIPS_DIR / safe_name
    if clip_path.exists():
        os.remove(clip_path)
        # remove thumbnail if exists
        thumb_path = OUTPUT_CLIPS_DIR / f"{clip_path.stem}.jpg"
        if thumb_path.exists():
            os.remove(thumb_path)
        return {"status": "deleted", "filename": safe_name}
    raise HTTPException(status_code=404, detail="Clip not found")
