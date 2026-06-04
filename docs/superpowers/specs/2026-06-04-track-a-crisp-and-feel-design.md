# Track A — Crisp & Feel — Design Spec

- **Date:** 2026-06-04
- **Status:** Design approved (approach A on both forks + full juice package); awaiting spec sign-off.
- **Author:** Ghifi + Claude (brainstorming session)
- **Feature branch:** `feat/track-a-crisp-feel`

## 1. Summary

Make Plumber Quest look **razor-sharp** on every screen and feel **noticeably juicier**, without changing the art, the gameplay, or the deterministic simulation. This is the first of four planned tracks (A crisp+feel, B detail+themes, C mechanics, D content); only A is in scope here.

Two pillars:
1. **Crisp rendering** — DPR-aware *integer* scaling of the existing 256×240 backbuffer, so pixels are perfectly even (no blur, no motion shimmer) while staying mobile-safe.
2. **Game feel** — an event-driven cosmetic effects layer (particles, impact flash), hero squash & stretch, camera look-ahead + easing, hit-stop, level-transition wipes, and an optional CRT/scanline toggle.

### Goals
- Pixel-perfect crispness on phones, tablets, and desktop; zero shimmer in motion.
- Tangibly better "feel" on the core verbs: jump, land, run, stomp, break, collect.
- **No art changes**, **no gameplay changes**, **no determinism risk**: the determinism golden master stays green; `world.js` **gameplay logic is unchanged** — its only edit is additive `x,y` fields on existing event payloads (§9), which the fingerprint does not hash.
- Mobile-safe: no repeat of the earlier large-backbuffer freeze.

### Non-goals (out of scope — later tracks)
- New/higher-resolution art, new tiles, parallax depth, world themes (Track B).
- New mechanics, enemies, power-ups (Track C).
- New levels / progression (Track D).
- DPR-native (1:1 device-pixel) backbuffer rendering — rejected as freeze-risky.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Crispness | **DPR-aware integer scaling** of the 256×240 backbuffer (letterbox) |
| Backbuffer size | **Stays 256×240** (small → no large-buffer freeze) |
| Juice architecture | **Event-driven cosmetic layer**, `world.js` untouched |
| Particle randomness | `Math.random` allowed (effects are NOT in the sim); rng injectable for tests |
| CRT/scanlines | Optional, **off by default**, persisted toggle |

## 3. The mobile-freeze constraint (why this approach)

Earlier we shipped a 1280×1200 (5× SCALE) pixelated backbuffer upscaled by CSS; it stopped recompositing on some mobile GPUs (appeared frozen). The fix was the native 256×240 backbuffer we have now. **This spec keeps the backbuffer at 256×240** and only changes the *CSS display size* to an integer-device-pixel multiple. No large buffer is ever allocated, so the freeze cannot recur.

## 4. Crisp rendering — DPR-aware integer scaling

### 4.1 Problem
Today `resize()` sets the canvas CSS size to a **fractional** fill (e.g. 256→390 CSS px = 1.52×). After the device-pixel-ratio multiply, the final device scale is non-integer (e.g. ×4.57), so `image-rendering: pixelated` produces **uneven pixels** (some 4 device-px, some 5) and shimmer during scrolling.

### 4.2 Solution
Pick the **largest integer scale measured in device pixels**, then set the CSS size to that divided by DPR. The backbuffer stays 256×240.

```js
const LOGICAL_W = 256, LOGICAL_H = 240;
function resize() {
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));   // cap dpr (perf)
  const vw = window.innerWidth || LOGICAL_W, vh = window.innerHeight || LOGICAL_H;
  const band = isTouch ? Math.min(170, Math.round(vh * 0.26)) : 0;       // control band (unchanged)
  document.body.style.paddingBottom = band + 'px';
  const availH = Math.max(1, vh - band);
  // largest integer scale that fits, measured in *device* pixels:
  const sDev = Math.max(1, Math.floor(Math.min((vw * dpr) / LOGICAL_W, (availH * dpr) / LOGICAL_H)));
  // CSS size = integer-device size / dpr  → composites to an exact integer device scale → crisp
  canvas.style.width  = (LOGICAL_W * sDev / dpr) + 'px';
  canvas.style.height = (LOGICAL_H * sDev / dpr) + 'px';
}
```

- On a 390-CSS-px × dpr-3 phone: `sDev = floor(1170/256) = 4` → CSS width `256*4/3 = 341px` (≈87% of width, thin side bars), composites to exactly **×4 device pixels** → razor-sharp, no shimmer.
- The backbuffer (`canvas.width/height`) is **never changed** from 256×240.
- `image-rendering: pixelated` in CSS stays; `ctx.imageSmoothingEnabled = false` stays.

### 4.3 Acceptance
- Final device scale is an exact integer on phones/desktop (verified by the resize math test).
- Backbuffer remains 256×240 (asserted by test reading `canvas.width`).
- Manual: scroll a level on a real phone → no shimmer; no freeze.

## 5. Effects layer (particles) — `src/fx/effects.js` + `src/fx/fx-overlay.js`

Event-driven, sim-independent. `world.js` is **not** modified except for additive event coordinates (§9).

### 5.1 `effects.js`
```
createEffects({ rng = Math.random, max = 120 })
  handle(ev)        // turn a drained game event into particles
  spawn(kind,x,y,opts)
  tick(dt)          // integrate + age; cap at `max` (drop oldest)
  list()            // read-only snapshot for the overlay
  clear()           // on level change / state reset
```
Particle: `{ x, y, vx, vy, life, ttl, kind, color, size, gravity }`. Integrated each `tick(dt)` (gravity, drift, fade by `life/ttl`). Bounded pool (`max`, drop oldest).

### 5.2 Event → effect mapping
| Game event | Effect |
|---|---|
| `coin-collected` | small gold **sparkle** burst (4–6) rising + fading |
| `enemy-stomped` | white/yellow **stars** + dust puff at the stomp point |
| `brick-broken` | 4 brown **debris chunks** arcing out with gravity |
| `powerup-collected` | brief ring/sparkle in the power-up color |
| `jump` | tiny **dust** kick at the feet |
| `player-hit` | red **flash** + a few shards |
| `one-up` / `flag-reached` | (already have popups/fireworks — leave as-is) |

Impact **flash**: a short full-screen white overlay (alpha ramp) on `enemy-stomped` / `brick-broken` / `player-hit`, drawn by the overlay (not a particle).

### 5.3 `fx-overlay.js`
`createFxOverlay(ctx)` → `draw(list, cam, flash)` converts world→screen via `cam`, draws particles (small filled rects, retro style) and the flash. Read-only; never touches `world`. Drawn in `main.js` **after** `renderer.draw` and **before** the social overlay.

## 6. Hero squash & stretch + skid (renderer, read-only)

Implemented entirely in `renderer.js` from **read-only** player state; `world` is not mutated. The renderer already keeps display-only state (`animClock`, `blink`); it gains a tiny `heroAnim` record (prevOnGround, prevVy, landT, skidT).

- **Stretch** while rising fast (`vy < -threshold`): scale Y up ~1.12, X down ~0.92 (volume-ish), eased by `|vy|`.
- **Squash** on landing: detect `onGround` false→true transition (renderer-local `prevOnGround`), start `landT`; squash Y ~0.82 / X ~1.16 decaying over ~0.12s.
- **Skid frame**: when `onGround` and input direction opposes `vx` (derivable from `facing` vs `vx` sign), show a brief skid pose (reuse walk frame, flipped, with a dust kick via the effects layer on skid start).
- Centered/bottom-aligned as today so the hitbox is unchanged.

This stays within the renderer-readonly contract (the existing test asserts `world` is unmutated — renderer-internal state is fine).

## 7. Camera look-ahead + vertical ease — `src/engine/camera.js`

Extend `cam.follow(player)`:
- **Look-ahead:** shift the target x by `facing * LOOKAHEAD` (≈ 28 px), and **ease** the camera x toward the target (lerp factor per frame) instead of snapping.
- **Vertical ease:** lerp camera y toward the player's y band (so jumps/falls aren't jarring), clamped.
- **Clamp** to `cam.bounds` exactly as today (the live-bounds behavior is preserved).
- Deterministic given inputs; no `world` mutation. Easing uses a fixed per-frame factor (frame-rate is fixed 1/60 in the loop).

## 8. Hit-stop — `src/engine/hitstop.js`

A tiny real-time controller used by the loop; **not** part of the sim.
```
createHitstop()
  trigger(frames)   // request a freeze
  step()            // returns true if this frame should SKIP gs.update; decrements
  active()
```
In `main.js`'s `step()`: `if (hitstop.step()) return;` before `gs.update(...)` — the loop keeps rendering the last frame for `frames` ticks. Triggered from the afterFrame event drain: `enemy-stomped` → ~4 frames, `brick-broken` → ~3, `player-hit` → ~6.

**Determinism:** the golden master calls `gs.update` directly (not via the loop), so hit-stop cannot affect it. Hit-stop only pauses wall-clock advancement briefly.

## 9. Event position fields (additive, sim-safe)

Effects need spawn coordinates. The events the sim already emits gain `x,y` (world coords) where missing: `coin-collected`, `enemy-stomped`, `brick-broken`, `powerup-collected`, `jump`, `player-hit`. This is **additive to the event payload only** — no gameplay logic changes, and the determinism fingerprint hashes player/entity/score state (not event payloads), so the golden master is unaffected. Confirmed by re-running the golden test.

## 10. Transitions + CRT/scanline

### 10.1 Level transition wipe
Extend the existing per-level black fade-in into a quick **wipe**: on entering `playing`, a 0.3s horizontal reveal (driven by `world.animClock`, already used for the fade); on `level-clear`, a short wipe-out. Drawn in `renderer.draw` (it already owns the fade). Modest, retro.

### 10.2 CRT / scanline toggle (optional, off by default)
A final **post-pass** over the 256×240 canvas: faint horizontal scanlines (every other row) + a soft vignette. Toggled by a DOM button (like `#mute`), persisted in `localStorage` (`pq.crt`), **default off**. Implemented in `src/render/crt.js`, applied in `main.js` after all other drawing (so it covers the whole frame). Cheap (drawn at 256×240 before scaling).

## 11. Architecture / files

```
src/fx/
  effects.js        # NEW: event-driven particle system (sim-independent, rng-injectable)
  fx-overlay.js     # NEW: draws particles + impact flash over the world (read-only)
src/engine/
  hitstop.js        # NEW: real-time hit-stop controller (loop-level)
  camera.js         # MODIFY: look-ahead + vertical ease (clamp preserved)
src/render/
  renderer.js       # MODIFY: hero squash/stretch/skid; transition wipe
  crt.js            # NEW: optional CRT/scanline post-pass
src/main.js         # MODIFY: DPR-aware integer resize; wire effects+hitstop+fx-overlay+crt toggle
index.html/style.css# MODIFY: add #crt toggle button (like #mute)
```

**Invariants preserved:** `world.js` only gains `x,y` on existing event payloads (no logic change). The deterministic sim, the renderer-readonly contract, and the social overlay are all unaffected.

## 12. Testing

In-browser harness (`tests/`), plus the existing suite stays green:
- **resize math** (`tests/display.test.js`): given (vw, vh, dpr, band), the chosen scale is the largest integer fitting in device px; CSS size = `logical*scale/dpr`; backbuffer stays 256×240.
- **effects** (`tests/effects.test.js`): each event kind spawns the expected particle count; `tick` ages + removes expired; pool capped at `max` (drop oldest); injected rng makes it deterministic.
- **hitstop** (`tests/hitstop.test.js`): `trigger(n)` → `step()` returns true exactly `n` times then false; `active()` reflects state.
- **camera** (extend `tests/` camera test): look-ahead offsets toward `facing`; eases (doesn't snap); still clamps to bounds.
- **determinism**: the golden master test stays green (proves §6–§9 didn't perturb the sim).
- All current tests remain green.

## 13. Mobile safety (explicit)

- Backbuffer fixed at 256×240 (test-asserted) — the only thing that changes is CSS size.
- DPR capped at 4 in the resize math.
- **Manual gate before merge:** run on a real phone (or headless at phone DPR) — confirm crisp, no shimmer, and **no freeze** while scrolling a level. This is a required step in the plan, given the freeze history.

## 14. Rollout
Single feature branch `feat/track-a-crisp-feel` → implement per the plan → verify (suite + mobile) → merge to `main` → web auto-deploys; the next Android/iOS `sync` picks it up. Tracks B/C/D follow as separate specs.
