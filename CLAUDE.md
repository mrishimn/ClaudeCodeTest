# ClaudeCodeTest — Number Guessing Game

## What this is

A single-page web game where the player guesses a randomly chosen number. Visual style modeled directly on dialed.gg — a minimal dark "hero card" floating on a white page, with a thin top nav and utility footer. Built as a learning project; the user is a beginner who values clean, organized, well-commented code.

Repo: https://github.com/mrishimn/ClaudeCodeTest

No build tooling, no `package.json`, no framework, no dependencies beyond Google Fonts (Inter). Do not introduce any.

## Design rules — DO NOT BREAK

- **dialed.gg aesthetic.** White page (`#fafafa`), dark rounded card centered, thin top nav, utility footer. Card has `box-shadow` and a conic-gradient ring on the "go" button — these are deliberate.
- **All text lowercase.** Including headings, buttons, labels, placeholders.
- **Dry, deadpan copy voice.** No emoji. No exclamation points. Examples: `"pick your poison"`, `"how much pain do you want?"`, `"your guess?"`, `"got it"`, `"time's up"`, `"1 to 1000. those are the rules."`, `"you have unlimited tries but your dignity is finite."`
- **One sans-serif font** — Inter (loaded from Google Fonts), system-ui fallback.
- **Hard, structural elements**: dark card with rounded corners, white pill controls, gradient ring on the "go" button.
- **Hot/cold color shifts** during gameplay use a defined palette of dark tints (red → orange → neutral → blue), never bright/saturated. Thresholds live in `getCardColor()` and `getAccentTint()` in `script.js` — edit them there, not in CSS.
- **All shake animations are TRANSLATION ONLY, no rotation.** Don't add rotation back.
- **`.prompt` and `.error` deliberately stay on `--prompt-on-dark` / `--error-on-dark` rgba-white** so interactive text stays crisp across all card colors. Do not fold them into `--accent-tint`.

## File structure

```
ClaudeCodeTest/
├── index.html             — page structure, links to styles.css and script.js
├── styles.css             — all visual styling (single file)
├── script.js              — game logic + DOM event listeners (single file, ~700 lines)
├── CLAUDE.md              — this file
├── .gitignore             — excludes .DS_Store, IDE folders, original-backup.html, etc.
├── .claude/               — Claude Code per-project settings (committed)
└── original-backup.html   — pre-refactor single-file version (gitignored, kept locally for diffing)
```

No `helpers.js` — script.js stayed below the threshold where splitting helped readability.

`script.js` is organized top-to-bottom for beginner readability: constants → state → DOM refs → helpers → main game functions → switch/timer handlers → event listeners → init.

## Features built and how they work

### Start screen

- **Headline** `"pick your poison"`, **subtext** `"how much pain do you want?"`.
- **Timer slider** — six positions (`off`, `15`, `30`, `45`, `60`, `90`). Click ticks/labels or drag the white handle. Active label opacity 1.0, inactive 0.3 (200 ms transition). Value persists across rounds in the session via `sessionStorage` (key `numgsrSwitchDifficulty` for the difficulty, separate from this — slider state is not persisted across full reloads).
- **Difficulty switch** — compact pill (135 × 36 px, 20 px radius, 1.5 px white border) with four positions: `easy` (1–100), `medium` (1–500), `hard` (1–1000), `brutal` (1–2000). All four small dots (5 px, 50% white) always visible; large white circle (17 px) slides over the current position with a 150 ms ease. **Click anywhere on the switch cycles forward** (brutal wraps to easy). Keyboard `ArrowRight` cycles forward, `ArrowLeft` cycles backward, both wrap. The handle button is `pointer-events: none` so clicks fall through to the switch container — handler is on the outer pill.
- **Difficulty label** below the switch — `"easy"` / `"medium"` / `"hard"` / `"brutal"`, color tracks `--accent-tint`.
- **`best: N` line** under the label, crossfades on slider or switch change (150 ms out, 150 ms in via a `.fading` class).
- **`go` button** — circular, white fill, dark text. Conic-gradient rainbow ring around it (always visible, rotates on hover via animated `--angle` registered with `@property`). Centered at the bottom of the card. Always enabled. The whole button has `position: relative` with a `::before` mask-ringed pseudo-element for the rainbow.
- **Card background fades to the difficulty palette** when the switch level changes:
  - `easy` → bg `#1e3a5f`, tint `#8ba3c4`
  - `medium` → bg `#2e3a48`, tint `#9ba3b0`
  - `hard` → bg `#5a3828`, tint `#b89888`
  - `brutal` → bg `#8a3020`, tint `#d49888`
  - 600 ms ease via two CSS variables (`--card-bg`, `--accent-tint`) on the `.card`.

### Difficulty change effects (start-screen "switch flick" feedback)

Three effects fire simultaneously every time the switch level changes, driven by a single `data-effect="{level}"` attribute on the card:

- **Translation-only shake**, intensity scales with destination level:
  - easy: ±2 px / 200 ms
  - medium: ±5 px / 300 ms
  - hard: ±9 px / 400 ms
  - brutal: ±14 px / 500 ms
- **Red+cyan chromatic aberration text-shadow** on every text child of the card (`h1, h2, p, span, label, button, input, li`), scales similarly (±1 px through ±4 px, opacity 0.85, fades out at the end via `chromatic-fade` keyframe).
- **Motion blur** (1 px on hard, 2 px on brutal, peaks at 40% of animation, no blur on easy/medium).

Cleanup: `fireShakeEffect()` uses a monotonic `effectToken` — a newer effect cancels stale `setTimeout` cleanup so rapid clicks don't leave the attribute stuck on.

### Game screen

- **Headline** is the directional cue: `"number"` initially, then `"higher"` / `"lower"`, ends as `"got it"` (or `"time's up"`).
- **Intro paragraph** `"i'm thinking of a number between 1 and {rangeMax}."` + `"you have unlimited tries but your dignity is finite."` — hidden after the first guess.
- **Input** — white pill, autofocus, `inputmode="numeric"`, Enter submits via the form. Validation: `parse()` requires `^\d+$`, then range-check 1–rangeMax. Failure shows inline error: `"1 to {rangeMax}. those are the rules."` (no `alert`, no `confirm`).
- **Guess history list**, newest on top, last 5 guesses, format `"N — higher/lower"`.
- **Range-narrowing bar** — thin horizontal bar (5 px tall, 85% card width). Alive zone (`rgba(255,255,255,0.8)`-ish using `var(--accent-tint)`) shrinks as bounds tighten with a 400 ms ease. White ticks left at every past guess position. **lowerBound label above the bar, right-edge anchored to the left tick** (number extends leftward, away from alive zone). **upperBound label below the bar, left-edge anchored to the right tick** (extends rightward). Bounds are set to the guess value itself (`lowerBound = max(lowerBound, guess)`, `upperBound = min(upperBound, guess)`) — no `+1` / `-1` — so the labels read the exact number the player typed.
- **Hot/cold card color shift** on every guess: `coldness = abs(guess - target) / rangeMax`. Both `--card-bg` and `--accent-tint` update via a single `setCardColors(bg, tint)` call. The `.card` transitions `background-color` over 600 ms; muted text descendants transition `color` over 600 ms. Same mechanism the difficulty palette uses.
- **Wrong-guess shake** — translation-only ~±8 px / 400 ms via `applyShake()` (remove class, force reflow with `void card.offsetWidth`, re-add — required to re-trigger a CSS animation that may still be running). Subtle red+cyan chromatic aberration accompanies it (±1.5 px, opacity 0.4) via `.card.shake :is(...)`. Correct guesses do not shake — silence is the reward.
- **Correct guess (win state)** — card fades to deep green `#1a3d2a` with `--accent-tint` `#a6c7ad`. Headline becomes `"got it"`. Win subtext: `"the number was N. solved in M tries."` (singular `"try."` if 1). If a record was beaten, a muted `"new best"` line appears above the subtext. Play-again button (rainbow icon) replaces the form.

### Timer mode

- **Countdown display** in the top-right corner of the card while playing if the slider is on. Format `"m:ss"` (no leading zero on minutes). Replaces the decorative corner-mark SVG; the SVG comes back when the timer is off.
- **Pauses during shake.** When `applyShake()` fires, `pauseTimer()` is called too. The `card.addEventListener('animationend', ...)` listener fires `resumeTimer()` when the shake finishes. Pause math uses `performance.now()` plus a `timerPausedMs` accumulator; safe across multiple rapid wrong guesses.
- **Timeout state** — card fades to defeat color `#1f2530` with tint `#7a8294`. Headline becomes `"time's up"`. Reveals the answer: `"the number was N. you got to {lastGuess}."` or `"the number was N. you didn't guess."` if no guesses. Range bar stays visible so the player can see how close they got.
- **Win with time remaining** shows a muted second line: `"K seconds to spare."` (singular `"second"` if 1). Computed via `Math.floor(remainingMs / 1000)` *before* `stopTimer()` is called.

### Best-score tracking

- **localStorage key** `guessGameBestScores`.
- **Nested shape**: `{ easy: { untimed, "15", "30", "45", "60", "90" }, medium: {...}, hard: {...}, brutal: {...} }` — 24 total slots (4 difficulties × 6 timer settings).
- **Migration**: `loadBestScores()` detects the old flat shape (values are `null | number` instead of objects), converts each value into the corresponding `untimed` slot, persists the new shape, and deletes the old. Silent — no user notification.
- **Reset scores link** in the footer with an inline `"erase all best scores? yes / no"` confirm (no `window.confirm`). Wipes all 24 slots.
- **Display** — single `"best: N"` line under the difficulty switch on the start screen, reflects current `(switch-level, slider-position)` combo.

### Back navigation (from game screen)

Two ways to return to start screen mid-round (the in-card "back" text link was removed at user request — only these two remain):

1. **Click the wordmark** in the top nav (`<button class="wordmark" id="wordmarkBtn">`). Always clickable.
2. **Press Escape**. Active only during play — the keydown listener checks `!gameScreen.hidden && !form.hidden` so Escape no-ops on the start screen and on win/timeout screens (the form is hidden on those screens).

Both call `goToStartScreen()`, which stops the timer, resets `currentDifficulty` from session, resets all in-card state (history, target, range bar, card color), and shows the start screen with the difficulty palette restored.

## Decisions discussed but NOT built

- ~~Visual range-narrowing bar~~ — built.
- ~~Range labels split above/below bar with edge anchoring~~ — built.
- ~~Switch-style difficulty selector~~ — built.
- ~~Chromatic aberration on level change~~ — built.
- Daily challenge mode — discussed, not built.
- Multiplayer / shareable game links — discussed, not built.
- Sound effects — discussed, not built.
- Achievement system — discussed, not built.
- Hint system — discussed, not built.
- Reverse mode (computer guesses your number) — discussed, not built.
- Streak mode — discussed, not built.
- Light / dark theme variants — discussed, not built.

## Working style notes for future Claude sessions

- **User is a beginner.** Add short plain-English comments above functions. Don't write long docstrings — one or two lines max.
- **Plan-then-prompt pattern.** User typically asks Claude to plan first in conversation, then writes detailed prompts to feed into Claude Code. The plan-then-prompt loop is intentional. Honor structured prompts literally; ask before improvising.
- **dialed.gg minimalism over generic SaaS styling.** Push back if a request would compromise the aesthetic.
- **All shake animations are translation only.** No rotation. Don't add it.
- **"Don't improve unrelated things" rule.** When refactoring or modifying, user almost always wants behavior preserved exactly. Preserve names, comments, structure unless explicitly asked.
- **`applyShake()` reflow trick** (`card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');`) is required — without it CSS animations don't re-trigger when the class is added back. Don't "simplify" it away.
- **Hot/cold color thresholds** live in `getCardColor()` and `getAccentTint()` in `script.js`, not in CSS. Edit them there.
- **`original-backup.html`** is the pre-refactor single-file version. Gitignored. Kept locally so visual regressions can be diffed against the original. Safe to delete only after the current version has lived long enough to trust.

## User notes

(Nothing carried over from the prior CLAUDE.md — all content there was previously authored by Claude and is captured under the relevant new sections above.)
