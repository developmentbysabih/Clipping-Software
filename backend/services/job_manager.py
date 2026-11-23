"""
Background Job Manager and SSE Event Broadcaster.
Coordinates async tasks, stage progression, and real-time frontend updates.
"""
import os
import json
import uuid
import time
import asyncio
from pathlib import Path
from typing import Dict, Any, List, Optional, Set

from backend.config import STORAGE_DIR


class JobManager:
    """Manages application jobs and SSE subscriptions."""

    _jobs: Dict[str, Dict[str, Any]] = {}
    _listeners: Set[asyncio.Queue] = set()

    @classmethod
    def create_job(cls, job_type: str = "full_process") -> str:
        """Create a new job and return its unique ID."""
        job_id = str(uuid.uuid4())[:10]
        job_record = {
            "id": job_id,
            "type": job_type,
            "status": "pending",
            "stage": "initialized",
            "progress": 0.0,
            "message": "Job created. Waiting to start...",
            "created_at": time.time(),
            "updated_at": time.time(),
            "video_metadata": {},
            "transcript": {},
            "clips": [],
            "rendered_clips": [],
            "error": None
        }
        cls._jobs[job_id] = job_record
        cls._save_job_state(job_id)
        cls._broadcast(job_record)
        return job_id

    @classmethod
    def get_job(cls, job_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve job data."""
        if job_id in cls._jobs:
            return cls._jobs[job_id]
        
        # Check disk cache
        job_file = STORAGE_DIR / "jobs" / f"{job_id}.json"
        if job_file.exists():
            try:
                with open(job_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    cls._jobs[job_id] = data
                    return data
            except Exception:
                pass
        return None

    @classmethod
    def list_jobs(cls) -> List[Dict[str, Any]]:
        """List all active and recent jobs."""
        return sorted(cls._jobs.values(), key=lambda x: x.get("created_at", 0), reverse=True)

    @classmethod
    def update_job(
        cls,
        job_id: str,
        status: Optional[str] = None,
        stage: Optional[str] = None,
        progress: Optional[float] = None,
        message: Optional[str] = None,
        video_metadata: Optional[Dict[str, Any]] = None,
        transcript: Optional[Dict[str, Any]] = None,
        clips: Optional[List[Dict[str, Any]]] = None,
        rendered_clips: Optional[List[Dict[str, Any]]] = None,
        error: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update job fields and notify SSE listeners."""
        if job_id not in cls._jobs:
            return None

        job = cls._jobs[job_id]
        job["updated_at"] = time.time()

        if status is not None:
            job["status"] = status
        if stage is not None:
            job["stage"] = stage
        if progress is not None:
            job["progress"] = round(float(progress), 1)
        if message is not None:
            job["message"] = message
        if video_metadata is not None:
            job["video_metadata"].update(video_metadata)
        if transcript is not None:
            job["transcript"] = transcript
        if clips is not None:
            job["clips"] = clips
        if rendered_clips is not None:
            job["rendered_clips"] = rendered_clips
        if error is not None:
            job["error"] = error
            job["status"] = "failed"

        cls._save_job_state(job_id)
        cls._broadcast(job)
        return job

    @classmethod
    def _save_job_state(cls, job_id: str):
        """Persist job status to disk."""
        try:
            jobs_dir = STORAGE_DIR / "jobs"
            jobs_dir.mkdir(parents=True, exist_ok=True)
            job_file = jobs_dir / f"{job_id}.json"
            with open(job_file, "w", encoding="utf-8") as f:
                json.dump(cls._jobs[job_id], f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    @classmethod
    def subscribe(cls) -> asyncio.Queue:
        """Register an SSE subscriber queue."""
        q = asyncio.Queue()
        cls._listeners.add(q)
        return q

    @classmethod
    def unsubscribe(cls, q: asyncio.Queue):
        """Remove an SSE subscriber queue."""
        if q in cls._listeners:
            cls._listeners.remove(q)

    @classmethod
    def _broadcast(cls, job_data: Dict[str, Any]):
        """Push update payload to all active SSE subscribers."""
        payload = json.dumps(job_data)
        for q in list(cls._listeners):
            try:
                q.put_nowait(payload)
            except Exception:
                cls._listeners.discard(q)
