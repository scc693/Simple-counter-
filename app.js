const STORAGE_KEY = 'clicker-state';
const defaultState = {
  count: 0,
  step: 1,
  label: '',
  seqEnabled: true,
  seqByLabel: {},
  tape: [],
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
  label: document.getElementById('label'),
  seqEnabled: document.getElementById('seqEnabled'),
  sequenceDisplay: document.getElementById('sequenceDisplay'),
  resetSequence: document.getElementById('resetSequence'),
  printTape: document.getElementById('printTape'),
  shareCount: document.getElementById('shareCount'),
  exportTape: document.getElementById('exportTape'),
  clearTape: document.getElementById('clearTape'),
  tapeList: document.getElementById('tapeList'),
  tapeTemplate: document.getElementById('tapeItemTemplate'),
  soundToggle: document.getElementById('soundToggle'),
  hapticsToggle: document.getElementById('hapticsToggle'),
  themeToggle: document.getElementById('themeToggle'),
  compactToggle: document.getElementById('compactToggle'),
  announcer: document.getElementById('announcer')
};

let state = loadState();
let audioContext;

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return deepClone(defaultState);
    const parsed = JSON.parse(stored);
    return {
      ...deepClone(defaultState),
      ...parsed,
      seqByLabel: { ...defaultState.seqByLabel, ...(parsed.seqByLabel || {}) },
      tape: Array.isArray(parsed.tape) ? parsed.tape : [],
      toggles: { ...defaultState.toggles, ...(parsed.toggles || {}) }
    };
  } catch (error) {
    console.error('Failed to load state', error);
    return deepClone(defaultState);
  }
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
  if (!state.seqEnabled) {
    elements.sequenceDisplay.textContent = 'Sequence off';
    elements.sequenceDisplay.setAttribute('aria-label', 'Sequence disabled for this description');
    return;
  }
  const seq = getNextSequence();
  elements.sequenceDisplay.textContent = `Sequence #${seq}`;
  elements.sequenceDisplay.removeAttribute('aria-label');
}

function updateCountDisplay() {
  elements.count.textContent = state.count;
}

function updateTapeList() {
  const list = elements.tapeList;
  list.innerHTML = '';
  if (!state.tape.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Tape is empty. Use "Print to Tape" to add entries.';
    empty.className = 'help';
    empty.setAttribute('role', 'status');
    list.appendChild(empty);
    return;
  }
  state.tape.forEach(entry => {
    const clone = elements.tapeTemplate.content.firstElementChild.cloneNode(true);
    clone.dataset.id = entry.id;
    const timeEl = clone.querySelector('.tape-time');
    const labelEl = clone.querySelector('.tape-label');
    const seqEl = clone.querySelector('.tape-seq');
    const countEl = clone.querySelector('.tape-count');
    const date = new Date(entry.ts);
    timeEl.textContent = date.toLocaleString();
    timeEl.dateTime = entry.ts;
    labelEl.textContent = entry.label || '—';
    seqEl.textContent = entry.seq != null ? `Seq ${entry.seq}` : '—';
    countEl.textContent = entry.count;
    list.appendChild(clone);
  });
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
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    ts: new Date().toISOString(),
    label: state.label.trim(),
    seq: state.seqEnabled ? getNextSequence() : null,
    count: state.count
  };
  state.tape = [entry, ...state.tape];
  if (state.seqEnabled) {
    const key = getLabelKey();
    state.seqByLabel[key] = entry.seq + 1;
  }
  setCount(0);
  announce('Entry added to tape');
  updateSequenceDisplay();
  updateTapeList();
  saveState();
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

function handleDescriptionChange() {
  state.label = elements.label.value;
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
  elements.label.addEventListener('input', handleDescriptionChange);
  elements.seqEnabled.addEventListener('change', handleSeqToggle);
  elements.resetSequence.addEventListener('click', handleResetSequence);
  elements.printTape.addEventListener('click', handlePrintToTape);
  elements.shareCount.addEventListener('click', handleShareCount);
  elements.exportTape.addEventListener('click', handleExportTape);
  elements.clearTape.addEventListener('click', handleClearTape);

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
  elements.label.value = state.label;
  elements.seqEnabled.checked = state.seqEnabled;
  applyToggles();
  updateSequenceDisplay();
  updateCountDisplay();
  updateTapeList();
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
