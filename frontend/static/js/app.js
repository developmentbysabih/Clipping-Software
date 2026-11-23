/**
 * AutoClip Studio Pro - Frontend Dashboard Logic
 * UI/UX Pro Max & Design Taste Guidelines
 */

// Application State
const state = {
  currentJobId: null,
  activeTab: 'url', // 'url', 'live', 'upload'
  aspectRatio: '9:16',
  selectedPreset: 'hormozi',
  progressBarColor: '#EC4899',
  selectedFile: null,
  systemStatus: null,
  jobData: null,
};

// Toast notification helper
function showToast(message, icon = 'check-circle') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4 text-emerald-400"></i><span>${message}</span>`;
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons({ root: toast });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// DOM Elements
const elements = {
  deviceVal: document.getElementById('device-val'),
  ollamaVal: document.getElementById('ollama-val'),
  ollamaDot: document.getElementById('ollama-dot'),
  
  // Tabs
  tabBtnUrl: document.getElementById('tab-btn-url'),
  tabBtnLive: document.getElementById('tab-btn-live'),
  tabBtnUpload: document.getElementById('tab-btn-upload'),
  tabContentUrl: document.getElementById('tab-content-url'),
  tabContentLive: document.getElementById('tab-content-live'),
  tabContentUpload: document.getElementById('tab-content-upload'),
  
  // Inputs
  inputUrl: document.getElementById('input-url'),
  inputLiveUrl: document.getElementById('input-live-url'),
  inputFile: document.getElementById('input-file'),
  dropzone: document.getElementById('dropzone'),
  fileNameDisplay: document.getElementById('file-name-display'),
  
  // Customizations
  labelSelectedRatio: document.getElementById('label-selected-ratio'),
  selectFramingMode: document.getElementById('select-framing-mode'),
  checkProgressBar: document.getElementById('check-progress-bar'),
  checkLoudnorm: document.getElementById('check-loudnorm'),
  checkHflip: document.getElementById('check-hflip'),
  inputWatermark: document.getElementById('input-watermark'),
  barColors: document.getElementById('bar-colors'),
  
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
  clipsCountBadge: document.getElementById('clips-count-badge'),
  
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

// Fetch system info
async function initSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.systemStatus = data;

    // Device Badge
    const isCuda = data.device === 'cuda';
    elements.deviceVal.textContent = isCuda ? 'NVIDIA GPU (CUDA)' : 'CPU Optimized';
    elements.deviceVal.className = isCuda ? 'text-emerald-400 font-bold' : 'text-slate-200 font-bold';

    // Ollama Status
    const ollama = data.ollama;
    if (ollama && ollama.online) {
      elements.ollamaVal.textContent = `Ollama (${ollama.models.length || 'Active'})`;
      elements.ollamaVal.className = 'text-emerald-400 font-bold';
      elements.ollamaDot.className = 'w-2 h-2 rounded-full bg-emerald-400';

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
      elements.ollamaVal.textContent = 'Heuristic Engine (Local)';
      elements.ollamaVal.className = 'text-amber-400 font-medium';
      elements.ollamaDot.className = 'w-2 h-2 rounded-full bg-amber-400';
    }
  } catch (err) {
    console.error('Failed to load system status:', err);
    elements.deviceVal.textContent = 'CPU';
    elements.ollamaVal.textContent = 'Heuristic';
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
      // transient network skip
    }
  }, 800);
}

// Check recent running jobs on load
async function checkActiveJobs() {
  try {
    const res = await fetch('/api/jobs');
    if (res.ok) {
      const jobs = await res.json();
      if (jobs && jobs.length > 0) {
        const latestJob = jobs[0];
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

// Connect to Server-Sent Events stream
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
      // ping
    }
  };

  evtSource.onerror = () => {
    // auto reconnects
  };
}

// Setup Event Listeners
function initEventListeners() {
  // Source Tabs
  elements.tabBtnUrl.addEventListener('click', () => switchTab('url'));
  elements.tabBtnLive.addEventListener('click', () => switchTab('live'));
  elements.tabBtnUpload.addEventListener('click', () => switchTab('upload'));

  // Aspect Ratio Buttons
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      const ratio = target.getAttribute('data-ratio');
      state.aspectRatio = ratio;
      
      document.querySelectorAll('.ratio-btn').forEach(b => {
        b.className = 'ratio-btn p-2 rounded-xl border border-slate-800 bg-slate-950/60 text-center hover:border-slate-700 transition-all cursor-pointer';
        b.querySelector('.text-xs').className = 'text-xs font-bold text-slate-300';
      });

      target.className = 'ratio-btn p-2 rounded-xl border border-pink-500 bg-pink-950/30 text-center transition-all cursor-pointer';
      target.querySelector('.text-xs').className = 'text-xs font-bold text-white';

      const dimMap = {
        '9:16': '9:16 (1080x1920)',
        '1:1': '1:1 (1080x1080)',
        '4:5': '4:5 (1080x1350)',
        '16:9': '16:9 (1920x1080)',
      };
      elements.labelSelectedRatio.textContent = dimMap[ratio] || ratio;
    });
  });

  // Progress Bar Color Picker
  if (elements.barColors) {
    elements.barColors.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const col = e.currentTarget.getAttribute('data-color');
        state.progressBarColor = col;
        elements.barColors.querySelectorAll('button').forEach(b => {
          b.className = b.className.replace(/ring-2 ring-white ring-offset-1 ring-offset-slate-900/g, '').trim();
        });
        e.currentTarget.className += ' ring-2 ring-white ring-offset-1 ring-offset-slate-900';
      });
    });
  }

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
    elements.dropzone.classList.add('border-pink-500', 'bg-pink-950/20');
  });

  elements.dropzone.addEventListener('dragleave', () => {
    elements.dropzone.classList.remove('border-pink-500', 'bg-pink-950/20');
  });

  elements.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropzone.classList.remove('border-pink-500', 'bg-pink-950/20');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  // Preset Buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const preset = e.currentTarget.getAttribute('data-preset');
      selectSubtitlePreset(preset);
    });
  });

  // Range Sliders Value Trackers
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

// Switch Ingestion Tabs
function switchTab(tab) {
  state.activeTab = tab;
  
  // Reset tabs
  elements.tabBtnUrl.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer';
  elements.tabBtnLive.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer';
  elements.tabBtnUpload.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer';
  
  elements.tabContentUrl.classList.add('hidden');
  elements.tabContentLive.classList.add('hidden');
  elements.tabContentUpload.classList.add('hidden');

  if (tab === 'url') {
    elements.tabBtnUrl.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-pink-600 text-white shadow-md shadow-pink-600/30 transition-all flex items-center gap-1.5 cursor-pointer';
    elements.tabContentUrl.classList.remove('hidden');
  } else if (tab === 'live') {
    elements.tabBtnLive.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white shadow-md shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer';
    elements.tabContentLive.classList.remove('hidden');
  } else {
    elements.tabBtnUpload.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg bg-pink-600 text-white shadow-md shadow-pink-600/30 transition-all flex items-center gap-1.5 cursor-pointer';
    elements.tabContentUpload.classList.remove('hidden');
  }
}

// Handle file selection
function handleFileSelected(file) {
  state.selectedFile = file;
  elements.fileNameDisplay.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
  elements.fileNameDisplay.classList.remove('hidden');
}

// Select subtitle style preset
function selectSubtitlePreset(preset) {
  state.selectedPreset = preset;

  document.querySelectorAll('.preset-btn').forEach(b => {
    b.className = 'preset-btn p-2 rounded-xl border border-slate-800 bg-slate-950/60 text-left hover:border-slate-700 transition-all cursor-pointer';
  });

  const activeBtn = document.querySelector(`.preset-btn[data-preset="${preset}"]`);
  if (activeBtn) {
    activeBtn.className = 'preset-btn p-2 rounded-xl border border-pink-500 bg-pink-950/30 text-left transition-all cursor-pointer';
  }

  // Update Preview Mockup
  elements.subMockup.className = `py-2 text-base font-bold tracking-wide transition-all sub-${preset}`;
  
  if (preset === 'hormozi') {
    elements.mockupActiveWord.className = 'text-yellow-400 scale-105 inline-block';
  } else if (preset === 'beast') {
    elements.mockupActiveWord.className = 'text-emerald-400 scale-105 inline-block';
  } else if (preset === 'tiktok_bounce') {
    elements.mockupActiveWord.className = 'text-pink-500 scale-110 inline-block';
  } else if (preset === 'cyberpunk') {
    elements.mockupActiveWord.className = 'text-cyan-400 scale-105 inline-block';
  } else if (preset === 'luxury') {
    elements.mockupActiveWord.className = 'text-amber-300 scale-105 inline-block italic';
  } else {
    elements.mockupActiveWord.className = 'text-sky-400 inline-block font-semibold';
  }
}

// Build common render options payload
function getRenderOptionsPayload() {
  return {
    aspect_ratio: state.aspectRatio,
    framing_mode: elements.selectFramingMode.value,
    progress_bar: elements.checkProgressBar.checked,
    progress_bar_color: state.progressBarColor,
    watermark_text: elements.inputWatermark ? elements.inputWatermark.value : '',
    auto_loudness: elements.checkLoudnorm ? elements.checkLoudnorm.checked : true,
    hflip: elements.checkHflip.checked,
    speed: parseFloat(elements.rangeSpeed.value),
    zoom_factor: parseFloat(elements.rangeZoom.value),
    saturation: parseFloat(elements.rangeSat.value),
    subtitle_preset: state.selectedPreset,
    burn_subtitles: true,
  };
}

// Start Processing Pipeline
async function startPipeline() {
  const isLive = state.activeTab === 'live';
  const urlVal = isLive ? elements.inputLiveUrl.value.trim() : elements.inputUrl.value.trim();

  if (state.activeTab !== 'upload' && !urlVal) {
    alert(isLive ? 'Please enter a valid YouTube Live Stream link.' : 'Please enter a valid YouTube or video URL.');
    return;
  }

  if (state.activeTab === 'upload' && !state.selectedFile) {
    alert('Please select or drag a video file to upload.');
    return;
  }

  const whisperModel = elements.selectWhisperModel.value;
  const clippingMode = isLive ? 'live_peaks' : document.querySelector('input[name="clipping_mode"]:checked').value;
  const ollamaModel = elements.selectOllamaModel.value;
  const renderOptions = getRenderOptionsPayload();

  // Reset UI
  elements.sectionProgress.classList.remove('hidden');
  elements.sectionClips.classList.add('hidden');
  elements.sectionTranscript.classList.add('hidden');
  
  updateProgressUI({
    stage: 'starting',
    progress: 2.0,
    message: isLive ? 'Connecting to YouTube Live Stream & analyzing broadcast...' : 'Initiating video pipeline...'
  });

  try {
    let res;
    if (state.activeTab === 'url' || state.activeTab === 'live') {
      res = await fetch('/api/process/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlVal,
          whisper_model: whisperModel,
          clipping_mode: clippingMode,
          ollama_model: ollamaModel,
          min_clip_duration: parseFloat(elements.inputMinDur.value),
          max_clip_duration: parseFloat(elements.inputMaxDur.value),
          sequential_duration: parseFloat(elements.inputSeqDur.value),
          sequential_overlap: parseFloat(elements.inputSeqOverlap.value),
          snap_boundaries: elements.checkSnap.checked,
          auto_render: false,
          is_live_stream: isLive,
          render_options: renderOptions,
        })
      });
    } else {
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
    showToast(isLive ? 'Live stream ingestion queued!' : 'Video pipeline queued!');

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
      if (elements.clipsCountBadge) {
        elements.clipsCountBadge.textContent = `${job.clips.length} viral clips`;
      }
    }
    if (job.transcript && job.transcript.segments) {
      renderTranscript(job.transcript.segments);
      elements.sectionTranscript.classList.remove('hidden');
    }
  }

  if (job.status === 'completed' && job.rendered_clips) {
    loadGallery();
  }
}

// Update Progress HUD elements
function updateProgressUI(job) {
  const pct = Math.min(100, Math.max(0, job.progress || 0));
  elements.progressPercent.textContent = `${Math.round(pct)}%`;
  elements.progressBarFill.style.width = `${pct}%`;
  elements.progressMessage.textContent = job.message || 'Processing...';

  // Titles by stage
  const titles = {
    'starting': 'Initializing Pipeline...',
    'ingestion': '1. Ingesting Source Video',
    'downloading': '1. Downloading Stream via yt-dlp',
    'transcription': '2. Speech-to-Text (faster-whisper)',
    'analyzing': '3. AI Viral Hook Analysis',
    'ready': 'Clips Identified & Ready to Render',
    'rendering': '4. FFmpeg Video Compositing',
    'complete': 'Pipeline Completed Successfully',
    'error': 'Pipeline Error Encountered'
  };
  elements.progressStageTitle.textContent = titles[job.stage] || 'Processing Video...';

  // Reset Step Indicators
  [elements.stepIngest, elements.stepTranscribe, elements.stepAnalyze, elements.stepRender].forEach(el => {
    el.className = 'p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-500 font-semibold transition-all';
  });

  const activeClass = 'p-2.5 rounded-xl bg-pink-950/30 border border-pink-500 text-pink-400 font-bold glow-active';
  const doneClass = 'p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/50 text-emerald-400 font-bold';

  if (['ingestion', 'downloading'].includes(job.stage)) {
    elements.stepIngest.className = activeClass;
  } else if (job.stage === 'transcription') {
    elements.stepIngest.className = doneClass;
    elements.stepTranscribe.className = activeClass;
  } else if (job.stage === 'analyzing') {
    elements.stepIngest.className = doneClass;
    elements.stepTranscribe.className = doneClass;
    elements.stepAnalyze.className = activeClass;
  } else if (job.stage === 'rendering') {
    elements.stepIngest.className = doneClass;
    elements.stepTranscribe.className = doneClass;
    elements.stepAnalyze.className = doneClass;
    elements.stepRender.className = activeClass;
  } else if (job.stage === 'complete' || job.stage === 'ready') {
    elements.stepIngest.className = doneClass;
    elements.stepTranscribe.className = doneClass;
    elements.stepAnalyze.className = doneClass;
    if (job.stage === 'complete') elements.stepRender.className = doneClass;
  }
}

// Copy Text to Clipboard with Toast
async function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, 'copy');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast(successMsg, 'copy');
  }
}

// Render Candidate Viral Clips Grid
function renderCandidateClips(clips, jobId) {
  elements.clipsGrid.innerHTML = '';

  clips.forEach((clip, index) => {
    const card = document.createElement('div');
    card.className = 'glass-panel p-5 space-y-4 flex flex-col justify-between glass-panel-hover';

    const score = clip.virality_score || 85;
    let badgeClass = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    let scoreIcon = 'flame';
    if (score < 80) {
      badgeClass = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
      scoreIcon = 'zap';
    } else if (score < 90) {
      badgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      scoreIcon = 'star';
    }

    const duration = (clip.end_time - clip.start_time).toFixed(1);
    const hookType = clip.hook_type || (clip.is_livestream_peak ? 'Live Stream Climax' : 'Viral Hook');
    const tags = clip.hashtags && clip.hashtags.length > 0 ? clip.hashtags.join(' ') : '#Shorts #Viral #Fyp';
    const captionIdea = clip.caption_idea || `${clip.title} 🔥 Watch till the end! ${tags}`;

    card.innerHTML = `
      <div class="space-y-3">
        <!-- Top Row: Score Badge & Duration -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="px-2.5 py-1 rounded-full text-xs font-black border flex items-center gap-1 ${badgeClass}">
              <i data-lucide="${scoreIcon}" class="w-3.5 h-3.5"></i>
              ${score}/100 Retention
            </span>
            <span class="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-medium">
              ${hookType}
            </span>
          </div>
          <span class="text-xs text-slate-400 font-mono-numbers bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            ${clip.start_time.toFixed(1)}s - ${clip.end_time.toFixed(1)}s (${duration}s)
          </span>
        </div>

        <!-- Title -->
        <h3 class="text-base font-bold text-white tracking-tight">${clip.title}</h3>

        <!-- Verbatim Hook Quote Pill -->
        ${clip.hook_sentence ? `
          <div class="p-3 bg-slate-950/80 rounded-xl border border-white/[0.06] text-xs text-slate-300 italic flex items-start gap-2">
            <i data-lucide="quote" class="w-3.5 h-3.5 text-pink-400 shrink-0 mt-0.5"></i>
            <span>"${clip.hook_sentence}"</span>
          </div>
        ` : ''}

        <!-- AI Viral Reasoning -->
        <p class="text-xs text-slate-400 leading-relaxed">${clip.reasoning || 'Selected for maximum viewer watch-time retention.'}</p>
        
        <!-- Social Caption Snippet -->
        <div class="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1.5">
          <div class="flex items-center justify-between text-[10px] text-slate-400">
            <span class="font-semibold text-slate-300 flex items-center gap-1">
              <i data-lucide="share-2" class="w-3 h-3 text-cyan-400"></i> Social Caption & Hashtags
            </span>
            <button class="btn-copy-caption text-pink-400 hover:text-pink-300 font-semibold cursor-pointer">
              Copy Caption
            </button>
          </div>
          <p class="text-[11px] text-slate-400 line-clamp-2">${captionIdea}</p>
        </div>
      </div>

      <!-- Card Action Footer -->
      <div class="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <select class="clip-sub-preset bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200">
          <option value="hormozi" ${state.selectedPreset === 'hormozi' ? 'selected' : ''}>Hormozi</option>
          <option value="beast" ${state.selectedPreset === 'beast' ? 'selected' : ''}>Beast</option>
          <option value="tiktok_bounce" ${state.selectedPreset === 'tiktok_bounce' ? 'selected' : ''}>TikTok Pop</option>
          <option value="cyberpunk" ${state.selectedPreset === 'cyberpunk' ? 'selected' : ''}>Cyberpunk</option>
          <option value="luxury" ${state.selectedPreset === 'luxury' ? 'selected' : ''}>Luxury</option>
          <option value="minimal" ${state.selectedPreset === 'minimal' ? 'selected' : ''}>Minimal</option>
        </select>

        <button class="btn-render-single flex-1 py-1.5 px-3 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-lg shadow-md shadow-pink-600/25 flex items-center justify-center space-x-1.5 transition cursor-pointer">
          <i data-lucide="film" class="w-3.5 h-3.5"></i>
          <span>Render 9:16 Clip</span>
        </button>
      </div>
    `;

    // Copy Caption Button
    const btnCopy = card.querySelector('.btn-copy-caption');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        copyToClipboard(captionIdea, 'Caption and hashtags copied to clipboard!');
      });
    }

    // Single Render Click
    const btnRender = card.querySelector('.btn-render-single');
    const selectPreset = card.querySelector('.clip-sub-preset');

    btnRender.addEventListener('click', async () => {
      btnRender.disabled = true;
      btnRender.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i><span>Queued...</span>';
      if (window.lucide) lucide.createIcons({ root: btnRender });

      try {
        const renderOpts = getRenderOptionsPayload();
        renderOpts.subtitle_preset = selectPreset.value;

        const res = await fetch('/api/render/clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_id: jobId,
            clip_index: index,
            start_time: clip.start_time,
            end_time: clip.end_time,
            title: clip.title,
            subtitle_preset: selectPreset.value,
            render_options: renderOpts,
          })
        });

        if (res.ok) {
          showToast(`Render queued for "${clip.title}"!`);
          elements.sectionProgress.classList.remove('hidden');
          startJobPolling(jobId);
        }
      } catch (err) {
        alert(`Render failed: ${err.message}`);
      } finally {
        btnRender.disabled = false;
        btnRender.innerHTML = '<i data-lucide="film" class="w-3.5 h-3.5"></i><span>Render 9:16 Clip</span>';
        if (window.lucide) lucide.createIcons({ root: btnRender });
      }
    });

    elements.clipsGrid.appendChild(card);
  });

  if (window.lucide) {
    lucide.createIcons({ root: elements.clipsGrid });
  }
}

// Batch Render All Clips
async function batchRenderAll() {
  if (!state.currentJobId) return;

  elements.btnBatchRender.disabled = true;
  elements.btnBatchRender.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Queueing Batch...</span>';
  if (window.lucide) lucide.createIcons({ root: elements.btnBatchRender });

  try {
    const renderOpts = getRenderOptionsPayload();
    const res = await fetch('/api/render/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: state.currentJobId,
        subtitle_preset: state.selectedPreset,
        render_options: renderOpts,
      })
    });

    if (res.ok) {
      showToast('Batch render of all clips started!');
      elements.sectionProgress.classList.remove('hidden');
      startJobPolling(state.currentJobId);
    }
  } catch (err) {
    alert(`Batch render failed: ${err.message}`);
  } finally {
    elements.btnBatchRender.disabled = false;
    elements.btnBatchRender.innerHTML = '<i data-lucide="layers" class="w-4 h-4"></i><span>Render All Clips (Batch)</span>';
    if (window.lucide) lucide.createIcons({ root: elements.btnBatchRender });
  }
}

// Load Finished Gallery
async function loadGallery() {
  try {
    const res = await fetch('/api/clips');
    if (!res.ok) return;

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
      card.className = 'glass-panel p-4 space-y-3 glass-panel-hover flex flex-col justify-between';

      const presetName = clip.subtitle_preset || 'Hormozi';
      const score = clip.virality_score || 85;

      card.innerHTML = `
        <div class="space-y-2">
          <!-- Video Player -->
          <div class="w-full bg-black rounded-xl overflow-hidden aspect-9-16 relative border border-white/[0.08] shadow-lg">
            <video src="${clip.url}" controls class="w-full h-full object-contain" preload="metadata" poster="${clip.thumbnail_url || ''}"></video>
            <div class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-bold text-pink-400 border border-white/10 flex items-center gap-1">
              <i data-lucide="flame" class="w-3 h-3 text-pink-400"></i> ${score}/100
            </div>
            <div class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-mono text-slate-300 border border-white/10">
              ${clip.duration}s
            </div>
          </div>

          <!-- Metadata -->
          <div class="space-y-1">
            <h4 class="text-sm font-bold text-white tracking-tight truncate" title="${clip.title}">${clip.title}</h4>
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>Preset: <strong class="text-slate-200 capitalize">${presetName}</strong></span>
              <span class="text-emerald-400 font-semibold font-mono-numbers">9:16 1080p</span>
            </div>
          </div>
        </div>

        <!-- Download Action Button -->
        <a href="${clip.url}" download="${clip.title}.mp4" 
          class="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl border border-slate-700 flex items-center justify-center space-x-1.5 transition">
          <i data-lucide="download" class="w-3.5 h-3.5 text-pink-400"></i>
          <span>Download 9:16 Video</span>
        </a>
      `;

      elements.galleryGrid.appendChild(card);
    });

    if (window.lucide) {
      lucide.createIcons({ root: elements.galleryGrid });
    }
  } catch (err) {
    console.error('Failed to load gallery:', err);
  }
}

// Render Timestamped Transcript
function renderTranscript(segments) {
  elements.transcriptContainer.innerHTML = '';
  segments.forEach(seg => {
    const row = document.createElement('div');
    row.className = 'transcript-row p-2 rounded-lg hover:bg-slate-900/60 transition flex items-start space-x-2 text-xs';
    
    const timeStr = `${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s`;
    row.innerHTML = `
      <span class="text-cyan-400 font-mono-numbers font-semibold shrink-0 select-none">[${timeStr}]</span>
      <span class="text-slate-300">${seg.text}</span>
    `;
    elements.transcriptContainer.appendChild(row);
  });
}

// Filter transcript by search input
function filterTranscript(keyword) {
  const term = keyword.toLowerCase();
  document.querySelectorAll('.transcript-row').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(term) ? 'flex' : 'none';
  });
}
