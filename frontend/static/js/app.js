/**
 * Local AI Video Clipper & Repurposing Engine - Frontend Dashboard Logic
 */

// Application State
const state = {
  currentJobId: null,
  activeTab: 'url',
  selectedPreset: 'hormozi',
  selectedFile: null,
  systemStatus: null,
  jobData: null,
};

// DOM Elements
const elements = {
  deviceVal: document.getElementById('device-val'),
  ollamaVal: document.getElementById('ollama-val'),
  ollamaDot: document.getElementById('ollama-dot'),
  tabBtnUrl: document.getElementById('tab-btn-url'),
  tabBtnUpload: document.getElementById('tab-btn-upload'),
  tabContentUrl: document.getElementById('tab-content-url'),
  tabContentUpload: document.getElementById('tab-content-upload'),
  inputUrl: document.getElementById('input-url'),
  inputFile: document.getElementById('input-file'),
  dropzone: document.getElementById('dropzone'),
  fileNameDisplay: document.getElementById('file-name-display'),
  selectWhisperModel: document.getElementById('select-whisper-model'),
  selectOllamaModel: document.getElementById('select-ollama-model'),
  inputMinDur: document.getElementById('input-min-dur'),
  inputMaxDur: document.getElementById('input-max-dur'),
  inputSeqDur: document.getElementById('input-seq-dur'),
  inputSeqOverlap: document.getElementById('input-seq-overlap'),
  checkSnap: document.getElementById('check-snap'),
  aiModeOptions: document.getElementById('ai-mode-options'),
  seqModeOptions: document.getElementById('sequential-mode-options'),
  btnStartProcess: document.getElementById('btn-start-process'),
  btnBatchRender: document.getElementById('btn-batch-render'),
  btnRefreshGallery: document.getElementById('btn-refresh-gallery'),
  sectionProgress: document.getElementById('section-progress'),
  progressStageTitle: document.getElementById('progress-stage-title'),
  progressMessage: document.getElementById('progress-message'),
  progressPercent: document.getElementById('progress-percent'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  stepIngest: document.getElementById('step-ingest'),
  stepTranscribe: document.getElementById('step-transcribe'),
  stepAnalyze: document.getElementById('step-analyze'),
  stepRender: document.getElementById('step-render'),
  sectionClips: document.getElementById('section-clips'),
  clipsGrid: document.getElementById('clips-grid'),
  sectionGallery: document.getElementById('section-gallery'),
  galleryGrid: document.getElementById('gallery-grid'),
  galleryEmpty: document.getElementById('gallery-empty'),
  sectionTranscript: document.getElementById('section-transcript'),
  transcriptContainer: document.getElementById('transcript-container'),
  inputSearchTranscript: document.getElementById('input-search-transcript'),
  subMockup: document.getElementById('sub-mockup'),
  mockupActiveWord: document.getElementById('mockup-active-word'),
  rangeSpeed: document.getElementById('range-speed'),
  valSpeed: document.getElementById('val-speed'),
  rangeZoom: document.getElementById('range-zoom'),
  valZoom: document.getElementById('val-zoom'),
  rangeSat: document.getElementById('range-sat'),
  valSat: document.getElementById('val-sat'),
  checkBlurStack: document.getElementById('check-blur-stack'),
  checkHflip: document.getElementById('check-hflip'),
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    lucide.createIcons();
  }
  initSystemStatus();
  initEventListeners();
  initSSE();
  checkActiveJobs();
  loadGallery();
});

// Fetch system info (Hardware, Ollama status, Whisper models)
async function initSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.systemStatus = data;

    // Device Badge
    const isCuda = data.device === 'cuda';
    elements.deviceVal.textContent = isCuda ? 'NVIDIA CUDA (Fast)' : 'CPU (Optimized)';
    elements.deviceVal.className = isCuda ? 'text-emerald-400 font-bold' : 'text-slate-200 font-bold';

    // Ollama Status
    const ollama = data.ollama;
    if (ollama && ollama.online) {
      elements.ollamaVal.textContent = `Online (${ollama.models.length} models)`;
      elements.ollamaVal.className = 'text-emerald-400 font-bold';
      elements.ollamaDot.className = 'w-2 h-2 rounded-full bg-emerald-400';

      // Populate Ollama models
      if (ollama.models && ollama.models.length > 0) {
        elements.selectOllamaModel.innerHTML = '';
        ollama.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          elements.selectOllamaModel.appendChild(opt);
        });
      }
    } else {
      elements.ollamaVal.textContent = 'Offline (Heuristics Fallback Active)';
      elements.ollamaVal.className = 'text-amber-400 font-medium';
      elements.ollamaDot.className = 'w-2 h-2 rounded-full bg-amber-400';
    }
  } catch (err) {
    console.error('Failed to load system status:', err);
    elements.deviceVal.textContent = 'CPU';
    elements.ollamaVal.textContent = 'Heuristic Mode';
  }
}

let pollTimer = null;

function startJobPolling(jobId) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!state.currentJobId || state.currentJobId !== jobId) {
      clearInterval(pollTimer);
      return;
    }
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const job = await res.json();
        handleJobUpdate(job);
        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(pollTimer);
        }
      }
    } catch (e) {
      // Ignore transient errors
    }
  }, 800);
}

// Check for recent or active running jobs on page load
async function checkActiveJobs() {
  try {
    const res = await fetch('/api/jobs');
    if (res.ok) {
      const jobs = await res.json();
      if (jobs && jobs.length > 0) {
        const latestJob = jobs[0];
        // If the latest job is running or recently finished, display it
        if (latestJob.status === 'running' || latestJob.status === 'rendering') {
          state.currentJobId = latestJob.id;
          elements.sectionProgress.classList.remove('hidden');
          handleJobUpdate(latestJob);
          startJobPolling(latestJob.id);
        } else if (latestJob.status === 'completed' && latestJob.clips && latestJob.clips.length > 0) {
          state.currentJobId = latestJob.id;
          handleJobUpdate(latestJob);
        }
      }
    }
  } catch (e) {
    console.error('Failed to check active jobs:', e);
  }
}

// Connect to Server-Sent Events stream for live progress
function initSSE() {
  if (window._sseSource) {
    window._sseSource.close();
  }
  const evtSource = new EventSource('/api/jobs/events');
  window._sseSource = evtSource;

  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (!data || !data.id) return;
      if (!state.currentJobId || state.currentJobId === data.id) {
        state.currentJobId = data.id;
        handleJobUpdate(data);
      }
    } catch (e) {
      // Keepalive ping
    }
  };

  evtSource.onerror = () => {
    // Reconnects automatically
  };
}

// Setup Event Listeners
function initEventListeners() {
  // Tab Switching
  elements.tabBtnUrl.addEventListener('click', () => switchTab('url'));
  elements.tabBtnUpload.addEventListener('click', () => switchTab('upload'));

  // Clipping Mode Radios
  document.querySelectorAll('input[name="clipping_mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'ai_hook') {
        elements.aiModeOptions.classList.remove('hidden');
        elements.seqModeOptions.classList.add('hidden');
      } else {
        elements.aiModeOptions.classList.add('hidden');
        elements.seqModeOptions.classList.remove('hidden');
      }
    });
  });

  // Drag & Drop File Upload
  elements.dropzone.addEventListener('click', () => elements.inputFile.click());
  elements.inputFile.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  elements.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropzone.classList.add('border-indigo-500', 'bg-indigo-950/20');
  });

  elements.dropzone.addEventListener('dragleave', () => {
    elements.dropzone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
  });

  elements.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropzone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  // Subtitle Preset Buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.remove('border-indigo-500', 'bg-indigo-950/30');
        b.classList.add('border-slate-700', 'bg-slate-900/60');
      });
      btn.classList.remove('border-slate-700', 'bg-slate-900/60');
      btn.classList.add('border-indigo-500', 'bg-indigo-950/30');
      state.selectedPreset = btn.dataset.preset;
      updateSubtitleMockup(state.selectedPreset);
    });
  });

  // Fine-Tuning Sliders
  elements.rangeSpeed.addEventListener('input', (e) => {
    elements.valSpeed.textContent = `${parseFloat(e.target.value).toFixed(2)}x`;
  });
  elements.rangeZoom.addEventListener('input', (e) => {
    elements.valZoom.textContent = `${parseFloat(e.target.value).toFixed(2)}x`;
  });
  elements.rangeSat.addEventListener('input', (e) => {
    elements.valSat.textContent = `${parseFloat(e.target.value).toFixed(2)}x`;
  });

  // Action Buttons
  elements.btnStartProcess.addEventListener('click', startPipeline);
  elements.btnBatchRender.addEventListener('click', batchRenderAll);
  elements.btnRefreshGallery.addEventListener('click', loadGallery);

  // Transcript Search
  elements.inputSearchTranscript.addEventListener('input', (e) => {
    filterTranscript(e.target.value);
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  if (tab === 'url') {
    elements.tabBtnUrl.className = 'px-3 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white shadow transition-all flex items-center gap-1.5';
    elements.tabBtnUpload.className = 'px-3 py-1 text-xs font-medium rounded-md text-slate-400 hover:text-white transition-all flex items-center gap-1.5';
    elements.tabContentUrl.classList.remove('hidden');
    elements.tabContentUpload.classList.add('hidden');
  } else {
    elements.tabBtnUpload.className = 'px-3 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white shadow transition-all flex items-center gap-1.5';
    elements.tabBtnUrl.className = 'px-3 py-1 text-xs font-medium rounded-md text-slate-400 hover:text-white transition-all flex items-center gap-1.5';
    elements.tabContentUpload.classList.remove('hidden');
    elements.tabContentUrl.classList.add('hidden');
  }
}

function handleFileSelected(file) {
  state.selectedFile = file;
  elements.fileNameDisplay.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
  elements.fileNameDisplay.classList.remove('hidden');
}

function updateSubtitleMockup(preset) {
  elements.subMockup.className = 'py-2 text-base font-bold tracking-wide transition-all';
  if (preset === 'hormozi') {
    elements.subMockup.classList.add('sub-hormozi');
    elements.mockupActiveWord.className = 'text-yellow-400 scale-105 inline-block';
  } else if (preset === 'beast') {
    elements.subMockup.classList.add('sub-beast');
    elements.mockupActiveWord.className = 'text-emerald-400 scale-110 inline-block';
  } else if (preset === 'minimal') {
    elements.subMockup.classList.add('sub-minimal');
    elements.mockupActiveWord.className = 'text-sky-400 underline underline-offset-4 inline-block font-semibold';
  } else if (preset === 'cyberpunk') {
    elements.subMockup.classList.add('sub-cyberpunk');
    elements.mockupActiveWord.className = 'text-cyan-300 font-extrabold inline-block';
  }
}

// Start Processing Pipeline
async function startPipeline() {
  const clippingMode = document.querySelector('input[name="clipping_mode"]:checked').value;
  const whisperModel = elements.selectWhisperModel.value;
  const ollamaModel = elements.selectOllamaModel.value;

  elements.sectionProgress.classList.remove('hidden');
  elements.sectionClips.classList.add('hidden');
  elements.sectionTranscript.classList.add('hidden');
  updateProgressUI({ stage: 'starting', progress: 2.0, message: 'Initiating video pipeline...' });

  try {
    let res;
    if (state.activeTab === 'url') {
      const url = elements.inputUrl.value.trim();
      if (!url) {
        alert('Please enter a valid video URL.');
        elements.sectionProgress.classList.add('hidden');
        return;
      }

      res = await fetch('/api/process/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          whisper_model: whisperModel,
          clipping_mode: clippingMode,
          ollama_model: ollamaModel,
          min_clip_duration: parseFloat(elements.inputMinDur.value),
          max_clip_duration: parseFloat(elements.inputMaxDur.value),
          sequential_duration: parseFloat(elements.inputSeqDur.value),
          sequential_overlap: parseFloat(elements.inputSeqOverlap.value),
          snap_boundaries: elements.checkSnap.checked,
          auto_render: false
        })
      });
    } else {
      if (!state.selectedFile) {
        alert('Please select a video file to upload.');
        elements.sectionProgress.classList.add('hidden');
        return;
      }

      const formData = new FormData();
      formData.append('file', state.selectedFile);
      formData.append('whisper_model', whisperModel);
      formData.append('clipping_mode', clippingMode);
      formData.append('ollama_model', ollamaModel);
      formData.append('min_clip_duration', elements.inputMinDur.value);
      formData.append('max_clip_duration', elements.inputMaxDur.value);
      formData.append('sequential_duration', elements.inputSeqDur.value);
      formData.append('sequential_overlap', elements.inputSeqOverlap.value);
      formData.append('snap_boundaries', elements.checkSnap.checked);
      formData.append('auto_render', false);

      res = await fetch('/api/process/upload', {
        method: 'POST',
        body: formData
      });
    }

    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }

    const data = await res.json();
    state.currentJobId = data.job_id;
    startJobPolling(data.job_id);

  } catch (err) {
    console.error('Pipeline start failed:', err);
    alert(`Error: ${err.message}`);
    elements.sectionProgress.classList.add('hidden');
  }
}

// Handle real-time job progress updates
function handleJobUpdate(job) {
  state.jobData = job;
  updateProgressUI(job);

  if (job.stage === 'ready' || job.status === 'completed') {
    if (job.clips && job.clips.length > 0) {
      renderCandidateClips(job.clips, job.id);
      elements.sectionClips.classList.remove('hidden');
    }
    if (job.transcript && job.transcript.segments) {
      renderTranscript(job.transcript.segments);
      elements.sectionTranscript.classList.remove('hidden');
    }
    loadGallery();
  } else if (job.status === 'failed') {
    elements.progressStageTitle.textContent = 'Processing Failed';
    elements.progressMessage.textContent = job.error || 'An unexpected error occurred.';
    elements.progressMessage.className = 'text-xs text-rose-400 font-medium';
  }
}

function updateProgressUI(job) {
  const pct = Math.min(100, Math.max(0, job.progress || 0));
  elements.progressPercent.textContent = `${Math.round(pct)}%`;
  elements.progressBarFill.style.width = `${pct}%`;
  elements.progressMessage.textContent = job.message || 'Processing...';

  // Highlight step boxes
  const resetSteps = () => {
    [elements.stepIngest, elements.stepTranscribe, elements.stepAnalyze, elements.stepRender].forEach(el => {
      el.className = 'p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-400 font-medium';
    });
  };

  const activeClass = 'p-2 rounded-lg bg-indigo-950/60 border border-indigo-500 text-indigo-300 font-bold shadow-lg shadow-indigo-500/20';
  const doneClass = 'p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/60 text-emerald-400 font-semibold';

  resetSteps();
  if (job.stage === 'ingestion' || job.stage === 'downloading') {
    elements.stepIngest.className = activeClass;
    elements.progressStageTitle.textContent = 'Step 1: Downloading & Ingesting Video';
  } else if (job.stage === 'transcription') {
    elements.stepIngest.className = doneClass;
    elements.stepTranscribe.className = activeClass;
    elements.progressStageTitle.textContent = 'Step 2: faster-whisper Speech-to-Text';
  } else if (job.stage === 'analyzing') {
    elements.stepIngest.className = doneClass;
    elements.stepTranscribe.className = doneClass;
    elements.stepAnalyze.className = activeClass;
    elements.progressStageTitle.textContent = 'Step 3: AI Viral Hook Detection';
  } else if (job.stage === 'rendering') {
    elements.stepIngest.className = doneClass;
    elements.stepTranscribe.className = doneClass;
    elements.stepAnalyze.className = doneClass;
    elements.stepRender.className = activeClass;
    elements.progressStageTitle.textContent = 'Step 4: FFmpeg 9:16 Composite Rendering';
  } else if (job.stage === 'ready' || job.stage === 'complete') {
    [elements.stepIngest, elements.stepTranscribe, elements.stepAnalyze, elements.stepRender].forEach(el => {
      el.className = doneClass;
    });
    elements.progressStageTitle.textContent = 'Pipeline Execution Complete!';
  }
}

// Render Candidate Clip Cards
function renderCandidateClips(clips, jobId) {
  elements.clipsGrid.innerHTML = '';

  clips.forEach((clip, index) => {
    const card = document.createElement('div');
    card.className = 'glass-panel p-5 glass-panel-hover flex flex-col justify-between space-y-4';

    const virality = clip.virality_score || 85;
    let badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if (virality < 70) badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';

    card.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs px-2.5 py-1 rounded-full border font-bold ${badgeColor}">
            Virality: ${virality}/100
          </span>
          <span class="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            ${clip.duration}s
          </span>
        </div>

        <div>
          <h4 class="text-sm font-bold text-white line-clamp-1">${escapeHtml(clip.title)}</h4>
          <p class="text-xs text-indigo-300 mt-1 italic line-clamp-2">"${escapeHtml(clip.hook_sentence || '')}"</p>
        </div>

        <div class="bg-slate-900/60 p-2.5 rounded-lg border border-white/5 text-[11px] text-slate-400">
          <p class="font-medium text-slate-300 mb-0.5">Editor Note:</p>
          <p class="line-clamp-2">${escapeHtml(clip.reasoning || 'High retention standalone moment.')}</p>
        </div>

        <!-- Timestamp Controls -->
        <div class="grid grid-cols-2 gap-2 text-xs pt-1">
          <div class="bg-slate-900 p-1.5 rounded border border-slate-800">
            <label class="text-[10px] text-slate-500 block">Start (s)</label>
            <input type="number" step="0.1" value="${clip.start_time}" id="clip-start-${index}" class="w-full bg-transparent text-white font-mono text-xs focus:outline-none">
          </div>
          <div class="bg-slate-900 p-1.5 rounded border border-slate-800">
            <label class="text-[10px] text-slate-500 block">End (s)</label>
            <input type="number" step="0.1" value="${clip.end_time}" id="clip-end-${index}" class="w-full bg-transparent text-white font-mono text-xs focus:outline-none">
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-white/5">
        <button onclick="renderSingleClip('${jobId}', ${index})" class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow flex items-center justify-center space-x-1.5 transition">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span>Render 9:16 Vertical Clip</span>
        </button>
      </div>
    `;

    elements.clipsGrid.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Render Single Clip on Demand
window.renderSingleClip = async function(jobId, clipIndex) {
  const startInput = document.getElementById(`clip-start-${clipIndex}`);
  const endInput = document.getElementById(`clip-end-${clipIndex}`);
  
  const startTime = startInput ? parseFloat(startInput.value) : 0;
  const endTime = endInput ? parseFloat(endInput.value) : 0;

  const renderOpts = getSelectedRenderOptions();

  elements.sectionProgress.classList.remove('hidden');
  updateProgressUI({ stage: 'rendering', progress: 5.0, message: `Starting render for Clip #${clipIndex + 1}...` });

  try {
    const res = await fetch('/api/render-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: jobId,
        clip_index: clipIndex,
        start_time: startTime,
        end_time: endTime,
        subtitle_preset: state.selectedPreset,
        render_options: renderOpts
      })
    });
    if (!res.ok) throw new Error('Render request failed');
  } catch (err) {
    alert(`Render error: ${err.message}`);
  }
};

// Batch Render All Clips
async function batchRenderAll() {
  if (!state.currentJobId) {
    alert('No active job found.');
    return;
  }

  const renderOpts = getSelectedRenderOptions();
  elements.sectionProgress.classList.remove('hidden');
  updateProgressUI({ stage: 'rendering', progress: 0.0, message: 'Initiating batch render of all clips...' });

  try {
    const res = await fetch('/api/batch-render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: state.currentJobId,
        subtitle_preset: state.selectedPreset,
        render_options: renderOpts
      })
    });
    if (!res.ok) throw new Error('Batch render request failed');
  } catch (err) {
    alert(`Batch render error: ${err.message}`);
  }
}

function getSelectedRenderOptions() {
  return {
    vertical_9_16: elements.checkBlurStack.checked,
    hflip: elements.checkHflip.checked,
    speed: parseFloat(elements.rangeSpeed.value),
    zoom_factor: parseFloat(elements.rangeZoom.value),
    saturation: parseFloat(elements.rangeSat.value),
    subtitle_preset: state.selectedPreset,
    burn_subtitles: true
  };
}

// Load Finished Clips Gallery
async function loadGallery() {
  try {
    const res = await fetch('/api/clips');
    const clips = await res.json();

    if (!clips || clips.length === 0) {
      elements.galleryGrid.innerHTML = '';
      elements.galleryEmpty.classList.remove('hidden');
      return;
    }

    elements.galleryEmpty.classList.add('hidden');
    elements.galleryGrid.innerHTML = '';

    clips.forEach(clip => {
      const card = document.createElement('div');
      card.className = 'glass-panel p-3 glass-panel-hover flex flex-col justify-between space-y-3';

      const sizeMb = (clip.size / (1024 * 1024)).toFixed(1);
      const dur = Math.round(clip.duration);

      card.innerHTML = `
        <div class="aspect-9-16 bg-black rounded-lg overflow-hidden relative shadow-inner">
          <video src="${clip.url}" controls playsinline preload="metadata" class="w-full h-full object-cover"></video>
        </div>

        <div class="space-y-1 px-1">
          <h4 class="text-xs font-bold text-white truncate">${escapeHtml(clip.filename)}</h4>
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span>${dur}s &bull; ${sizeMb} MB</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-indigo-400 font-mono">1080x1920</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1">
          <a href="${clip.url}" download="${clip.filename}" class="py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-md flex items-center justify-center space-x-1 transition text-center">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Save MP4</span>
          </a>
          <button onclick="deleteClip('${clip.filename}')" class="py-1.5 bg-slate-800 hover:bg-rose-900/60 hover:text-rose-300 text-slate-400 text-xs font-semibold rounded-md border border-slate-700 flex items-center justify-center space-x-1 transition">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span>Delete</span>
          </button>
        </div>
      `;

      elements.galleryGrid.appendChild(card);
    });

    if (window.lucide) {
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Failed to load gallery clips:', err);
  }
}

window.deleteClip = async function(filename) {
  if (!confirm(`Delete clip '${filename}'?`)) return;
  try {
    await fetch(`/api/clips/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    loadGallery();
  } catch (err) {
    alert('Delete failed');
  }
};

// Render Transcript with Search & Clickable Word Highlights
function renderTranscript(segments) {
  elements.transcriptContainer.innerHTML = '';

  segments.forEach(seg => {
    const row = document.createElement('div');
    row.className = 'transcript-row p-2 rounded bg-slate-900/40 hover:bg-slate-800/60 transition flex items-start space-x-3 text-xs';

    row.innerHTML = `
      <span class="font-mono text-indigo-400 text-[11px] shrink-0 pt-0.5 select-none">[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s]</span>
      <p class="text-slate-300 font-normal">${escapeHtml(seg.text)}</p>
    `;

    elements.transcriptContainer.appendChild(row);
  });
}

function filterTranscript(query) {
  const rows = document.querySelectorAll('.transcript-row');
  const q = query.toLowerCase().trim();
  rows.forEach(row => {
    if (!q || row.textContent.toLowerCase().includes(q)) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
