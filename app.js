const STORAGE_KEY = 'cc:v3';
const LEGACY_KEYS = ['clicker-state'];

const defaultState = {
  count: 0,
  step: 1,
  job: '',
  label: '',
  seqEnabled: true,
  seqTitleMode: 'simple',
  seqTitleCustom: '',
  seqByLabel: {},
  tape: [],
  daily: {
    dateISO: getLocalDateISO(),
    entries: []
  },
  toggles: {
    sound: false,
    haptics: false,
    theme: 'system',
    compact: false
  }
};

const elements = {
  count: document.getElementById('count'),
  increment: document.getElementById('increment'),
  decrement: document.getElementById('decrement'),
  reset: document.getElementById('reset'),
  step: document.getElementById('step'),
  job: document.getElementById('job'),
  label: document.getElementById('label'),
  seqEnabled: document.getElementById('seqEnabled'),
  seqTitleMode: document.getElementById('seqTitleMode'),
  seqTitleCustom: document.getElementById('seqTitleCustom'),
  seqTitleCustomField: document.getElementById('seqTitleCustomField'),
  sequenceDisplay: document.getElementById('sequenceDisplay'),
  resetSequence: document.getElementById('resetSequence'),
  printTape: document.getElementById('printTape'),
  shareCount: document.getElementById('shareCount'),
  exportTape: document.getElementById('exportTape'),
  exportDailyCsv: document.getElementById('exportDailyCsv'),
  clearTape: document.getElementById('clearTape'),
  tapeList: document.getElementById('tapeList'),
  tapeTemplate: document.getElementById('tapeItemTemplate'),
  dailyDetails: document.getElementById('dailyTapeDetails'),
  dailyList: document.getElementById('dailyTapeList'),
  clearDay: document.getElementById('clearDay'),
  soundToggle: document.getElementById('soundToggle'),
  hapticsToggle: document.getElementById('hapticsToggle'),
  themeToggle: document.getElementById('themeToggle'),
  compactToggle: document.getElementById('compactToggle'),
  announcer: document.getElementById('announcer')
};

let state = loadState();
if (ensureDailyDate(state)) {
  saveState();
}
let audioContext;

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const migrated = migrateState(JSON.parse(stored));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }

    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const migrated = migrateState(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      try { localStorage.removeItem(key); } catch (error) { console.warn('Unable to remove legacy state', error); }
      return migrated;
    }
  } catch (error) {
    console.error('Failed to load state', error);
  }
  return deepClone(defaultState);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save state', error);
  }
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function migrateState(raw) {
  const base = deepClone(defaultState);
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  const next = {
    ...base,
    count: Number.isFinite(raw.count) ? raw.count : base.count,
    step: Math.max(1, Number(raw.step) || base.step),
    job: typeof raw.job === 'string' ? raw.job : base.job,
    label: typeof raw.label === 'string' ? raw.label : base.label,
    seqEnabled: raw.seqEnabled !== false,
    seqTitleMode: ['none', 'simple', 'custom'].includes(raw.seqTitleMode) ? raw.seqTitleMode : base.seqTitleMode,
    seqTitleCustom: typeof raw.seqTitleCustom === 'string' ? raw.seqTitleCustom : base.seqTitleCustom,
    toggles: {
      ...base.toggles,
      ...(typeof raw.toggles === 'object' && raw.toggles ? raw.toggles : {})
    }
  };

  next.seqByLabel = {};
  if (raw.seqByLabel && typeof raw.seqByLabel === 'object') {
    for (const [key, value] of Object.entries(raw.seqByLabel)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        next.seqByLabel[key] = Math.floor(numeric);
      }
    }
  }

  const normalizeEntries = entries => {
    if (!Array.isArray(entries)) return [];
    return entries.map(entry => normalizeTapeEntry(entry, next)).filter(Boolean);
  };

  next.tape = normalizeEntries(raw.tape);

  if (raw.daily && typeof raw.daily === 'object') {
    const dateISO = typeof raw.daily.dateISO === 'string' ? raw.daily.dateISO : null;
    next.daily = {
      dateISO: dateISO || base.daily.dateISO,
      entries: normalizeEntries(raw.daily.entries)
    };
  }

  ensureDailyDate(next);
  return next;
}

function normalizeTapeEntry(entry, context = defaultState) {
  if (!entry || typeof entry !== 'object') return null;
  const id = typeof entry.id === 'string' ? entry.id : generateId();
  const tsValue = Number(entry.ts);
  let ts = Number.isFinite(tsValue) ? tsValue : Date.parse(entry.ts);
  if (!Number.isFinite(ts)) {
    ts = Date.now();
  }
  const label = typeof entry.label === 'string' ? entry.label : '';
  const job = typeof entry.job === 'string' ? entry.job : (typeof context.job === 'string' ? context.job : '');
  const seqValue = entry.seq == null ? null : Number(entry.seq);
  const seq = Number.isFinite(seqValue) ? Math.max(0, Math.floor(seqValue)) : null;
  let seqMode = typeof entry.seqMode === 'string' ? entry.seqMode : null;
  if (!['none', 'simple', 'custom'].includes(seqMode)) {
    seqMode = seq != null ? 'simple' : 'none';
  }
  let customPrefix = '';
  if (seqMode === 'custom') {
    if (typeof entry.seqTitleCustom === 'string' && entry.seqTitleCustom.trim()) {
      customPrefix = entry.seqTitleCustom.trim();
    } else if (typeof context.seqTitleCustom === 'string') {
      customPrefix = context.seqTitleCustom;
    }
  }
  let seqText = typeof entry.seqText === 'string' ? entry.seqText : '';
  if (seq == null) {
    seqMode = 'none';
    seqText = '';
  } else if (!seqText) {
    seqText = getSequenceText(seqMode, seq, customPrefix);
  }
  const countValue = Number(entry.count);
  const count = Number.isFinite(countValue) ? countValue : 0;
  return { id, ts, job, label, seq, seqMode, seqText, count };
}

function ensureDailyDate(target = state) {
  let changed = false;
  if (!target.daily || typeof target.daily !== 'object') {
    target.daily = deepClone(defaultState.daily);
    return true;
  }
  const today = getLocalDateISO();
  if (target.daily.dateISO !== today) {
    target.daily.dateISO = today;
    target.daily.entries = [];
    changed = true;
  }
  if (!Array.isArray(target.daily.entries)) {
    target.daily.entries = [];
    changed = true;
  }
  return changed;
}

function getLocalDateISO(date = new Date()) {
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}

function getSequenceText(mode, seq, custom = '') {
  if (seq == null || mode === 'none') {
    return '';
  }
  if (mode === 'custom') {
    const prefix = custom ? `${custom.trim()} ` : '';
    return `${prefix}#${seq}`.trim();
  }
  return `#${seq}`;
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatCsvValue(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function getLabelKey(label = state.label) {
  return (label || '').trim().toLowerCase() || '__default__';
}

function getNextSequence() {
  const key = getLabelKey();
  if (!state.seqByLabel[key]) {
    state.seqByLabel[key] = 1;
  }
  return state.seqByLabel[key];
}

function updateSequenceDisplay() {
  if (!elements.sequenceDisplay) return;
  if (!state.seqEnabled) {
    elements.sequenceDisplay.textContent = 'Sequence off';
    elements.sequenceDisplay.setAttribute('aria-label', 'Sequence disabled for this description');
    return;
  }
  const seq = getNextSequence();
  const displayText = getSequenceText(state.seqTitleMode, seq, state.seqTitleCustom) || `#${seq}`;
  const hiddenOnTape = state.seqTitleMode === 'none';
  elements.sequenceDisplay.textContent = hiddenOnTape ? `Next: #${seq}` : `Next: ${displayText}`;
  elements.sequenceDisplay.setAttribute('aria-label', hiddenOnTape ? `Next sequence number ${seq}, hidden on tape` : `Next sequence ${displayText}`);
}

function updateSequenceModeUI() {
  if (!elements.seqTitleMode || !elements.seqTitleCustomField || !elements.seqTitleCustom) return;
  elements.seqTitleMode.value = state.seqTitleMode;
  const isCustom = state.seqTitleMode === 'custom';
  elements.seqTitleCustomField.hidden = !isCustom;
  elements.seqTitleCustom.disabled = !isCustom;
  elements.seqTitleCustom.value = state.seqTitleCustom;
}

function updateCountDisplay() {
  elements.count.textContent = state.count;
}

function renderTapeEntries(list, entries, emptyMessage) {
  if (!list || !elements.tapeTemplate) return;
  list.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('li');
    empty.textContent = emptyMessage;
    empty.className = 'help';
    empty.setAttribute('role', 'status');
    list.appendChild(empty);
    return;
  }
  entries.forEach(entry => {
    const clone = elements.tapeTemplate.content.firstElementChild.cloneNode(true);
    clone.dataset.id = entry.id;
    const timeEl = clone.querySelector('.tape-time');
    const labelEl = clone.querySelector('.tape-label');
    const jobEl = clone.querySelector('.tape-job');
    const seqEl = clone.querySelector('.tape-seq');
    const countEl = clone.querySelector('.tape-count');
    const date = new Date(entry.ts);
    timeEl.textContent = date.toLocaleString();
    timeEl.dateTime = date.toISOString();
    labelEl.textContent = entry.label || '—';
    if (jobEl) {
      jobEl.textContent = entry.job || '';
      jobEl.hidden = !entry.job;
    }
    if (seqEl) {
      seqEl.textContent = entry.seqText || '';
      seqEl.hidden = !entry.seqText;
    }
    countEl.textContent = entry.count;
    list.appendChild(clone);
  });
}

function updateTapeList() {
  renderTapeEntries(elements.tapeList, state.tape, 'Tape is empty. Use "Print to Tape" to add entries.');
}

function updateDailyTapeList() {
  if (ensureDailyDate()) {
    saveState();
  }
  renderTapeEntries(elements.dailyList, state.daily.entries, 'Daily tape is empty. Every Print-to-Tape event will appear here.');
}

function applyToggles() {
  elements.soundToggle.checked = state.toggles.sound;
  elements.hapticsToggle.checked = state.toggles.haptics;
  elements.themeToggle.value = state.toggles.theme;
  elements.compactToggle.checked = state.toggles.compact;
  applyTheme(state.toggles.theme);
  document.body.classList.toggle('compact', Boolean(state.toggles.compact));
}

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'system') {
    html.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', theme);
  }
}

function setCount(value) {
  state.count = value;
  updateCountDisplay();
  saveState();
}

function changeCount(delta) {
  const newValue = state.count + delta;
  setCount(newValue);
  feedback();
}

function stepUpOnce() {
  changeCount(getStep());
}

function stepDownOnce() {
  changeCount(-getStep());
}

function resetCount() {
  setCount(0);
  feedback();
  announce('Counter reset');
}

function feedback() {
  if (state.toggles.haptics && 'vibrate' in navigator) {
    navigator.vibrate(15);
  }
  if (state.toggles.sound) {
    playSound();
  }
}

function playSound() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    const duration = 0.08;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.001;
    gain.gain.exponentialRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.warn('Unable to play sound', error);
  }
}

function announce(message) {
  if (!elements.announcer) return;
  elements.announcer.textContent = '';
  requestAnimationFrame(() => {
    elements.announcer.textContent = message;
  });
}

function getStep() {
  const step = Math.max(1, Number(elements.step.value) || 1);
  elements.step.value = step;
  state.step = step;
  saveState();
  return step;
}

function handlePrintToTape() {
  ensureDailyDate();
  const seq = state.seqEnabled ? getNextSequence() : null;
  const seqMode = state.seqEnabled ? state.seqTitleMode : 'none';
  const entry = {
    id: generateId(),
    ts: Date.now(),
    job: state.job.trim(),
    label: state.label.trim(),
    seq,
    seqMode,
    seqText: seq != null ? getSequenceText(seqMode, seq, state.seqTitleCustom) : '',
    count: state.count
  };
  state.tape = [entry, ...state.tape];
  state.daily.entries = [entry, ...state.daily.entries];
  if (seq != null) {
    const key = getLabelKey();
    state.seqByLabel[key] = seq + 1;
  }
  setCount(0);
  announce('Entry added to tape');
  updateSequenceDisplay();
  updateTapeList();
  updateDailyTapeList();
}

function handleClearTape() {
  if (!state.tape.length) return;
  if (confirm('Clear all tape entries? This cannot be undone.')) {
    state.tape = [];
    saveState();
    updateTapeList();
    announce('Tape cleared');
  }
}

function handleExportTape() {
  window.open('print.html?auto=1', '_blank', 'noopener');
}

function handleShareCount() {
  const description = state.label.trim() || 'Untitled item';
  const text = `${description}: ${state.count}`;
  const title = 'Clicker Counter';
  if (navigator.share) {
    navigator.share({ title, text }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => announce('Count copied to clipboard')).catch(() => announce('Unable to copy'));
  } else {
    prompt('Copy this count', text);
  }
}

function handleExportDailyCsv() {
  const rolled = ensureDailyDate();
  if (rolled) {
    saveState();
  }
  const merged = new Map();
  state.daily.entries.forEach(entry => merged.set(entry.id, entry));
  state.tape.forEach(entry => merged.set(entry.id, entry));
  const combined = Array.from(merged.values());
  if (!combined.length) {
    announce('No entries to export yet');
    return;
  }
  combined.sort((a, b) => a.ts - b.ts);
  const rows = [
    ['timestamp', 'job', 'label', 'sequence', 'sequence_mode', 'sequence_text', 'count']
  ];
  combined.forEach(entry => {
    rows.push([
      new Date(entry.ts).toISOString(),
      entry.job || '',
      entry.label || '',
      entry.seq != null ? entry.seq : '',
      entry.seqMode || (entry.seq != null ? 'simple' : 'none'),
      entry.seqText || '',
      entry.count
    ]);
  });
  const csv = rows.map(row => row.map(formatCsvValue).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const filename = `clicker-counter-${state.daily.dateISO || getLocalDateISO()}.csv`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  window.setTimeout(() => {
    if (confirm('Clear day from counter?')) {
      clearDayState({ skipConfirm: true });
    } else {
      announce('Daily report saved');
    }
  }, 75);
}

function handleJobChange() {
  state.job = elements.job.value;
  saveState();
}

function handleDescriptionChange() {
  state.label = elements.label.value;
  saveState();
  updateSequenceDisplay();
}

function handleSeqTitleModeChange() {
  state.seqTitleMode = elements.seqTitleMode.value;
  updateSequenceModeUI();
  saveState();
  updateSequenceDisplay();
}

function handleSeqTitleCustomInput() {
  state.seqTitleCustom = elements.seqTitleCustom.value;
  saveState();
  updateSequenceDisplay();
}

function handleSeqToggle() {
  state.seqEnabled = elements.seqEnabled.checked;
  saveState();
  updateSequenceDisplay();
}

function handleResetSequence() {
  const key = getLabelKey();
  state.seqByLabel[key] = 1;
  saveState();
  updateSequenceDisplay();
  announce('Sequence reset for current description');
}

function clearDayState({ skipConfirm = false } = {}) {
  const hasData = state.count !== 0 || state.tape.length || (state.daily && state.daily.entries && state.daily.entries.length);
  if (!hasData) {
    announce('Nothing to clear');
    return false;
  }
  if (!skipConfirm) {
    const confirmed = confirm('Clear day from counter? This removes today\'s tape entries, daily log, and resets sequences.');
    if (!confirmed) {
      return false;
    }
  }
  state.tape = [];
  state.daily = { dateISO: getLocalDateISO(), entries: [] };
  state.seqByLabel = {};
  state.count = 0;
  saveState();
  updateCountDisplay();
  updateTapeList();
  updateDailyTapeList();
  if (elements.dailyDetails) {
    elements.dailyDetails.open = false;
  }
  updateSequenceDisplay();
  announce('Day cleared');
  return true;
}

function makePressRepeater(button, onStep) {
  let holdTimer = null;
  let repeatTimer = null;
  let repeating = false;
  let pressed = false;
  let suppressNextClick = false;

  const clearTimers = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (repeatTimer) {
      clearInterval(repeatTimer);
      repeatTimer = null;
    }
    repeating = false;
    pressed = false;
  };

  const startPress = event => {
    if (event.button != null && event.button !== 0) {
      return;
    }
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    pressed = true;
    repeating = false;
    holdTimer = window.setTimeout(() => {
      if (!pressed) return;
      repeating = true;
      suppressNextClick = true;
      onStep();
      repeatTimer = window.setInterval(onStep, 100);
    }, 300);
  };

  const finishPress = () => {
    if (!pressed) {
      return;
    }
    const wasRepeating = repeating;
    clearTimers();
    suppressNextClick = true;
    if (!wasRepeating) {
      onStep();
    }
  };

  const cancelPress = () => {
    if (!pressed) {
      return;
    }
    clearTimers();
    suppressNextClick = false;
  };

  button.addEventListener('pointerdown', startPress);
  ['pointerup', 'pointerleave', 'lostpointercapture'].forEach(type => {
    button.addEventListener(type, finishPress);
  });
  button.addEventListener('pointercancel', cancelPress);
  button.addEventListener('blur', cancelPress);
  window.addEventListener('blur', cancelPress);

  button.addEventListener('click', event => {
    if (suppressNextClick) {
      event.stopImmediatePropagation();
      event.preventDefault();
      suppressNextClick = false;
      return;
    }
    onStep();
  }, { capture: true });
}

function bindEvents() {
  makePressRepeater(elements.increment, stepUpOnce);
  makePressRepeater(elements.decrement, stepDownOnce);
  elements.reset.addEventListener('click', resetCount);
  elements.step.addEventListener('change', getStep);
  elements.job.addEventListener('input', handleJobChange);
  elements.label.addEventListener('input', handleDescriptionChange);
  elements.seqEnabled.addEventListener('change', handleSeqToggle);
  elements.seqTitleMode.addEventListener('change', handleSeqTitleModeChange);
  elements.seqTitleCustom.addEventListener('input', handleSeqTitleCustomInput);
  elements.resetSequence.addEventListener('click', handleResetSequence);
  elements.printTape.addEventListener('click', handlePrintToTape);
  elements.shareCount.addEventListener('click', handleShareCount);
  elements.exportTape.addEventListener('click', handleExportTape);
  elements.exportDailyCsv.addEventListener('click', handleExportDailyCsv);
  elements.clearTape.addEventListener('click', handleClearTape);
  elements.clearDay.addEventListener('click', () => clearDayState());

  elements.soundToggle.addEventListener('change', () => {
    state.toggles.sound = elements.soundToggle.checked;
    saveState();
  });

  elements.hapticsToggle.addEventListener('change', () => {
    state.toggles.haptics = elements.hapticsToggle.checked;
    saveState();
  });

  elements.themeToggle.addEventListener('change', () => {
    state.toggles.theme = elements.themeToggle.value;
    applyTheme(state.toggles.theme);
    saveState();
  });

  elements.compactToggle.addEventListener('change', () => {
    state.toggles.compact = elements.compactToggle.checked;
    document.body.classList.toggle('compact', state.toggles.compact);
    saveState();
  });

  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
      return;
    }
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        stepUpOnce();
        break;
      case 'ArrowDown':
        event.preventDefault();
        stepDownOnce();
        break;
      case '0':
      case 'r':
      case 'R': {
        event.preventDefault();
        resetCount();
        break;
      }
      case 'p':
      case 'P': {
        if (event.shiftKey) {
          event.preventDefault();
          handlePrintToTape();
        }
        break;
      }
      default:
        break;
    }
  });
}

function init() {
  elements.step.value = state.step;
  elements.job.value = state.job;
  elements.label.value = state.label;
  elements.seqEnabled.checked = state.seqEnabled;
  elements.seqTitleCustom.value = state.seqTitleCustom;
  updateSequenceModeUI();
  applyToggles();
  updateSequenceDisplay();
  updateCountDisplay();
  updateTapeList();
  updateDailyTapeList();
  bindEvents();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.toggles.theme === 'system') {
      applyTheme('system');
    }
  });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.error('Service worker registration failed', err));
    });
  }
}

init();
