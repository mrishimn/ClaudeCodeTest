/* script.js — main game logic for the number-guessing game.
   Picks a secret number, checks each guess, manages win/timeout/reset,
   persists best scores per difficulty+timer combo, drives the hot/cold color
   shift + shake, runs the countdown timer, and paints the range-narrowing bar. */

// ── Constants ──────────────────────────────────────
const DIFFICULTIES = {
  easy:   { max: 100 },
  medium: { max: 500 },
  hard:   { max: 1000 },
  brutal: { max: 2000 },
};
// Start-screen-only preview tints that appear when a difficulty is selected.
const DIFFICULTY_COLORS = {
  easy:   { bg: '#1e3a5f', tint: '#8ba3c4' },
  medium: { bg: '#2e3a48', tint: '#9ba3b0' },
  hard:   { bg: '#5a3828', tint: '#b89888' },
  brutal: { bg: '#8a3020', tint: '#d49888' },
};
const STORAGE_KEY = 'guessGameBestScores';
const TIMER_STEPS = [0, 15, 30, 45, 60, 90]; // index 0 = off; rest are seconds
const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'brutal'];
// Human-readable label per internal key. Keeps display text decoupled from
// the storage key, so renaming a level internally won't drift the UI copy.
const DIFFICULTY_LABELS = {
  easy:   'easy',
  medium: 'medium',
  hard:   'hard',
  brutal: 'brutal',
};
// Per-level shake + chromatic + motion-blur durations, in ms.
const SHAKE_DURATIONS = { easy: 200, medium: 300, hard: 400, brutal: 500 };
const SWITCH_SESSION_KEY = 'numgsrSwitchDifficulty';

// ── State ──────────────────────────────────────────
let target = 0;
let guesses = [];
let currentDifficulty = loadSwitchDifficulty();
let rangeMax = 0;
let lowerBound = 1;
let upperBound = 0;
let timerIndex = 0;
let bestScores = loadBestScores();

// Timer (countdown) state
let timerActive = false;
let timerStartTime = 0;
let timerTotalMs = 0;
let timerPausedMs = 0;
let timerPauseStart = 0;
let timerRafId = 0;

// Slider drag state
let sliderDragging = false;

// Difficulty effect state
let effectToken = 0;

// ── DOM references ─────────────────────────────────
const wordmarkBtn    = document.getElementById('wordmarkBtn');
const card           = document.getElementById('card');
const cornerMark     = document.getElementById('cornerMark');
const startScreen    = document.getElementById('startScreen');
const gameScreen     = document.getElementById('gameScreen');
const timerDisplay   = document.getElementById('timerDisplay');
const goBtn            = document.getElementById('goBtn');
const difficultySwitch = document.getElementById('difficultySwitch');
const difficultyHandle = document.getElementById('difficultyHandle');
const difficultySlots  = document.querySelectorAll('.difficulty-slot');
const difficultyLabel  = document.getElementById('difficultyLabel');
const bestSingle       = document.getElementById('bestSingle');
const timerSlider    = document.getElementById('timerSlider');
const timerHandle    = document.getElementById('timerHandle');
const timerTrack     = document.getElementById('timerTrack');
const timerTickLabels = document.querySelectorAll('.timer-tick-label');
const form           = document.getElementById('form');
const input          = document.getElementById('guess');
const headline       = document.getElementById('headline');
const intro          = document.getElementById('intro');
const introRange     = document.getElementById('introRange');
const historyEl      = document.getElementById('history');
const newBest        = document.getElementById('newBest');
const winSubtext     = document.getElementById('winSubtext');
const timeSpare      = document.getElementById('timeSpare');
const prompt         = document.getElementById('prompt');
const errorEl        = document.getElementById('error');
const resetBtn       = document.getElementById('resetBtn');
const playAgainBtn   = document.getElementById('playAgainBtn');
const resetScoresBtn = document.getElementById('resetScoresBtn');
const utilityLinks   = document.getElementById('utilityLinks');
const resetConfirm   = document.getElementById('resetConfirm');
const confirmYes     = document.getElementById('confirmYes');
const confirmNo      = document.getElementById('confirmNo');
const rangeAlive     = document.getElementById('rangeAlive');
const rangeTicks     = document.getElementById('rangeTicks');
const rangeLabelLower = document.getElementById('rangeLabelLower');
const rangeLabelUpper = document.getElementById('rangeLabelUpper');

// ── Helpers ────────────────────────────────────────

// Turn raw input text into a valid number 1–rangeMax, or flag an error.
function parse(raw) {
  const s = raw.trim();
  if (s === '') return { error: true };
  if (!/^\d+$/.test(s)) return { error: true };
  const n = parseInt(s, 10);
  if (n < 1 || n > rangeMax) return { error: true };
  return { n };
}

// Build a fresh all-null best-scores record in the nested shape.
function makeEmptyScores() {
  const diffs = ['easy', 'medium', 'hard', 'brutal'];
  const timerKeys = ['untimed', '15', '30', '45', '60', '90'];
  const out = {};
  for (const d of diffs) {
    out[d] = {};
    for (const t of timerKeys) out[d][t] = null;
  }
  return out;
}

// Read best scores from localStorage; migrate from the old flat shape if found.
function loadBestScores() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const fresh = makeEmptyScores();
  if (!raw) return fresh;
  try {
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed);
    // Old flat shape: values are null or numbers. Migrate into nested.
    const isOldShape = keys.length > 0 && keys.every(
      (k) => parsed[k] === null || typeof parsed[k] === 'number'
    );
    if (isOldShape) {
      const migrated = makeEmptyScores();
      for (const k of keys) {
        if (k in migrated) migrated[k].untimed = parsed[k];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    // Already nested: fill in any missing difficulty or timer key.
    for (const d of Object.keys(fresh)) {
      if (!parsed[d] || typeof parsed[d] !== 'object') parsed[d] = fresh[d];
      else {
        for (const tk of Object.keys(fresh[d])) {
          if (parsed[d][tk] === undefined) parsed[d][tk] = null;
        }
      }
    }
    return parsed;
  } catch (e) {
    return fresh;
  }
}

// Persist best scores to localStorage.
function saveBestScores() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bestScores));
}

// Return the bestScores sub-key for the current timer setting.
function currentTimerKey() {
  return timerIndex === 0 ? 'untimed' : String(TIMER_STEPS[timerIndex]);
}

// Pick the card background color for a given coldness value (0 = burning, 1 = freezing).
function getCardColor(coldness) {
  if (coldness < 0.02) return '#c8341a';
  if (coldness < 0.08) return '#d9632a';
  if (coldness < 0.15) return '#a56b2e';
  if (coldness < 0.30) return '#1a1a1a';
  if (coldness < 0.50) return '#1e3a5f';
  if (coldness < 0.75) return '#162a47';
  return '#0d1e38';
}

// Pick the muted-text tint that pairs with the card color at a given coldness.
function getAccentTint(coldness) {
  if (coldness < 0.08) return '#e6a898';
  if (coldness < 0.15) return '#d4b896';
  if (coldness < 0.30) return '#888888';
  if (coldness < 0.50) return '#8ba3c4';
  if (coldness < 0.75) return '#7a95bf';
  return '#6889b8';
}

// Apply a card background color and matching muted-text tint via CSS variables.
function setCardColors(bg, tint) {
  card.style.setProperty('--card-bg', bg);
  card.style.setProperty('--accent-tint', tint);
}

// Format a millisecond value as "m:ss" (no leading zero on minutes).
function formatTime(ms) {
  const totalSec = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + (s < 10 ? '0' + s : s);
}

// Compute ms remaining on the timer, accounting for any active/total pauses.
function getRemainingMs() {
  if (!timerActive) return 0;
  const now = performance.now();
  const currentPause = timerPauseStart ? now - timerPauseStart : 0;
  const elapsed = now - timerStartTime - timerPausedMs - currentPause;
  return Math.max(0, timerTotalMs - elapsed);
}

// Translate a guess/bound value into its horizontal percentage on the range bar.
function pctFor(value) {
  if (rangeMax <= 1) return 0;
  return ((value - 1) / (rangeMax - 1)) * 100;
}

// Update the single best-score line; crossfade if the value changed.
// Reads bestScores[currentDifficulty][currentTimerKey()] — slider + switch both feed it.
function renderBestSingle() {
  const score = bestScores[currentDifficulty][currentTimerKey()];
  const newText = 'best: ' + (score === null ? '—' : score);
  if (bestSingle.textContent === newText) return;
  bestSingle.classList.add('fading');
  setTimeout(() => {
    bestSingle.textContent = newText;
    bestSingle.classList.remove('fading');
  }, 150);
}

// Read the difficulty the user picked earlier this session (default 'easy').
// Does NOT persist across page reloads (sessionStorage, not localStorage).
function loadSwitchDifficulty() {
  try {
    const stored = sessionStorage.getItem(SWITCH_SESSION_KEY);
    if (stored && DIFFICULTY_ORDER.includes(stored)) return stored;
  } catch (_) {}
  return 'easy';
}

// Remember the switch position for the rest of this tab session.
function saveSwitchDifficulty() {
  try { sessionStorage.setItem(SWITCH_SESSION_KEY, currentDifficulty); } catch (_) {}
}

// Slide the large handle over the current level's dot; update the text label.
// Handle left % matches the fixed dot positions declared in styles.css.
function renderDifficultySwitch() {
  const idx = DIFFICULTY_ORDER.indexOf(currentDifficulty);
  const pct = 15 + (idx / 3) * 70; // 15, 38.33, 61.67, 85
  difficultyHandle.style.left = pct + '%';
  difficultyLabel.textContent = DIFFICULTY_LABELS[currentDifficulty];
}

// Advance the switch by `direction` steps (1 = forward, -1 = back), wrapping at ends.
function cycleDifficulty(direction) {
  const idx = DIFFICULTY_ORDER.indexOf(currentDifficulty);
  const len = DIFFICULTY_ORDER.length;
  const next = (idx + direction + len) % len;
  changeDifficulty(DIFFICULTY_ORDER[next]);
}

// Commit a switch change: update state, card colors, label, score line, and fire effects.
function changeDifficulty(newLevel) {
  if (!DIFFICULTY_ORDER.includes(newLevel)) return;
  if (newLevel === currentDifficulty) {
    // Drag may have nudged the handle off a tick — snap it back.
    renderDifficultySwitch();
    return;
  }
  currentDifficulty = newLevel;
  saveSwitchDifficulty();
  const c = DIFFICULTY_COLORS[newLevel];
  setCardColors(c.bg, c.tint);
  renderDifficultySwitch();
  renderBestSingle();
  fireShakeEffect(newLevel);
}

// Apply the escalating shake + chromatic + (on hard/brutal) motion blur.
// Uses a token so a newer effect cancels stale cleanup from an earlier one.
function fireShakeEffect(level) {
  const token = ++effectToken;
  card.removeAttribute('data-effect');
  // Force reflow so the animation re-fires if the same level was just set.
  void card.offsetWidth;
  card.setAttribute('data-effect', level);
  setTimeout(() => {
    if (effectToken === token) card.removeAttribute('data-effect');
  }, SHAKE_DURATIONS[level] + 40);
}

// Update timer-slider: active label + handle position.
function renderTimerSlider() {
  timerTickLabels.forEach((lbl) => {
    const i = parseInt(lbl.dataset.index, 10);
    lbl.classList.toggle('active', i === timerIndex);
  });
  const pct = (timerIndex / (TIMER_STEPS.length - 1)) * 100;
  timerHandle.style.left = pct + '%';
}

// Restart the shake animation on the card (remove + force reflow + add).
function applyShake() {
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

// ── Range-narrowing bar ────────────────────────────

// Reset alive zone to full width; clear past ticks and reset labels.
function resetRangeBar() {
  lowerBound = 1;
  upperBound = rangeMax;
  rangeAlive.style.left = '0%';
  rangeAlive.style.right = '0%';
  rangeTicks.innerHTML = '';
  rangeLabelLower.textContent = '1';
  rangeLabelUpper.textContent = String(rangeMax);
  rangeLabelLower.style.right = '100%';
  rangeLabelUpper.style.left = '100%';
}

// Add a tick for this guess and shrink the alive zone to match current bounds.
function updateRangeBar(guess) {
  const tick = document.createElement('div');
  tick.className = 'range-tick';
  tick.style.left = pctFor(guess) + '%';
  rangeTicks.appendChild(tick);

  const lowerPct = pctFor(lowerBound);
  const upperPct = pctFor(upperBound);
  rangeAlive.style.left = lowerPct + '%';
  rangeAlive.style.right = (100 - upperPct) + '%';
  // Labels anchor inward: lower's right edge to left tick, upper's left edge to right tick.
  rangeLabelLower.style.right = (100 - lowerPct) + '%';
  rangeLabelUpper.style.left = upperPct + '%';
  rangeLabelLower.textContent = String(lowerBound);
  rangeLabelUpper.textContent = String(upperBound);
}

// ── Countdown timer ────────────────────────────────

// Start a fresh countdown at the given number of seconds.
function startTimer(seconds) {
  stopTimer();
  timerActive = true;
  timerStartTime = performance.now();
  timerTotalMs = seconds * 1000;
  timerPausedMs = 0;
  timerPauseStart = 0;
  timerDisplay.hidden = false;
  cornerMark.hidden = true;
  timerDisplay.textContent = formatTime(timerTotalMs);
  timerRafId = requestAnimationFrame(tickTimer);
}

// RAF callback that updates the timer display and fires timeout when done.
function tickTimer() {
  if (!timerActive) return;
  const remaining = getRemainingMs();
  timerDisplay.textContent = formatTime(remaining);
  if (remaining === 0) {
    stopTimer();
    triggerTimeout();
    return;
  }
  timerRafId = requestAnimationFrame(tickTimer);
}

// Freeze the countdown (for shake). Safe to call repeatedly.
function pauseTimer() {
  if (!timerActive || timerPauseStart) return;
  timerPauseStart = performance.now();
}

// Release the freeze and fold the paused interval into the total.
function resumeTimer() {
  if (!timerActive || !timerPauseStart) return;
  timerPausedMs += performance.now() - timerPauseStart;
  timerPauseStart = 0;
}

// Stop the countdown and restore the decorative corner mark.
function stopTimer() {
  timerActive = false;
  timerPauseStart = 0;
  if (timerRafId) cancelAnimationFrame(timerRafId);
  timerRafId = 0;
  timerDisplay.hidden = true;
  cornerMark.hidden = false;
}

// ── Main game functions ────────────────────────────

// Return to the start screen and reset every in-game surface.
// The difficulty switch always has a position; reload it from session.
function goToStartScreen() {
  stopTimer();
  currentDifficulty = loadSwitchDifficulty();
  rangeMax = 0;
  target = 0;
  guesses = [];
  lowerBound = 1;
  upperBound = 0;

  // Card previews the current switch difficulty's palette.
  const c = DIFFICULTY_COLORS[currentDifficulty];
  setCardColors(c.bg, c.tint);
  card.classList.remove('shake');
  card.removeAttribute('data-effect');

  headline.textContent = 'number';
  errorEl.textContent = '';
  historyEl.innerHTML = '';
  winSubtext.textContent = '';
  timeSpare.textContent = '';
  newBest.hidden = true;
  timeSpare.hidden = true;
  intro.hidden = false;
  historyEl.hidden = true;
  winSubtext.hidden = true;
  prompt.hidden = false;
  form.hidden = false;
  playAgainBtn.hidden = true;
  resetBtn.hidden = true;
  input.disabled = false;
  input.value = '';

  // Clear any leftover range bar state so next round starts clean.
  rangeTicks.innerHTML = '';
  rangeAlive.style.left = '0%';
  rangeAlive.style.right = '0%';
  rangeLabelLower.style.right = '100%';
  rangeLabelUpper.style.left = '100%';

  renderDifficultySwitch();
  renderBestSingle();
  gameScreen.hidden = true;
  startScreen.hidden = false;
}

// Start a fresh round at the switch's current difficulty, optionally with a countdown.
function startGame() {
  rangeMax = DIFFICULTIES[currentDifficulty].max;
  target = Math.floor(Math.random() * rangeMax) + 1;
  guesses = [];

  // Fade the card from its difficulty-colored start-screen state back to neutral dark.
  setCardColors('#1a1a1a', '#888888');
  card.classList.remove('shake');
  card.removeAttribute('data-effect');

  headline.textContent = 'number';
  errorEl.textContent = '';
  historyEl.innerHTML = '';
  winSubtext.textContent = '';
  timeSpare.textContent = '';
  newBest.hidden = true;
  timeSpare.hidden = true;
  introRange.textContent = "i'm thinking of a number between 1 and " + rangeMax + '.';
  intro.hidden = false;
  historyEl.hidden = true;
  winSubtext.hidden = true;
  prompt.hidden = false;
  form.hidden = false;
  playAgainBtn.hidden = true;
  resetBtn.hidden = true;
  input.disabled = false;
  input.value = '';
  input.placeholder = '1–' + rangeMax;

  resetRangeBar();

  startScreen.hidden = true;
  gameScreen.hidden = false;
  input.focus();

  const seconds = TIMER_STEPS[timerIndex];
  if (seconds > 0) startTimer(seconds);
}

// Redraw the last 5 guesses, newest first.
function renderHistory() {
  historyEl.innerHTML = '';
  const recent = guesses.slice(-5).reverse();
  for (const { n, word } of recent) {
    const li = document.createElement('li');
    li.textContent = n + ' — ' + word;
    historyEl.appendChild(li);
  }
  historyEl.hidden = guesses.length === 0;
}

// Swap the card into its victory state; record best and show time-to-spare if timed.
function win() {
  const count = guesses.length;

  // Capture any remaining time BEFORE stopping the timer.
  let spareSec = null;
  if (timerActive) {
    const remaining = getRemainingMs();
    spareSec = Math.floor(remaining / 1000);
  }
  stopTimer();

  const tk = currentTimerKey();
  const prevBest = bestScores[currentDifficulty][tk];
  if (prevBest === null || count < prevBest) {
    bestScores[currentDifficulty][tk] = count;
    saveBestScores();
    newBest.hidden = false;
  } else {
    newBest.hidden = true;
  }

  headline.textContent = 'got it';
  winSubtext.textContent = 'the number was ' + target + '. solved in ' + count + (count === 1 ? ' try.' : ' tries.');
  winSubtext.hidden = false;

  if (spareSec !== null) {
    timeSpare.textContent = spareSec + (spareSec === 1 ? ' second to spare.' : ' seconds to spare.');
    timeSpare.hidden = false;
  } else {
    timeSpare.hidden = true;
  }

  setCardColors('#1a3d2a', '#a6c7ad');

  intro.hidden = true;
  historyEl.hidden = true;
  prompt.hidden = true;
  form.hidden = true;
  resetBtn.hidden = true;
  playAgainBtn.hidden = false;
  input.disabled = true;
  playAgainBtn.focus();
}

// Swap the card into its timeout state; reveals the answer, no shake, no best-score update.
function triggerTimeout() {
  const lastGuess = guesses.length ? guesses[guesses.length - 1].n : null;

  card.classList.remove('shake');
  setCardColors('#1f2530', '#7a8294');

  headline.textContent = "time's up";
  winSubtext.textContent = lastGuess === null
    ? 'the number was ' + target + ". you didn't guess."
    : 'the number was ' + target + '. you got to ' + lastGuess + '.';
  winSubtext.hidden = false;
  timeSpare.hidden = true;
  newBest.hidden = true;

  intro.hidden = true;
  historyEl.hidden = true;
  prompt.hidden = true;
  form.hidden = true;
  resetBtn.hidden = true;
  playAgainBtn.hidden = false;
  input.disabled = true;
  playAgainBtn.focus();
}

// Handle a submitted guess: validate, compare, shake/color on miss, or win.
function handleGuess(e) {
  e.preventDefault();
  const r = parse(input.value);
  if (r.error) {
    errorEl.textContent = '1 to ' + rangeMax + '. those are the rules.';
    input.select();
    return;
  }
  errorEl.textContent = '';

  const n = r.n;
  let word;
  if (n < target)      word = 'higher';
  else if (n > target) word = 'lower';
  else                 word = 'got it';

  guesses.push({ n, word });
  intro.hidden = true;
  renderHistory();
  resetBtn.hidden = false;

  // Update the "still alive" bounds based on the guess direction.
  if (word === 'higher') lowerBound = Math.max(lowerBound, n);
  if (word === 'lower')  upperBound = Math.min(upperBound, n);
  updateRangeBar(n);

  if (word === 'got it') {
    win();
  } else {
    headline.textContent = word;
    input.value = '';
    input.focus();

    // Hot/cold color shift on card + muted text
    const distance = Math.abs(n - target);
    const coldness = distance / rangeMax;
    setCardColors(getCardColor(coldness), getAccentTint(coldness));

    // Violent shake + freeze the countdown for its duration
    applyShake();
    pauseTimer();
  }
}

// ── Reset scores flow ──────────────────────────────

// Show the inline "erase all best scores?" confirm in the footer.
function showResetConfirm() {
  utilityLinks.hidden = true;
  resetConfirm.hidden = false;
}

// Hide the confirm and put the normal utility links back.
function hideResetConfirm() {
  utilityLinks.hidden = false;
  resetConfirm.hidden = true;
}

// Wipe every stored best (all 24 slots) and refresh the start-screen if visible.
function doResetScores() {
  bestScores = makeEmptyScores();
  localStorage.removeItem(STORAGE_KEY);
  hideResetConfirm();
  if (!startScreen.hidden) renderBestSingle();
}

// ── Timer slider ───────────────────────────────────

// Change the selected timer position and refresh the slider + best-score line.
function setTimerIndex(i) {
  timerIndex = Math.max(0, Math.min(TIMER_STEPS.length - 1, i));
  renderTimerSlider();
  renderBestSingle();
}

// Begin a handle drag; move the handle freely until pointer-up.
function onHandlePointerDown(e) {
  e.preventDefault();
  sliderDragging = true;
  timerHandle.classList.add('dragging');
  if (timerHandle.setPointerCapture) {
    try { timerHandle.setPointerCapture(e.pointerId); } catch (_) {}
  }
  timerHandle.addEventListener('pointermove', onHandlePointerMove);
  timerHandle.addEventListener('pointerup', onHandlePointerUp);
  timerHandle.addEventListener('pointercancel', onHandlePointerUp);
}

// Move handle to the cursor's horizontal position along the track.
function onHandlePointerMove(e) {
  if (!sliderDragging) return;
  const rect = timerTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  timerHandle.style.left = pct * 100 + '%';
}

// End a drag; snap the handle to the nearest tick.
function onHandlePointerUp(e) {
  if (!sliderDragging) return;
  sliderDragging = false;
  timerHandle.classList.remove('dragging');
  timerHandle.removeEventListener('pointermove', onHandlePointerMove);
  timerHandle.removeEventListener('pointerup', onHandlePointerUp);
  timerHandle.removeEventListener('pointercancel', onHandlePointerUp);
  const rect = timerTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const index = Math.round(pct * (TIMER_STEPS.length - 1));
  setTimerIndex(index);
}

// Arrow keys nudge the handle one tick at a time when focused.
function onHandleKeyDown(e) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    setTimerIndex(timerIndex - 1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    setTimerIndex(timerIndex + 1);
  }
}

// Clicking a tick label or tick mark snaps the slider to that position.
function onSliderClick(e) {
  const lbl = e.target.closest('.timer-tick-label');
  if (lbl) { setTimerIndex(parseInt(lbl.dataset.index, 10)); return; }
  const tick = e.target.closest('.timer-tick');
  if (tick) { setTimerIndex(parseInt(tick.dataset.index, 10)); return; }
}

// ── Difficulty switch: click to cycle, arrows to nudge ─────

// Any click on the switch advances one level forward (wraps from brutal → easy).
function onSwitchClick() {
  cycleDifficulty(1);
}

// Arrow keys cycle the switch when the handle is focused; both ends wrap.
function onSwitchKeyDown(e) {
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    cycleDifficulty(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    cycleDifficulty(-1);
  }
}

// ── Event listeners (start the game) ───────────────
difficultyHandle.addEventListener('keydown', onSwitchKeyDown);
difficultySwitch.addEventListener('click', onSwitchClick);
goBtn.addEventListener('click', () => startGame());
form.addEventListener('submit', handleGuess);
resetBtn.addEventListener('click', goToStartScreen);
playAgainBtn.addEventListener('click', goToStartScreen);
wordmarkBtn.addEventListener('click', goToStartScreen);

// Animation end: clear the shake class and resume the countdown.
card.addEventListener('animationend', (e) => {
  if (e.animationName === 'shake') {
    card.classList.remove('shake');
    resumeTimer();
  }
});

resetScoresBtn.addEventListener('click', showResetConfirm);
confirmYes.addEventListener('click', doResetScores);
confirmNo.addEventListener('click', hideResetConfirm);

timerHandle.addEventListener('pointerdown', onHandlePointerDown);
timerHandle.addEventListener('keydown', onHandleKeyDown);
timerSlider.addEventListener('click', onSliderClick);

// Escape aborts an active round (not during win/timeout, where the form is hidden).
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !gameScreen.hidden && !form.hidden) {
    goToStartScreen();
  }
});

renderTimerSlider();
goToStartScreen();
