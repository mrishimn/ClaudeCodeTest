# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

A sandbox folder (not its own git repo — the outer repo lives at `~/Documents/mrishicode/.git`) holding two small web experiments. No build tooling, no `package.json`, no framework, no dependencies beyond Google Fonts. Do not introduce any.

The two experiments:
- **Root-level Numgsr** — a dialed.gg-styled number-guessing game with difficulty picker, best-score tracking, and hot/cold visual feedback. Lives at `index.html` + `styles.css` + `script.js`, with `original-backup.html` kept as a diffable reference to the single-file version this was refactored from.
- **`NumGSR/` subproject** — an older, minimalist variant of a similar game, with its own nested `.git/`. Not active development.

## The two apps have different aesthetics — do not cross them

- **Root-level Numgsr**: dialed.gg style. White page, thin top nav, dark rounded card (neutral `#1a1a1a`, shifts hot/cold on guess), `box-shadow`, conic-gradient rainbow border on the action button, white pill input, utility footer. Cards, shadows, and gradients are deliberate here.
- **`NumGSR/` subproject**: flat minimalist. No cards, no shadows, no gradients. `#16a34a` green accent only on win. Preserve this restraint when editing — no "modern SaaS" styling.

Shared by both: `#fafafa` page background, Inter font, lowercase copy, no emoji or exclamation points.

## Nested git repo gotcha

`NumGSR/` has its own `.git/` — a nested repo, not a submodule. `git status` / `git log` from outside won't see changes inside it; `cd NumGSR/` first. The outer repo at `~/Documents/mrishicode/.git` tracks `NumGSR/` as an opaque embedded directory. This `ClaudeCodeTest/` folder has no `.git/` of its own.

## Main app architecture (root-level Numgsr)

Three files coupled by DOM `id`. `script.js` is a classic script tag loaded with `defer`, organized top-to-bottom for beginner readability: constants → state → DOM refs → helpers → main functions → event listeners.

### Screens

The dark card holds two mutually exclusive screens toggled via the `hidden` attribute:
- `#startScreen` — difficulty picker. Shown on load and after every win.
- `#gameScreen` — input, feedback, history.

`showStartScreen()` and `startGame(difficulty)` do the swap; both also reset all in-card state.

### Difficulty

`DIFFICULTIES` at the top of `script.js` defines four levels: easy 1–100, medium 1–500, hard 1–1000, brutal 1–2000. `rangeMax` holds the active round's ceiling; `parse()`, the error copy (`"1 to {rangeMax}. those are the rules."`), the intro text, and the input placeholder all read it. On difficulty pick, `target` is rolled in `[1, rangeMax]`.

### Best-score tracking

Persisted in `localStorage` under key `guessGameBestScores` as `{easy, medium, hard, brutal}` (each `null` or a guess count). `win()` compares `guesses.length` to the stored value; if `null` OR beaten, updates the record and reveals `#newBest`. The footer `reset scores` link swaps in an inline yes/no confirm — no `window.confirm`.

### Hot/cold feedback

On each wrong guess: `coldness = Math.abs(guess - target) / rangeMax` (0 = burning close, 1 = far). Two CSS variables on `.card` are set via `card.style.setProperty`:
- `--card-bg` drives `background-color` with a 600 ms transition.
- `--accent-tint` drives the color of body-style muted text (`.body`, `.history li`, `.win-subtext`, `.new-best`, `.best-label`) with the same 600 ms transition.

Thresholds live in `getCardColor()` (7 steps) and `getAccentTint()` (6 steps) in `script.js`. Edit them there, not in CSS. On win the card swaps to warm gold (`#2a2416` / `#b8a688`); on new round or difficulty pick it resets to neutral (`#1a1a1a` / `#888888`).

`.prompt` and `.error` intentionally stay on `--prompt-on-dark` / `--error-on-dark` rgba-white so interactive text stays crisp across all card colors — do not fold them into `--accent-tint`.

### Shake

`.card.shake` fires a 400 ms translate-and-rotate keyframe on wrong guesses only. `applyShake()` removes the class, forces a reflow (`void card.offsetWidth`), and re-adds — required to re-trigger a CSS animation that might still be running. An `animationend` listener on the card also removes the class for cleanup. Correct guesses never shake; silence is the reward.

### Reset model

Both the mid-game reset icon (`#resetBtn`) and the post-win play-again button (`#playAgainBtn`) call `showStartScreen()`. "Abort = pick again" is the single mental model — there is no "restart same difficulty" shortcut by design.

### `original-backup.html`

The single-file predecessor of the main app. Not loaded by anything; kept so you can diff visuals if a refactor regresses something. Safe to delete once the current multi-file version has lived long enough to trust.

## `NumGSR/` subproject architecture

Three files coupled by `id`:

- `index.html` — thin stage. Every interactive element has an `id` that `game.js` looks up via `getElementById`. Renaming or removing an `id` without a matching JS edit breaks the game silently.
- `scripts/game.js` — all state (`target`, `attempts`, `gameOver`) and all DOM updates. Module script. Random int 1–1000 rolled in `newGame()` on load and reset.
- `styles/main.css` — purely presentational.

**Heat thresholds** in `getHeat(diff)`: `0 → locked`, `1–3 → hot`, `4–15 → warm`, `16–50 → tracking`, `51–150 → searching`, `151+ → far`. The returned string is both a CSS hook and the text shown in `#heatLabel`.

**Two subtle invariants in `submitGuess`:**

1. `card.className = 'card ' + heat` REPLACES all classes on `#gameCard`. Any static class beyond `card` will be wiped on every guess. Layout classes belong on a parent, not on `#gameCard`.
2. `.shake` is added AFTER the `className` reassignment. Reordering silently disables the animation (the `classList.add('shake')` gets wiped by the `className = ...` replacement).

**Dead code preserved intentionally:** `card.style.borderColor` is still written on every guess, and `getBorderColor(diff)` exists to compute it. `.card` has no border in the current CSS, so both are no-ops. Left in place during the minimalist redesign to avoid touching `game.js`. Delete only if you're already modifying `game.js` for unrelated reasons.

## Running

No build step. Open the HTML directly in a browser, or serve locally:

    npx serve .          # serves this folder (main app at /index.html)
    npx serve NumGSR/    # serves the NumGSR subproject

Do not suggest `npm run dev`, `npm run build`, or `npm run lint` — there is no `package.json`.

## Copy voice

All user-facing text is lowercase, dry, deadpan, short. No exclamation points, no emoji, no "nice!" / "great job!" / "awesome!". Error states are self-deprecating (`"1 to 1000. those are the rules."`), not alarming. When adding copy, match the existing strings — the error line, the intro (`"you have unlimited tries but your dignity is finite."`), and `HEAT_COPY` in NumGSR's `game.js`.
