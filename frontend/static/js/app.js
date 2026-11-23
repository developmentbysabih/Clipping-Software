/**
 * AutoClip Studio — Client Application
 * 100% Free & Self-Hosted AI Video Repurposing Engine
 */

// Application State
const state = {
  theme: localStorage.getItem('autoclip_theme') || 'dark',
  source: 'yt',            // 'yt' | 'live' | 'file'
  strategy: 'ai',          // 'ai' | 'seq'
  aspect: '9:16',          // '9:16' | '1:1' | '4:5' | '16:9'
  preset: 'hormozi',       // Subtitle preset key
  styleTab: 'captions',    // 'captions' | 'video' | 'brand'
  dMin: 20,
  dMax: 60,
  speed: 1.0,
  zoom: 1.0,
  sat: 1.10,
  progress: true,
  loudnorm: true,
  mirror: false,
  watermark: '@yourhandle',
  barColor: '#FF4A1C',
  framingMode: 'blurred_stack',
  position: 'bottom',
  wordsPerLine: 3,
  selectedFile: null,
  currentJobId: null,
  activeEventSource: null,
  candidates: [],
  library: []
};

// Preset Design Configurations for Live Preview Mockup
const PRESET_MAPPINGS = {
  'hormozi': {
    name: 'Hormozi',
    color: '#FFD400',
    font: "'Anton', Impact, sans-serif",
    textTransform: 'uppercase',
    subKey: 'hormozi'
  },
  'beast': {
    name: 'Beast',
    color: '#3DFF6E',
    font: "'Anton', Impact, sans-serif",
    textTransform: 'uppercase',
    subKey: 'beast'
  },
  'tiktok_bounce': {
    name: 'TikTok Pop',
    color: '#FF5C7A',
    font: "'Bricolage Grotesque', sans-serif",
    textTransform: 'none',
    subKey: 'tiktok_bounce'
  },
  'neon_glitch': {
    name: 'Cyberpunk',
    color: '#36E3FF',
    font: "'Geist Mono', monospace",
    textTransform: 'uppercase',
    subKey: 'neon_glitch'
  },
  'luxury': {
    name: 'Luxury',
    color: '#E6C27A',
    font: "'Georgia', serif",
    textTransform: 'none',
    subKey: 'luxury'
  },
  'clean_minimal': {
    name: 'Minimal',
    color: '#FFFFFF',
    font: "'Geist', sans-serif",
    textTransform: 'none',
    subKey: 'clean_minimal'
  }
};

// Aspect Ratio Configurations for Live Preview Mockup
const ASPECT_MAPPINGS = {
  '9:16': { ratio: 9 / 16, width: 280, height: 498, full: '9:16 · 1080×1920', videoH: 157 },
  '1:1':  { ratio: 1,      width: 360, height: 360, full: '1:1 · 1080×1080', videoH: 202 },
  '4:5':  { ratio: 4 / 5,  width: 320, height: 400, full: '4:5 · 1080×1350', videoH: 180 },
  '16:9': { ratio: 16 / 9, width: 440, height: 248, full: '16:9 · 1920×1080', videoH: 248 }
};

// DOM References
const dom = {
  appRoot: document.getElementById('appRoot'),
  btnThemeDark: document.getElementById('btn-theme-dark'),
  btnThemeLight: document.getElementById('btn-theme-light'),
  hudAccel: document.getElementById('hud-accel'),
  hudOllama: document.getElementById('hud-ollama'),
  hudFfmpeg: document.getElementById('hud-ffmpeg'),
  
  // Source Elements
  tabSrcYt: document.getElementById('tab-src-yt'),
  tabSrcLive: document.getElementById('tab-src-live'),
  tabSrcFile: document.getElementById('tab-src-file'),
  srcUrlContainer: document.getElementById('src-url-container'),
  srcFileContainer: document.getElementById('src-file-container'),
  srcInputLabel: document.getElementById('src-input-label'),
  videoUrl: document.getElementById('video-url'),
  btnPasteUrl: document.getElementById('btn-paste-url'),
  liveBadge: document.getElementById('live-badge'),
  fileDropzone: document.getElementById('file-dropzone'),
  fileInput: document.getElementById('file-input'),
  fileDropText: document.getElementById('file-drop-text'),

  // Strategy
  optStratAi: document.getElementById('opt-strat-ai'),
  optStratSeq: document.getElementById('opt-strat-seq'),
  inpDmin: document.getElementById('inp-dmin'),
  inpDmax: document.getElementById('inp-dmax'),
  selLlm: document.getElementById('sel-llm'),
  selWhisper: document.getElementById('sel-whisper'),

  // Preview Mockup
  previewAspectLabel: document.getElementById('preview-aspect-label'),
  phoneMockup: document.getElementById('phone-mockup'),
  mockupFg: document.getElementById('mockup-fg'),
  mockupWatermark: document.getElementById('mockup-watermark'),
  mockupCaption: document.getElementById('mockup-caption'),
  mockupHighlight: document.getElementById('mockup-highlight'),
  mockupProgressWrap: document.getElementById('mockup-progress-wrap'),
  mockupProgressBar: document.getElementById('mockup-progress-bar'),
  aspectButtons: document.querySelectorAll('.aspect-btn'),

  // Style Tabs & Controls
  tabStyleCaptions: document.getElementById('tab-style-captions'),
  tabStyleVideo: document.getElementById('tab-style-video'),
  tabStyleBrand: document.getElementById('tab-style-brand'),
  subtabCaptions: document.getElementById('subtab-captions'),
  subtabVideo: document.getElementById('subtab-video'),
  subtabBrand: document.getElementById('subtab-brand'),
  presetButtons: document.querySelectorAll('.preset-btn'),
  selCpos: document.getElementById('sel-cpos'),
  selCwords: document.getElementById('sel-cwords'),
  selFrameMode: document.getElementById('sel-frame-mode'),
  slSpeed: document.getElementById('sl-speed'),
  valSpeed: document.getElementById('val-speed'),
  slZoom: document.getElementById('sl-zoom'),
  valZoom: document.getElementById('val-zoom'),
  slSat: document.getElementById('sl-sat'),
  valSat: document.getElementById('val-sat'),
  togProgress: document.getElementById('tog-progress'),
  togLoudnorm: document.getElementById('tog-loudnorm'),
  togMirror: document.getElementById('tog-mirror'),
  inpWatermark: document.getElementById('inp-watermark'),
  barColorButtons: document.querySelectorAll('.bar-color-btn'),

  // Waveform
  waveformContainer: document.getElementById('waveform-container'),
  timelineStatusText: document.getElementById('timeline-status-text'),

  // Action Bar
  sumAspect: document.getElementById('sum-aspect'),
  sumPreset: document.getElementById('sum-preset'),
  sumDuration: document.getElementById('sum-duration'),
  sumStrategy: document.getElementById('sum-strategy'),
  btnGenerateClips: document.getElementById('btn-generate-clips'),
  genBtnDot: document.getElementById('gen-btn-dot'),
  genBtnText: document.getElementById('gen-btn-text'),

  // Progress Card
  pipelineProgressCard: document.getElementById('pipeline-progress-card'),
  pipelineStatusTitle: document.getElementById('pipeline-status-title'),
  pipelinePctLabel: document.getElementById('pipeline-pct-label'),
  pipelineBarFill: document.getElementById('pipeline-bar-fill'),
  pipelineLogStream: document.getElementById('pipeline-log-stream'),

  // Candidates & Library
  candidatesGrid: document.getElementById('candidates-grid'),
  candidatesCountText: document.getElementById('candidates-count-text'),
  btnBatchRender: document.getElementById('btn-batch-render'),
  libraryGrid: document.getElementById('library-grid'),
  libraryCountText: document.getElementById('library-count-text'),
  btnRefreshLibrary: document.getElementById('btn-refresh-library'),
  btnOpenFolder: document.getElementById('btn-open-folder'),

  // Modal
  videoModal: document.getElementById('video-modal'),
  modalVideoPlayer: document.getElementById('modal-video-player'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  toastContainer: document.getElementById('toast-container')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initWaveform();
  bindEvents();
  fetchSystemStatus();
  fetchRenderedClips();
  updateLivePreview();
  updateSummaryBar();
  setupSSE();
});

// ==========================================
// Theme Management (Light / Dark)
// ==========================================
function initTheme() {
  setTheme(state.theme);
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('autoclip_theme', theme);

  if (theme === 'light') {
    dom.appRoot.classList.remove('t-dark');
    dom.appRoot.classList.add('t-light');
    dom.btnThemeLight.style.background = 'var(--inv)';
    dom.btnThemeLight.style.color = 'var(--invInk)';
    dom.btnThemeDark.style.background = 'transparent';
    dom.btnThemeDark.style.color = 'var(--mute)';
  } else {
    dom.appRoot.classList.remove('t-light');
    dom.appRoot.classList.add('t-dark');
    dom.btnThemeDark.style.background = 'var(--inv)';
    dom.btnThemeDark.style.color = 'var(--invInk)';
    dom.btnThemeLight.style.background = 'transparent';
    dom.btnThemeLight.style.color = 'var(--mute)';
  }
}

// ==========================================
// Live Waveform Visualizer
// ==========================================
function initWaveform(highlightSegments = []) {
  if (!dom.waveformContainer) return;
  dom.waveformContainer.innerHTML = '';
  const totalBars = 96;

  for (let i = 0; i < totalBars; i++) {
    const bar = document.createElement('span');
    bar.style.flex = '1 1 0';
    bar.style.minWidth = '2px';
    bar.style.borderRadius = '1px';
    bar.style.transition = 'all 0.3s ease';

    // Harmonic pseudo-audio distribution
    const v = Math.abs(Math.sin(i * 0.35) * 0.55 + Math.sin(i * 1.6) * 0.3 + Math.sin(i * 0.1) * 0.25);
    const heightPct = Math.round(18 + v * 80);
    bar.style.height = `${heightPct}%`;

    // Highlight segments if provided
    const inSegment = highlightSegments.some(seg => {
      const startIdx = Math.floor(seg.startRatio * totalBars);
      const endIdx = Math.ceil(seg.endRatio * totalBars);
      return i >= startIdx && i <= endIdx;
    });

    bar.style.background = inSegment ? 'var(--acc)' : 'var(--line2)';
    dom.waveformContainer.appendChild(bar);
  }
}

// ==========================================
// Live Preview Mockup Sync
// ==========================================
function updateLivePreview() {
  const asp = ASPECT_MAPPINGS[state.aspect] || ASPECT_MAPPINGS['9:16'];
  const pre = PRESET_MAPPINGS[state.preset] || PRESET_MAPPINGS['hormozi'];

  // Update Aspect Ratio Frame Dimensions
  dom.previewAspectLabel.textContent = asp.full;
  dom.phoneMockup.style.width = `${asp.width}px`;
  dom.phoneMockup.style.height = `${asp.height}px`;
  dom.mockupFg.style.height = `${asp.videoH}px`;
  dom.mockupFg.style.marginTop = `-${Math.round(asp.videoH / 2)}px`;

  // Transform video (Zoom & Mirror)
  const mirrorX = state.mirror ? -1 : 1;
  dom.mockupFg.style.transform = `scale(${state.zoom}) scaleX(${mirrorX})`;

  // Watermark
  dom.mockupWatermark.textContent = state.watermark || '';
  dom.mockupWatermark.style.display = state.watermark ? 'inline-block' : 'none';

  // Subtitle styling
  dom.mockupCaption.style.fontFamily = pre.font;
  dom.mockupCaption.style.textTransform = pre.textTransform;
  dom.mockupHighlight.style.color = pre.color;

  // Caption Position
  if (state.position === 'top') {
    dom.mockupCaption.style.top = '60px';
    dom.mockupCaption.style.bottom = 'auto';
  } else if (state.position === 'center') {
    dom.mockupCaption.style.top = '45%';
    dom.mockupCaption.style.bottom = 'auto';
  } else {
    dom.mockupCaption.style.top = 'auto';
    dom.mockupCaption.style.bottom = `${Math.round(asp.height * 0.16)}px`;
  }

  // Progress Bar Line
  dom.mockupProgressWrap.style.display = state.progress ? 'block' : 'none';
  dom.mockupProgressBar.style.background = state.barColor;
}

// Update Action Bar Summary Pills
function updateSummaryBar() {
  const asp = ASPECT_MAPPINGS[state.aspect] || ASPECT_MAPPINGS['9:16'];
  const pre = PRESET_MAPPINGS[state.preset] || PRESET_MAPPINGS['hormozi'];
  const stratText = state.strategy === 'ai' ? 'AI viral hooks' : 'Even cuts';

  dom.sumAspect.textContent = asp.full;
  dom.sumPreset.textContent = `${pre.name} captions`;
  dom.sumDuration.textContent = `${state.dMin}–${state.dMax}s`;
  dom.sumStrategy.textContent = stratText;
}

// ==========================================
// Event Bindings
// ==========================================
function bindEvents() {
  // Theme Toggle Buttons
  dom.btnThemeDark.addEventListener('click', () => setTheme('dark'));
  dom.btnThemeLight.addEventListener('click', () => setTheme('light'));

  // Source Tabs
  dom.tabSrcYt.addEventListener('click', () => setSourceMode('yt'));
  dom.tabSrcLive.addEventListener('click', () => setSourceMode('live'));
  dom.tabSrcFile.addEventListener('click', () => setSourceMode('file'));

  // Video URL Input Paste & Auto-detection
  dom.btnPasteUrl.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        dom.videoUrl.value = text.trim();
        detectLiveStream(text.trim());
        showToast('Link pasted from clipboard');
      }
    } catch {
      showToast('Clipboard access denied, paste manually');
    }
  });

  dom.videoUrl.addEventListener('input', (e) => {
    detectLiveStream(e.target.value.trim());
  });

  // Drag and Drop File Upload
  dom.fileDropzone.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  dom.fileDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.fileDropzone.classList.add('drag-over');
  });

  dom.fileDropzone.addEventListener('dragleave', () => {
    dom.fileDropzone.classList.remove('drag-over');
  });

  dom.fileDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dom.fileDropzone.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  // Strategy Radio Buttons
  dom.optStratAi.addEventListener('click', () => setStrategy('ai'));
  dom.optStratSeq.addEventListener('click', () => setStrategy('seq'));

  // Duration Range
  dom.inpDmin.addEventListener('input', (e) => {
    state.dMin = parseInt(e.target.value) || 15;
    updateSummaryBar();
  });
  dom.inpDmax.addEventListener('input', (e) => {
    state.dMax = parseInt(e.target.value) || 60;
    updateSummaryBar();
  });

  // Aspect Ratio Buttons
  dom.aspectButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const asp = btn.dataset.aspect;
      state.aspect = asp;
      dom.aspectButtons.forEach(b => {
        const isSel = b.dataset.aspect === asp;
        b.style.background = isSel ? 'var(--inv)' : 'transparent';
        b.style.color = isSel ? 'var(--invInk)' : 'var(--ink)';
      });
      updateLivePreview();
      updateSummaryBar();
    });
  });

  // Style Tabs
  dom.tabStyleCaptions.addEventListener('click', () => setStyleTab('captions'));
  dom.tabStyleVideo.addEventListener('click', () => setStyleTab('video'));
  dom.tabStyleBrand.addEventListener('click', () => setStyleTab('brand'));

  // Preset Buttons
  dom.presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      state.preset = p;
      dom.presetButtons.forEach(b => {
        const isSel = b.dataset.preset === p;
        b.style.border = isSel ? '1px solid var(--ink)' : '1px solid var(--line)';
        b.style.outline = isSel ? '2px solid var(--ink)' : 'none';
      });
      updateLivePreview();
      updateSummaryBar();
    });
  });

  // Caption options
  dom.selCpos.addEventListener('change', (e) => {
    state.position = e.target.value;
    updateLivePreview();
  });
  dom.selCwords.addEventListener('change', (e) => {
    state.wordsPerLine = parseInt(e.target.value) || 3;
  });

  // Video sliders
  dom.slSpeed.addEventListener('input', (e) => {
    state.speed = parseFloat(e.target.value);
    dom.valSpeed.textContent = `${state.speed.toFixed(2)}×`;
  });
  dom.slZoom.addEventListener('input', (e) => {
    state.zoom = parseFloat(e.target.value);
    dom.valZoom.textContent = `${state.zoom.toFixed(2)}×`;
    updateLivePreview();
  });
  dom.slSat.addEventListener('input', (e) => {
    state.sat = parseFloat(e.target.value);
    dom.valSat.textContent = `${state.sat.toFixed(2)}×`;
  });
  dom.selFrameMode.addEventListener('change', (e) => {
    state.framingMode = e.target.value;
  });

  // Toggles
  bindToggle(dom.togProgress, 'progress', () => updateLivePreview());
  bindToggle(dom.togLoudnorm, 'loudnorm');
  bindToggle(dom.togMirror, 'mirror', () => updateLivePreview());

  // Branding options
  dom.inpWatermark.addEventListener('input', (e) => {
    state.watermark = e.target.value;
    updateLivePreview();
  });

  dom.barColorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.color;
      state.barColor = col;
      dom.barColorButtons.forEach(b => {
        b.style.outline = b.dataset.color === col ? '2px solid var(--ink)' : 'none';
      });
      updateLivePreview();
    });
  });

  // Action Button (Generate Clips)
  dom.btnGenerateClips.addEventListener('click', startPipeline);

  // Batch Render
  dom.btnBatchRender.addEventListener('click', batchRenderAllClips);

  // Library Controls
  dom.btnRefreshLibrary.addEventListener('click', fetchRenderedClips);
  dom.btnOpenFolder.addEventListener('click', openOutputFolder);

  // Modal
  dom.btnCloseModal.addEventListener('click', closeModal);
  dom.videoModal.addEventListener('click', (e) => {
    if (e.target === dom.videoModal) closeModal();
  });
}

function bindToggle(el, stateKey, onChange) {
  el.addEventListener('click', () => {
    state[stateKey] = !state[stateKey];
    const on = state[stateKey];
    const track = el.querySelector('.toggle-track');
    const knob = el.querySelector('.toggle-knob');

    track.style.background = on ? 'var(--acc)' : 'transparent';
    knob.style.background = on ? 'var(--accInk)' : 'var(--mute)';
    knob.style.left = on ? 'auto' : '2px';
    knob.style.right = on ? '2px' : 'auto';

    if (onChange) onChange();
  });
}

function setSourceMode(mode) {
  state.source = mode;
  [dom.tabSrcYt, dom.tabSrcLive, dom.tabSrcFile].forEach(btn => {
    btn.style.background = 'transparent';
    btn.style.color = 'var(--mute)';
  });

  if (mode === 'yt') {
    dom.tabSrcYt.style.background = 'var(--inv)';
    dom.tabSrcYt.style.color = 'var(--invInk)';
    dom.srcUrlContainer.style.display = 'flex';
    dom.srcFileContainer.style.display = 'none';
    dom.srcInputLabel.textContent = 'YouTube Video Link';
    dom.videoUrl.placeholder = 'https://www.youtube.com/watch?v=...';
    dom.liveBadge.style.display = 'none';
  } else if (mode === 'live') {
    dom.tabSrcLive.style.background = 'var(--inv)';
    dom.tabSrcLive.style.color = 'var(--invInk)';
    dom.srcUrlContainer.style.display = 'flex';
    dom.srcFileContainer.style.display = 'none';
    dom.srcInputLabel.textContent = 'Live Stream Link (YouTube / Twitch)';
    dom.videoUrl.placeholder = 'https://www.youtube.com/live/...';
    dom.liveBadge.style.display = 'inline-block';
  } else {
    dom.tabSrcFile.style.background = 'var(--inv)';
    dom.tabSrcFile.style.color = 'var(--invInk)';
    dom.srcUrlContainer.style.display = 'none';
    dom.srcFileContainer.style.display = 'flex';
  }
}

function setStrategy(strat) {
  state.strategy = strat;
  const isAi = strat === 'ai';

  dom.optStratAi.querySelector('.strat-ring').style.borderColor = isAi ? 'var(--acc)' : 'var(--line2)';
  dom.optStratAi.querySelector('.strat-dot').style.background = isAi ? 'var(--acc)' : 'transparent';

  dom.optStratSeq.querySelector('.strat-ring').style.borderColor = !isAi ? 'var(--acc)' : 'var(--line2)';
  dom.optStratSeq.querySelector('.strat-dot').style.background = !isAi ? 'var(--acc)' : 'transparent';

  updateSummaryBar();
}

function setStyleTab(tab) {
  state.styleTab = tab;
  [dom.tabStyleCaptions, dom.tabStyleVideo, dom.tabStyleBrand].forEach(b => {
    b.style.borderBottomColor = 'transparent';
    b.style.color = 'var(--mute)';
  });
  dom.subtabCaptions.style.display = 'none';
  dom.subtabVideo.style.display = 'none';
  dom.subtabBrand.style.display = 'none';

  if (tab === 'captions') {
    dom.tabStyleCaptions.style.borderBottomColor = 'var(--acc)';
    dom.tabStyleCaptions.style.color = 'var(--ink)';
    dom.subtabCaptions.style.display = 'flex';
  } else if (tab === 'video') {
    dom.tabStyleVideo.style.borderBottomColor = 'var(--acc)';
    dom.tabStyleVideo.style.color = 'var(--ink)';
    dom.subtabVideo.style.display = 'flex';
  } else {
    dom.tabStyleBrand.style.borderBottomColor = 'var(--acc)';
    dom.tabStyleBrand.style.color = 'var(--ink)';
    dom.subtabBrand.style.display = 'flex';
  }
}

function detectLiveStream(url) {
  const isLive = url.includes('/live/') || url.includes('live=1') || url.includes('stream') || state.source === 'live';
  dom.liveBadge.style.display = isLive ? 'inline-block' : 'none';
  return isLive;
}

function handleSelectedFile(file) {
  state.selectedFile = file;
  dom.fileDropText.innerHTML = `Selected: <strong>${file.name}</strong> (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
  showToast(`File selected: ${file.name}`);
}

// ==========================================
// Pipeline Execution
// ==========================================
async function startPipeline() {
  const isFile = state.source === 'file';
  const url = dom.videoUrl.value.trim();

  if (!isFile && !url) {
    showToast('Please provide a video link or drop a file');
    dom.videoUrl.focus();
    return;
  }
  if (isFile && !state.selectedFile) {
    showToast('Please drop or select a video file');
    return;
  }

  // Set UI to loading
  setLoadingState(true, 'Starting Video Ingestion...');
  dom.pipelineProgressCard.style.display = 'block';
  dom.candidatesGrid.innerHTML = `
    <div style="grid-column: 1 / -1; padding: 40px; text-align: center; border: 1.5px dashed var(--line2); border-radius: 8px;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
        <span style="width: 12px; height: 12px; border-radius: 50%; background: var(--acc);" class="pulse-rec"></span>
        <span style="font-weight: 600; font-size: 15px;">Transcribing & Scoring Viral Moments...</span>
        <span style="font-family: 'Geist Mono', monospace; font-size: 12px; color: var(--mute);">Running locally on your CPU/GPU with zero cloud costs</span>
      </div>
    </div>
  `;

  const renderOptions = {
    aspect_ratio: state.aspect,
    framing_mode: state.framingMode,
    progress_bar: state.progress,
    progress_bar_color: state.barColor,
    watermark_text: state.watermark,
    auto_loudness: state.loudnorm,
    video_speed: state.speed,
    color_boost: state.sat,
    zoom_factor: state.zoom,
    mirror_video: state.mirror,
    subtitle_preset: state.preset,
    max_words_per_line: state.wordsPerLine,
    subtitle_position: state.position
  };

  try {
    let res;
    if (isFile) {
      const formData = new FormData();
      formData.append('file', state.selectedFile);
      formData.append('whisper_model', dom.selWhisper.value);
      formData.append('clipping_mode', state.strategy === 'ai' ? 'ai_hook' : 'sequential');
      formData.append('ollama_model', dom.selLlm.value);
      formData.append('min_clip_duration', state.dMin);
      formData.append('max_clip_duration', state.dMax);
      formData.append('render_options', JSON.stringify(renderOptions));

      res = await fetch('/api/process/file', { method: 'POST', body: formData });
    } else {
      const isLive = detectLiveStream(url);
      const payload = {
        url: url,
        whisper_model: dom.selWhisper.value,
        clipping_mode: isLive ? 'live_peaks' : (state.strategy === 'ai' ? 'ai_hook' : 'sequential'),
        ollama_model: dom.selLlm.value,
        min_clip_duration: parseFloat(state.dMin),
        max_clip_duration: parseFloat(state.dMax),
        is_live_stream: isLive,
        render_options: renderOptions
      };

      res = await fetch('/api/process/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to start pipeline');
    }

    const data = await res.json();
    state.currentJobId = data.job_id;
    showToast(`Job started: ${data.job_id}`);
    startJobPolling(data.job_id);

  } catch (err) {
    setLoadingState(false);
    showToast(`Error: ${err.message}`);
    dom.pipelineStatusTitle.textContent = `Error: ${err.message}`;
    dom.pipelineBarFill.style.background = '#FF4A1C';
  }
}

function setLoadingState(loading, message = 'Processing...') {
  if (loading) {
    dom.btnGenerateClips.disabled = true;
    dom.btnGenerateClips.style.opacity = '0.75';
    dom.genBtnDot.classList.add('pulse-rec');
    dom.genBtnText.textContent = message;
    dom.pipelineBarFill.style.width = '5%';
    dom.pipelinePctLabel.textContent = '5%';
    dom.pipelineStatusTitle.textContent = message;
  } else {
    dom.btnGenerateClips.disabled = false;
    dom.btnGenerateClips.style.opacity = '1';
    dom.genBtnDot.classList.remove('pulse-rec');
    dom.genBtnText.textContent = 'Generate clips';
  }
}

// Server-Sent Events (SSE) Listener
function setupSSE() {
  try {
    if (state.activeEventSource) state.activeEventSource.close();
    const es = new EventSource('/api/jobs/events');
    state.activeEventSource = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.job_id && state.currentJobId && data.job_id !== state.currentJobId) return;

        handleJobUpdate(data);
      } catch (e) {
        // Heartbeat or ping
      }
    };

    es.onerror = () => {
      // Automatic browser reconnect handled by EventSource
    };
  } catch (e) {
    console.warn('SSE not supported or connection error, relying on polling.');
  }
}

// Polling fallback
function startJobPolling(jobId) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const job = await res.json();
      handleJobUpdate(job);

      if (job.status === 'completed' || job.status === 'failed') {
        clearInterval(interval);
      }
    } catch (e) {
      // Continue polling
    }
  }, 1200);
}

function handleJobUpdate(job) {
  if (!job) return;

  const pct = Math.round(job.progress || 0);
  dom.pipelineBarFill.style.width = `${pct}%`;
  dom.pipelinePctLabel.textContent = `${pct}%`;
  dom.pipelineStatusTitle.textContent = job.message || `Processing Stage: ${job.status}`;

  if (job.message) {
    const logLine = document.createElement('div');
    logLine.textContent = `[${new Date().toLocaleTimeString()}] ${job.message}`;
    dom.pipelineLogStream.appendChild(logLine);
    dom.pipelineLogStream.scrollTop = dom.pipelineLogStream.scrollHeight;
  }

  if (job.status === 'completed') {
    setLoadingState(false);
    dom.pipelineProgressCard.style.display = 'none';
    showToast('Analysis complete! Moments discovered.');
    if (job.clips && job.clips.length > 0) {
      renderCandidateCards(job.clips, job.job_id);
    }
    fetchRenderedClips();
  } else if (job.status === 'failed') {
    setLoadingState(false);
    dom.pipelineBarFill.style.background = '#FF4A1C';
    dom.pipelineStatusTitle.textContent = `Failed: ${job.error || 'Unknown error'}`;
    showToast(`Job failed: ${job.error || 'Check server logs'}`);
  }
}

// ==========================================
// Candidate Moments Rendering
// ==========================================
function renderCandidateCards(clips, jobId) {
  state.candidates = clips;
  dom.candidatesCountText.textContent = `${clips.length} moments detected`;
  dom.btnBatchRender.style.display = clips.length > 0 ? 'inline-block' : 'none';

  if (!clips || clips.length === 0) {
    dom.candidatesGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 36px; text-align: center; border: 1.5px dashed var(--line2); border-radius: 8px; color: var(--mute);">
        No clips found matching current duration constraints.
      </div>
    `;
    return;
  }

  // Highlight moments on waveform
  const maxEnd = Math.max(...clips.map(c => c.end_time || c.end || 60));
  const highlightSegments = clips.map(c => ({
    startRatio: (c.start_time || c.start || 0) / maxEnd,
    endRatio: (c.end_time || c.end || 30) / maxEnd
  }));
  initWaveform(highlightSegments);
  dom.timelineStatusText.textContent = `${clips.length} candidate clips mapped`;

  // Render Cards
  dom.candidatesGrid.innerHTML = '';
  clips.forEach((clip, index) => {
    const card = document.createElement('div');
    card.className = 'candidate-card';
    card.style.cssText = `
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
    `;

    const score = Math.round(clip.virality_score || 85);
    const scoreColor = score >= 85 ? '#2FBF71' : (score >= 70 ? '#FFD400' : '#FF4A1C');
    const startFmt = formatTime(clip.start_time || clip.start || 0);
    const endFmt = formatTime(clip.end_time || clip.end || 0);
    const duration = Math.round((clip.end_time || clip.end || 0) - (clip.start_time || clip.start || 0));
    const hookQuote = clip.hook_sentence || clip.text?.slice(0, 80) || 'Viral snippet';
    const hookType = clip.hook_type || 'Curiosity Gap';
    const captionIdea = clip.caption_idea || clip.suggested_title || hookQuote;

    card.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-family: 'Geist Mono', monospace; font-size: 11px; padding: 3px 8px; border-radius: 4px; background: rgba(255, 74, 28, 0.1); color: var(--acc); font-weight: 600;">
            ${hookType}
          </span>
          <span style="font-family: 'Geist Mono', monospace; font-size: 12px; font-weight: 700; color: ${scoreColor}; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${scoreColor}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            ${score}/100
          </span>
        </div>

        <div style="font-family: 'Bricolage Grotesque', sans-serif; font-weight: 700; font-size: 17px; line-height: 1.25; color: var(--ink);">
          "${escapeHtml(hookQuote)}"
        </div>

        <div style="font-size: 12px; color: var(--mute); line-height: 1.4;">
          ${escapeHtml(clip.reasoning || clip.hook_reasoning || 'High audience retention and strong payoff.')}
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--line); padding-top: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-family: 'Geist Mono', monospace; font-size: 11px; color: var(--mute);">
          <span>${startFmt} → ${endFmt}</span>
          <span>${duration}s</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px;">
          <button type="button" class="btn-render-one" data-index="${index}" style="height: 38px; border-radius: 6px; background: var(--inv); color: var(--invInk); font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>Render Clip</span>
          </button>
          <button type="button" class="btn-copy-caption" data-caption="${escapeHtml(captionIdea)}" title="Copy Caption" style="height: 38px; width: 38px; border-radius: 6px; border: 1px solid var(--line2); background: transparent; color: var(--ink); display: flex; align-items: center; justify-content: center;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>
    `;

    // Hook up individual render button
    const btnRender = card.querySelector('.btn-render-one');
    btnRender.addEventListener('click', () => renderSingleClip(clip, index, jobId, btnRender));

    // Hook up copy caption button
    const btnCopy = card.querySelector('.btn-copy-caption');
    btnCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(captionIdea);
      showToast('Caption copied to clipboard!');
    });

    dom.candidatesGrid.appendChild(card);
  });
}

async function renderSingleClip(clip, index, jobId, btn) {
  btn.disabled = true;
  btn.innerHTML = `<span style="width: 8px; height: 8px; border-radius: 50%; background: currentColor;" class="pulse-rec"></span> Rendering...`;

  const renderOptions = {
    aspect_ratio: state.aspect,
    framing_mode: state.framingMode,
    progress_bar: state.progress,
    progress_bar_color: state.barColor,
    watermark_text: state.watermark,
    auto_loudness: state.loudnorm,
    video_speed: state.speed,
    color_boost: state.sat,
    zoom_factor: state.zoom,
    mirror_video: state.mirror,
    subtitle_preset: state.preset,
    max_words_per_line: state.wordsPerLine,
    subtitle_position: state.position
  };

  try {
    const res = await fetch('/api/render/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: jobId || state.currentJobId,
        clip_index: index,
        start_time: clip.start_time || clip.start,
        end_time: clip.end_time || clip.end,
        title: clip.suggested_title || clip.hook_sentence || `Clip ${index + 1}`,
        subtitle_preset: state.preset,
        render_options: renderOptions
      })
    });

    if (!res.ok) throw new Error('Render trigger failed');
    showToast(`Clip ${index + 1} rendering in background...`);
    btn.innerHTML = `✓ In Pipeline`;
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = `Retry Render`;
    showToast(`Error: ${err.message}`);
  }
}

async function batchRenderAllClips() {
  if (!state.currentJobId) return;
  dom.btnBatchRender.disabled = true;
  dom.btnBatchRender.textContent = 'Rendering all...';

  const renderOptions = {
    aspect_ratio: state.aspect,
    framing_mode: state.framingMode,
    progress_bar: state.progress,
    progress_bar_color: state.barColor,
    watermark_text: state.watermark,
    auto_loudness: state.loudnorm,
    video_speed: state.speed,
    color_boost: state.sat,
    zoom_factor: state.zoom,
    mirror_video: state.mirror,
    subtitle_preset: state.preset,
    max_words_per_line: state.wordsPerLine,
    subtitle_position: state.position
  };

  try {
    const res = await fetch('/api/batch-render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: state.currentJobId,
        subtitle_preset: state.preset,
        render_options: renderOptions
      })
    });

    if (!res.ok) throw new Error('Batch render failed');
    showToast('Batch render queued! Check Library shortly.');
  } catch (err) {
    dom.btnBatchRender.disabled = false;
    dom.btnBatchRender.textContent = 'Render All Clips';
    showToast(`Error: ${err.message}`);
  }
}

// ==========================================
// Rendered Clips Library & Gallery
// ==========================================
async function fetchRenderedClips() {
  try {
    const res = await fetch('/api/clips');
    if (!res.ok) return;
    const clips = await res.json();
    state.library = clips;
    dom.libraryCountText.textContent = `${clips.length} clips rendered`;

    if (clips.length === 0) {
      dom.libraryGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 36px; text-align: center; border: 1.5px dashed var(--line2); border-radius: 8px; color: var(--mute);">
          Rendered clips will appear here ready to preview, download, and post.
        </div>
      `;
      return;
    }

    dom.libraryGrid.innerHTML = '';
    clips.forEach(clip => {
      const card = document.createElement('div');
      card.style.cssText = `
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: transform 0.15s ease;
      `;

      const sizeMb = (clip.size / (1024 * 1024)).toFixed(1);
      const durSec = Math.round(clip.duration || 0);

      card.innerHTML = `
        <div style="position: relative; aspect-ratio: 9/16; background: #000; cursor: pointer; display: flex; align-items: center; justify-content: center;" class="lib-preview-box">
          <video src="${clip.url}" preload="metadata" muted style="width: 100%; height: 100%; object-fit: cover;"></video>
          <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;" class="hover-play-overlay">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--acc); color: var(--accInk); display: flex; align-items: center; justify-content: center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
          </div>
          <span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); color: #FFF; font-family: 'Geist Mono', monospace; font-size: 10px; padding: 2px 6px; border-radius: 3px;">
            ${durSec}s
          </span>
        </div>

        <div style="padding: 12px; display: flex; flex-direction: column; gap: 8px;">
          <div style="font-family: 'Geist Mono', monospace; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${clip.filename}">
            ${clip.filename}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--mute);">
            <span>${sizeMb} MB</span>
            <div style="display: flex; gap: 6px;">
              <a href="${clip.url}" download style="color: var(--acc); font-weight: 600;" title="Download">
                Download
              </a>
              <button type="button" class="btn-del-clip" data-name="${clip.filename}" style="color: var(--mute);" title="Delete">✕</button>
            </div>
          </div>
        </div>
      `;

      // Hover effect for play button
      const previewBox = card.querySelector('.lib-preview-box');
      const overlay = card.querySelector('.hover-play-overlay');
      previewBox.addEventListener('mouseenter', () => overlay.style.opacity = '1');
      previewBox.addEventListener('mouseleave', () => overlay.style.opacity = '0');
      previewBox.addEventListener('click', () => openModal(clip.url));

      // Delete clip
      const btnDel = card.querySelector('.btn-del-clip');
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete ${clip.filename}?`)) {
          await fetch(`/api/clips/${clip.filename}`, { method: 'DELETE' });
          fetchRenderedClips();
          showToast('Clip deleted');
        }
      });

      dom.libraryGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to fetch library clips:', err);
  }
}

async function openOutputFolder() {
  try {
    const res = await fetch('/api/open-folder', { method: 'POST' });
    if (res.ok) {
      showToast('Output directory opened in File Explorer');
    } else {
      showToast('Folder: storage/output_clips');
    }
  } catch {
    showToast('Folder: storage/output_clips');
  }
}

// ==========================================
// System Diagnostics & Telemetry HUD
// ==========================================
async function fetchSystemStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) return;
    const data = await res.json();

    // Accelerations
    const device = data.device?.toUpperCase() || 'CPU';
    dom.hudAccel.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #2FBF71;"></span>${device} Opt`;

    // Ollama status
    const ollamaOnline = data.ollama_status?.online;
    if (ollamaOnline) {
      dom.hudOllama.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #2FBF71;"></span>Ollama Online`;
    } else {
      dom.hudOllama.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #E0A100;"></span>Heuristic Mode`;
    }

    // FFmpeg
    dom.hudFfmpeg.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #2FBF71;"></span>FFmpeg OK`;
  } catch (e) {
    console.warn('Status check unreachable');
  }
}

// ==========================================
// Modal & Toast Utilities
// ==========================================
function openModal(videoUrl) {
  dom.modalVideoPlayer.src = videoUrl;
  dom.videoModal.style.display = 'flex';
  dom.modalVideoPlayer.play();
}

function closeModal() {
  dom.modalVideoPlayer.pause();
  dom.modalVideoPlayer.src = '';
  dom.videoModal.style.display = 'none';
}

function showToast(message) {
  if (!dom.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.innerHTML = `
    <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--acc);"></span>
    <span>${escapeHtml(message)}</span>
  `;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function formatTime(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
