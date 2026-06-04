# Track A — Crisp & Feel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Plumber Quest razor-sharp on every screen (DPR-aware integer scaling) and noticeably juicier (particles, hero squash/stretch, camera look-ahead, hit-stop, transition wipes, optional CRT) without changing the art, the gameplay, or the deterministic simulation.

**Architecture:** Crispness is a CSS-size change only — the 256×240 backbuffer never grows (no large-buffer freeze). Juice is an event-driven cosmetic layer: the sim's existing events (with additive `x,y`) feed a sim-independent `effects` system drawn over the world; the renderer adds read-only hero squash/stretch and transition wipes; a loop-level `hitstop` controller freezes the sim briefly for impact. `world.js`/sim logic is unchanged.

**Tech Stack:** Vanilla ES modules (zero build), HTML5 Canvas 2D, the in-browser test harness (`tests/harness.js`).

**Spec:** `docs/superpowers/specs/2026-06-04-track-a-crisp-and-feel-design.md` (rev 2).

---

## Running tests (no CLI runner — use headless Chrome or a browser)

Tests are ES modules using `tests/harness.js`, registered in `tests/index.html`, executed in a browser via `runAll()` which writes `PASS n / FAIL m` plus one ✅/❌ line per test into `#out`.

**Canonical runner (headless, one command):**
```bash
bash tools/run-tests.sh
```
It loads `tests/index.html?post=1` in headless Chrome; the harness POSTs its
summary to the shot server on `:8011`, and the script prints `PASS n / FAIL m`
plus any `❌` lines. (This Chrome's new-headless mode does not support
`--dump-dom`, hence the self-POST approach — the same pattern the recorder uses.)
- **Expected FAIL (red step):** a `❌ …` line and `FAIL ≥ 1`.
- **Expected PASS (green step):** `PASS <n> / FAIL 0`, no `❌`.

**Prereq:** the shot server must be running on `:8011` (serving the repo root and
accepting `POST /shot`). It is already running in this environment; if it drops,
restart with `python3 /tmp/shotsrv.py &`. You can also just open
`http://localhost:8011/tests/index.html` in a real browser and read `#out`.

The current baseline is **117 / 0**. Each task keeps the suite green (except its own red→green TDD step).

---

## File structure

```
src/engine/
  display.js     # NEW: pure DPR-aware integer display-size math
  hitstop.js     # NEW: loop-level real-time hit-stop controller
  camera.js      # MODIFY: look-ahead + ease (clamp preserved)
src/fx/
  effects.js     # NEW: event-driven particle system (sim-independent, rng-injectable)
  fx-overlay.js  # NEW: draws particles + impact flash over the world (read-only)
src/render/
  renderer.js    # MODIFY: hero squash/stretch (pure helper) + transition wipes (renderer-local)
  crt.js         # NEW: optional CRT/scanline post-pass
src/game/
  pickups.js tiles.js enemies-resolve.js enemies.js projectiles.js world.js  # MODIFY: additive x,y on events
src/main.js      # MODIFY: DPR-aware resize; wire effects+hitstop+fx-overlay+crt; draw order
index.html       # MODIFY: add #crt toggle button
style.css        # MODIFY: style #crt button
tests/
  display.test.js  hitstop.test.js  effects.test.js  fx-overlay.test.js
  events-coords.test.js  camera.test.js  renderer-extras.test.js  crt.test.js
  renderer-readonly.test.js  # MODIFY: update 2 camera tests for easing
  index.html                 # MODIFY: register new test modules
```

---

## Task 1: DPR-aware integer display sizing

**Files:**
- Create: `src/engine/display.js`
- Test: `tests/display.test.js`
- Modify: `src/main.js` (the `resize()` function, ~lines 111–118)

- [ ] **Step 1: Write the failing test**

```js
// tests/display.test.js
import { test, assert, assertEqual } from './harness.js';
import { computeDisplay } from '../src/engine/display.js';

test('picks the largest integer DEVICE-pixel scale and divides back by dpr', () => {
  // phone-ish: 390 css wide, dpr 3, touch (band reserved)
  const d = computeDisplay(390, 800, 3, true);
  assertEqual(d.scaleDevice, 4, 'device scale = floor(min(1170/256, availDev/240))');
  assert(Math.abs(d.cssW - (256 * 4) / 3) < 0.01, 'cssW = logical*scale/dpr');
  assert(Math.abs(d.cssH - (240 * 4) / 3) < 0.01, 'cssH = logical*scale/dpr');
  assertEqual(d.band, 170, 'touch band reserved (min(170, 800*0.26))');
});

test('desktop (dpr 1, no touch) scales up with no band', () => {
  const d = computeDisplay(1440, 900, 1, false);
  assertEqual(d.band, 0);
  assertEqual(d.scaleDevice, Math.floor(Math.min(1440 / 256, 900 / 240))); // 3
  assertEqual(d.cssW, 256 * d.scaleDevice);
});

test('never returns a sub-1 scale and caps dpr at 4', () => {
  assertEqual(computeDisplay(100, 100, 8, false).scaleDevice >= 1, true);
  const hi = computeDisplay(1000, 1000, 8, false);   // dpr capped to 4 internally
  assertEqual(hi.scaleDevice, Math.floor(Math.min((1000 * 4) / 256, (1000 * 4) / 240)));
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`display.js` missing). See "Running tests".

- [ ] **Step 3: Implement `src/engine/display.js`**

```js
// src/engine/display.js
// Pure DPR-aware integer display sizing. The canvas BACKBUFFER stays 256x240
// (set elsewhere); this only computes the CSS size so the backbuffer composites
// to an EXACT integer number of device pixels => crisp, no shimmer, no large buffer.
export function computeDisplay(vw, vh, dpr, isTouch, logicalW = 256, logicalH = 240) {
  const d = Math.max(1, Math.min(4, dpr || 1));            // cap dpr for perf
  const band = isTouch ? Math.min(170, Math.round(vh * 0.26)) : 0;
  const availH = Math.max(1, vh - band);
  const scaleDevice = Math.max(1, Math.floor(Math.min((vw * d) / logicalW, (availH * d) / logicalH)));
  return { scaleDevice, band, cssW: (logicalW * scaleDevice) / d, cssH: (logicalH * scaleDevice) / d };
}
```

- [ ] **Step 4: Run tests — expect PASS.**

- [ ] **Step 5: Wire into `main.js` `resize()`**

Add the import near the other engine imports at the top of `src/main.js`:
```js
import { computeDisplay } from './engine/display.js';
```
Replace the body of `resize()` (currently lines ~111–118) with:
```js
function resize() {
  const vw = window.innerWidth || LOGICAL_W, vh = window.innerHeight || LOGICAL_H;
  const { cssW, cssH, band } = computeDisplay(vw, vh, window.devicePixelRatio || 1, isTouch, LOGICAL_W, LOGICAL_H);
  document.body.style.paddingBottom = band + 'px';   // centers canvas above the control band
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  // NOTE: canvas.width/height (the backbuffer) intentionally stays 256x240 — never resized.
}
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/display.js tests/display.test.js src/main.js
git commit -m "feat(display): DPR-aware integer scaling (crisp, backbuffer stays 256x240)"
```

---

## Task 2: Hit-stop controller

**Files:**
- Create: `src/engine/hitstop.js`
- Test: `tests/hitstop.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/hitstop.test.js
import { test, assert, assertEqual } from './harness.js';
import { createHitstop } from '../src/engine/hitstop.js';

test('step() returns true exactly `frames` times after trigger, then false', () => {
  const hs = createHitstop();
  assertEqual(hs.step(), false, 'idle: no freeze');
  hs.trigger(3);
  assertEqual(hs.active(), true);
  assertEqual(hs.step(), true);   // 1
  assertEqual(hs.step(), true);   // 2
  assertEqual(hs.step(), true);   // 3
  assertEqual(hs.step(), false);  // done
  assertEqual(hs.active(), false);
});

test('trigger takes the max (does not stack)', () => {
  const hs = createHitstop();
  hs.trigger(2); hs.trigger(5); hs.trigger(1);
  let n = 0; while (hs.step()) n++;
  assertEqual(n, 5);
});
```

- [ ] **Step 2: Run tests — expect FAIL.**

- [ ] **Step 3: Implement `src/engine/hitstop.js`**

```js
// src/engine/hitstop.js
// Real-time-only freeze for impact. NOT part of the sim (the golden master calls
// gs.update directly, so this can never affect determinism).
export function createHitstop() {
  let frames = 0;
  return {
    trigger(n) { if (n > frames) frames = n; },     // take the max; don't stack
    step() { if (frames > 0) { frames--; return true; } return false; },  // true => SKIP this sim step
    active() { return frames > 0; },
  };
}
```

- [ ] **Step 4: Run tests — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/engine/hitstop.js tests/hitstop.test.js
git commit -m "feat(engine): hit-stop controller (loop-level, determinism-safe)"
```

---

## Task 3: Effects (particle) system

**Files:**
- Create: `src/fx/effects.js`
- Test: `tests/effects.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/effects.test.js
import { test, assert, assertEqual } from './harness.js';
import { createEffects, FX_COUNT } from '../src/fx/effects.js';

const rng = () => 0.5;   // deterministic spread

test('a coin-collected event spawns the sparkle particle count at the coords', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'coin-collected', x: 40, y: 24 });
  assertEqual(fx.list().length, FX_COUNT.sparkle);
  assert(fx.list().every((p) => p.life > 0 && p.ttl > 0), 'particles alive with ttl');
});

test('events without coords or unknown types spawn nothing', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'coin-collected' });          // no x,y
  fx.handle({ type: 'level-clear', x: 1, y: 1 });  // not a particle event
  assertEqual(fx.list().length, 0);
});

test('tick ages particles and removes expired ones', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'enemy-stomped', x: 10, y: 10 });
  assert(fx.list().length > 0);
  for (let i = 0; i < 120; i++) fx.tick(1 / 60);   // 2s >> any ttl
  assertEqual(fx.list().length, 0, 'all expired');
});

test('pool is capped at max (drop oldest)', () => {
  const fx = createEffects({ rng, max: 10 });
  for (let i = 0; i < 20; i++) fx.handle({ type: 'brick-broken', x: i, y: 0 });
  assert(fx.list().length <= 10, 'capped');
});

test('impact events raise the flash; it decays to 0', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'enemy-stomped', x: 0, y: 0 });
  assert(fx.flash() > 0, 'flash raised');
  for (let i = 0; i < 60; i++) fx.tick(1 / 60);
  assertEqual(fx.flash(), 0, 'flash decayed');
});

test('clear() empties particles and flash', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'enemy-stomped', x: 0, y: 0 });
  fx.clear();
  assertEqual(fx.list().length, 0); assertEqual(fx.flash(), 0);
});
```

- [ ] **Step 2: Run tests — expect FAIL.**

- [ ] **Step 3: Implement `src/fx/effects.js`**

```js
// src/fx/effects.js
// Event-driven cosmetic particle system. NOT part of the deterministic sim,
// so Math.random is allowed (rng injectable for tests). Consumes drained game
// events (with additive x,y) and exposes a read-only particle list + flash.
export const FX_FOR = {
  'coin-collected': 'sparkle', 'enemy-stomped': 'stars', 'brick-broken': 'debris',
  'powerup-collected': 'sparkle', 'jump': 'dust', 'player-hit': 'shards',
};
export const FX_COUNT = { sparkle: 5, stars: 6, debris: 4, dust: 3, shards: 4 };
const FLASH_EVENTS = { 'enemy-stomped': 1, 'brick-broken': 1, 'player-hit': 1 };

// per-kind: [color, ttl, speed, gravity, size]
const KIND = {
  sparkle: ['#ffd23f', 0.45, 40, -30, 2],
  stars:   ['#ffffff', 0.5,  70, 140, 2],
  debris:  ['#a3261c', 0.6,  60, 260, 3],
  dust:    ['#d6c8b4', 0.35, 30, 20,  2],
  shards:  ['#ff5a4d', 0.5,  80, 120, 2],
};

export function createEffects({ rng = Math.random, max = 120 } = {}) {
  let parts = [];
  let flashV = 0;

  function spawn(kind, x, y) {
    const [color, ttl, speed, gravity, size] = KIND[kind];
    const n = FX_COUNT[kind];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + (rng() - 0.5);
      const sp = speed * (0.5 + rng());
      parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - speed * 0.4,
        gravity, life: ttl, ttl, color, size });
    }
    if (parts.length > max) parts.splice(0, parts.length - max);   // drop oldest
  }

  function handle(ev) {
    if (FLASH_EVENTS[ev.type]) flashV = Math.max(flashV, 0.7);
    const kind = FX_FOR[ev.type];
    if (!kind || ev.x == null || ev.y == null) return;
    spawn(kind, ev.x, ev.y);
  }

  function tick(dt) {
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= dt; }
    parts = parts.filter((p) => p.life > 0);
    flashV = Math.max(0, flashV - dt * 3.5);
  }

  return {
    handle, spawn, tick,
    list: () => parts,
    flash: () => flashV,
    clear: () => { parts = []; flashV = 0; },
  };
}
```

- [ ] **Step 4: Run tests — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/fx/effects.js tests/effects.test.js
git commit -m "feat(fx): event-driven particle system + impact flash"
```

---

## Task 4: Effects overlay (draw)

**Files:**
- Create: `src/fx/fx-overlay.js`
- Test: `tests/fx-overlay.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/fx-overlay.test.js
import { test, assert } from './harness.js';
import { createFxOverlay } from '../src/fx/fx-overlay.js';

function stubCtx() {
  const noop = () => {};
  return new Proxy({ canvas: { width: 256, height: 240 } }, {
    get: (t, k) => (k === 'canvas' ? t.canvas : noop), set: () => true,
  });
}

test('draw renders particles + flash without throwing and mutates no input', () => {
  const o = createFxOverlay(stubCtx());
  const list = Object.freeze([Object.freeze({ x: 10, y: 20, life: 0.3, ttl: 0.5, color: '#fff', size: 2 })]);
  o.draw(list, { x: 5 }, 0.4);   // frozen list would throw on mutation
  o.draw([], { x: 0 }, 0);       // empty + no flash
  assert(true, 'no throw, no mutation');
});
```

- [ ] **Step 2: Run tests — expect FAIL.**

- [ ] **Step 3: Implement `src/fx/fx-overlay.js`**

```js
// src/fx/fx-overlay.js
// Draws the effects layer (particles + impact flash) over the finished world
// frame. READ-ONLY of the effects state and camera; never touches world.
export function createFxOverlay(ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  function draw(list, cam, flash) {
    for (const p of list) {
      const a = Math.max(0, Math.min(1, p.life / p.ttl));
      if (a <= 0) continue;
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      const s = Math.max(1, p.size);
      ctx.fillRect(Math.round(p.x - cam.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.6, flash) * 0.5; ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  }
  return { draw };
}
```

- [ ] **Step 4: Run tests — expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/fx/fx-overlay.js tests/fx-overlay.test.js
git commit -m "feat(fx): effects overlay renderer (particles + flash, read-only)"
```

---

## Task 5: Additive `x,y` on sim events

**Files:**
- Modify: `src/game/pickups.js`, `src/game/tiles.js`, `src/game/enemies-resolve.js`, `src/game/enemies.js`, `src/game/projectiles.js`, `src/game/world.js`
- Test: `tests/events-coords.test.js`

> Each edit only adds `x,y` to an existing `emit(...)` payload — no gameplay logic changes. The determinism fingerprint hashes player/entity/score state, not event payloads, so the golden master is unaffected (verified in Step 4).

- [ ] **Step 1: Write the failing test**

This drives the real sim and asserts every emitted coord-event carries numeric `x,y` (more robust than poking internal tile bumps):

```js
// tests/events-coords.test.js
import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnGoomba } from '../src/game/enemies.js';

const COORD_EVENTS = new Set(['coin-collected', 'enemy-stomped', 'brick-broken', 'powerup-collected', 'jump', 'player-hit']);

test('every coord-event emitted during play carries numeric x,y', () => {
  const lvl = parseLevel(['----o-----', 'P--------F', 'XXXXXXXXXX'], { tile: 16 });
  const w = createWorld(lvl);
  w.entities.push(spawnGoomba(80, 16, 30));      // a foe to stomp into
  const seen = [];
  const run = 600;
  for (let i = 0; i < run; i++) {
    w.update(1 / 60, { right: true, run: true, jumpPressed: i % 40 === 0, jumpHeld: i % 40 < 8 });
    for (const ev of w.drainEvents()) {
      if (COORD_EVENTS.has(ev.type)) seen.push(ev);
    }
    if (w.flagReached || w.playerDied) break;
  }
  assert(seen.length > 0, 'some coord-events fired');
  for (const ev of seen) {
    assert(Number.isFinite(ev.x) && Number.isFinite(ev.y), `${ev.type} has numeric x,y (got ${ev.x},${ev.y})`);
  }
});
```

- [ ] **Step 2: Run tests — expect FAIL** (events currently lack `x,y`).

- [ ] **Step 3: Add `x,y` to each emit site**

`src/game/pickups.js`:
- coin tile (the loop with `w.tiles[r][c]`): `w.emit({ type: 'coin-collected' });` → `w.emit({ type: 'coin-collected', x: c * 16 + 8, y: r * 16 + 8 });`
- coin-pickup entity: `w.emit({ type:'coin-collected' });` → `w.emit({ type:'coin-collected', x: it.x, y: it.y });`
- mushroom: `w.emit({ type:'powerup-collected', kind:'mushroom' });` → add `, x: it.x, y: it.y`
- flower: `w.emit({ type:'powerup-collected', kind:'flower' });` → add `, x: it.x, y: it.y`

`src/game/tiles.js`:
- coin-block: `world.emit({ type: 'coin-collected', fromBlock: true });` → add `, x: col * 16 + 8, y: row * 16 + 8`
- brick break: `world.emit({ type: 'brick-broken' });` → `world.emit({ type: 'brick-broken', x: col * 16 + 8, y: row * 16 + 8 });`

`src/game/enemies-resolve.js`:
- `killEnemy` (`function killEnemy(w, e, x, y, score)`): `w.emit({ type: 'enemy-stomped' });` → `w.emit({ type: 'enemy-stomped', x, y });`
- koopa walk stomp: `w.emit({ type: 'enemy-stomped' });` → `w.emit({ type: 'enemy-stomped', x: e.x, y: e.y });`
- idle shell kick: `e.kick(p.x); w.emit({ type: 'enemy-stomped' });` → `e.kick(p.x); w.emit({ type: 'enemy-stomped', x: e.x, y: e.y });`
- goomba stomp branch has no own emit (it comes from `e.stomp`), so nothing here.
- `damagePlayer` fire→big: `w.emit({ type: 'player-hit' });` → `w.emit({ type: 'player-hit', x: p.x + p.w / 2, y: p.y + p.h / 2 });`
- `damagePlayer` big→small: same change → `w.emit({ type: 'player-hit', x: p.x + p.w / 2, y: p.y + p.h / 2 });`

`src/game/enemies.js`:
- goomba `stomp(world)`: `world.emit({ type:'enemy-stomped' });` → `world.emit({ type:'enemy-stomped', x: this.x, y: this.y });`

`src/game/projectiles.js`:
- fireball kill: `w.emit({ type: 'enemy-stomped' });` → `w.emit({ type: 'enemy-stomped', x: e.x, y: e.y });`

`src/game/world.js`:
- jump: `w.emit({ type: 'jump' });` → `w.emit({ type: 'jump', x: w.player.x + w.player.w / 2, y: w.player.y + w.player.h });`

- [ ] **Step 4: Run tests — expect PASS, and confirm the golden master is still green**

Run the suite (see "Running tests"). Expected: `events-coords` ✅ AND `determinism: fingerprint matches the recorded golden master` ✅ (proves the payload additions didn't perturb the sim). `FAIL 0`.

- [ ] **Step 5: Commit**

```bash
git add src/game/pickups.js src/game/tiles.js src/game/enemies-resolve.js src/game/enemies.js src/game/projectiles.js src/game/world.js tests/events-coords.test.js
git commit -m "feat(sim): additive x,y on cosmetic events (golden master unchanged)"
```

---

## Task 6: Camera look-ahead + easing

**Files:**
- Modify: `src/engine/camera.js`
- Modify: `tests/renderer-readonly.test.js` (update the 2 existing camera tests for easing)
- Test: `tests/camera.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/camera.test.js
import { test, assert, assertEqual } from './harness.js';
import { createCamera } from '../src/engine/camera.js';

const wide = { left: 0, top: 0, right: 4000, bottom: 240 };

test('one follow() eases partway toward the target (does not snap)', () => {
  const cam = createCamera({ viewW: 256, viewH: 240, bounds: wide });
  cam.follow({ x: 1000, y: 0, w: 12, h: 16, facing: 1 });
  assert(cam.x > 0, 'moved toward player');
  assert(cam.x < 1000, 'did not snap all the way in one frame');
});

test('look-ahead biases the camera in the facing direction', () => {
  const a = createCamera({ viewW: 256, viewH: 240, bounds: wide });
  const b = createCamera({ viewW: 256, viewH: 240, bounds: wide });
  for (let i = 0; i < 200; i++) { a.follow({ x: 1000, y: 0, w: 12, h: 16, facing: 1 }); b.follow({ x: 1000, y: 0, w: 12, h: 16, facing: -1 }); }
  assert(a.x > b.x, 'facing right looks further right than facing left');
});
```

- [ ] **Step 2: Run tests — expect FAIL** (no look-ahead/ease yet; both cameras converge identically so `a.x > b.x` fails).

- [ ] **Step 3: Implement easing + look-ahead in `src/engine/camera.js`**

Replace the file with:
```js
// src/engine/camera.js
// Display-time camera: eases toward the player with directional look-ahead.
// follow() is called per RENDERED frame (in renderer.draw), so easing is a fixed
// factor PER CALL (deterministic for a given sequence of calls, not frame-rate
// independent). Never mutates the world. Vertical scroll is unused (levels are
// 240 tall = view height), so cam.y stays 0.
export function createCamera({ viewW, viewH, bounds, lookAhead = 28, ease = 0.12 }) {
  const cam = { x: 0, y: 0, viewW, viewH, bounds };
  function clampX(x) {
    const b = cam.bounds;
    return Math.max(b.left, Math.min(x, Math.max(b.left, b.right - viewW)));
  }
  cam.follow = (target) => {
    const facing = target.facing || 1;
    const desired = clampX(target.x + target.w / 2 - viewW / 2 + facing * lookAhead);
    cam.x = clampX(cam.x + (desired - cam.x) * ease);   // ease, then keep clamped
    cam.y = 0;
  };
  return cam;
}
```

> **Vertical ease (spec §7) is intentionally omitted:** current levels are exactly 240px tall = the view height, so there is no vertical scroll (`bottom: 240`, `viewH: 240`) and `cam.y` is always 0. Adding vertical easing now would be dead code (YAGNI). It is deferred to whenever taller levels appear (Track B/D).

- [ ] **Step 4: Update the 2 existing camera tests in `tests/renderer-readonly.test.js`**

Easing means a single `follow()` no longer snaps, so iterate to convergence. Replace the test `'camera follows player and clamps to bounds'` with:
```js
test('camera eases toward the player and clamps to bounds', () => {
  const cam = createCamera({ viewW:64, viewH:240, bounds:{left:0,top:0,right:1000,bottom:240} });
  for (let i=0;i<120;i++) cam.follow({ x:500, y:0, w:12, h:16, facing:1 });
  assert(cam.x > 0 && cam.x < 1000, 'follows toward player');
  for (let i=0;i<120;i++) cam.follow({ x:-100, y:0, w:12, h:16, facing:-1 });
  assertEqual(Math.round(cam.x), 0, 'eases to clamped left');
});
```
Replace the test `'reassigning cam.bounds affects clamping (live bounds, not captured)'` with:
```js
test('reassigning cam.bounds affects clamping (live bounds, not captured)', () => {
  const cam = createCamera({ viewW:64, viewH:240, bounds:{left:0,top:0,right:100,bottom:240} });
  for (let i=0;i<120;i++) cam.follow({ x:1000, y:0, w:12, h:16, facing:1 });
  assertEqual(Math.round(cam.x), Math.max(0, 100 - 64), 'eases to original right edge');
  cam.bounds = { left:0, top:0, right:2000, bottom:240 };
  for (let i=0;i<120;i++) cam.follow({ x:1000, y:0, w:12, h:16, facing:1 });
  assert(cam.x > 100, 'new wider bounds allow scrolling further');
});
```

- [ ] **Step 5: Run tests — expect PASS** (camera.test.js + the two updated tests + everything else).

- [ ] **Step 6: Commit**

```bash
git add src/engine/camera.js tests/camera.test.js tests/renderer-readonly.test.js
git commit -m "feat(camera): directional look-ahead + easing (display-time)"
```

---

## Task 7: Hero squash & stretch

**Files:**
- Modify: `src/render/renderer.js` (add a pure `heroSquash` helper + apply it in `drawWorld`'s hero blit)
- Test: `tests/renderer-extras.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/renderer-extras.test.js
import { test, assert, assertEqual } from './harness.js';
import { heroSquash } from '../src/render/renderer.js';

test('stretches (taller, narrower) when rising fast', () => {
  const s = heroSquash({ vy: -300, onGround: false }, 0);
  assert(s.sy > 1 && s.sx < 1, `stretch: sx=${s.sx} sy=${s.sy}`);
  assert(Math.abs(s.sx * s.sy - 1) < 0.06, 'roughly volume-preserving');
});

test('squashes (shorter, wider) right after landing', () => {
  const s = heroSquash({ vy: 0, onGround: true }, 1);   // landT=1 => fresh landing
  assert(s.sy < 1 && s.sx > 1, `squash: sx=${s.sx} sy=${s.sy}`);
});

test('neutral when standing with no landing impulse', () => {
  const s = heroSquash({ vy: 0, onGround: true }, 0);
  assertEqual(s.sx, 1); assertEqual(s.sy, 1);
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`heroSquash` not exported).

- [ ] **Step 3: Add the pure helper + apply it (renderer.js)**

At the top of `src/render/renderer.js` (module scope, before `createRenderer`), add and export:
```js
// Pure cosmetic squash/stretch from read-only player state + a landing impulse
// (landT in 0..1, decays in the renderer). Volume-ish: sx*sy ≈ 1.
export function heroSquash(p, landT) {
  if (landT > 0) {                          // landing squash dominates
    const k = 0.18 * landT;
    return { sx: 1 + k, sy: 1 - k };
  }
  if (!p.onGround && p.vy < -80) {          // rising fast => stretch
    const k = Math.min(0.12, (-p.vy - 80) / 1600 + 0.04);
    return { sx: 1 - k, sy: 1 + k };
  }
  return { sx: 1, sy: 1 };
}
```

Inside `createRenderer`, add display-only landing state near the other display helpers:
```js
const heroAnim = { prevOnGround: true, landT: 0 };
```

In `drawWorld`, where the hero is drawn (the block computing `img = sprites.hero[tier][heroPose(pl, clock)]` and the final `blit(...)`), replace the hero blit with a squash-aware version. Find:
```js
    const pl = world.player;
    if (!(pl.invuln > 0 && Math.floor(pl.invuln * 20) % 2)) {
      const tier = (pl.power === 'small' || pl.power === 'big' || pl.power === 'fire') ? pl.power : 'big';
      const img = sprites.hero[tier][heroPose(pl, clock)];
      const sz = sprites.heroSize[tier];
      const pp = interp(pl, alpha);
      blit(img, Math.round(pp.x + pl.w/2 - sz.w/2 - cam.x), Math.round(pp.y + pl.h - sz.h), sz.w, sz.h, pl.facing < 0);
    }
```
and replace it with:
```js
    const pl = world.player;
    // landing detection (display-only): onGround false->true starts a squash impulse
    if (pl.onGround && !heroAnim.prevOnGround) heroAnim.landT = 1;
    heroAnim.prevOnGround = pl.onGround;
    heroAnim.landT = Math.max(0, heroAnim.landT - 0.16);   // ~6 frames decay
    if (!(pl.invuln > 0 && Math.floor(pl.invuln * 20) % 2)) {
      const tier = (pl.power === 'small' || pl.power === 'big' || pl.power === 'fire') ? pl.power : 'big';
      const img = sprites.hero[tier][heroPose(pl, clock)];
      const sz = sprites.heroSize[tier];
      const pp = interp(pl, alpha);
      const { sx, sy } = heroSquash(pl, heroAnim.landT);
      const dw = sz.w * sx, dh = sz.h * sy;
      const dx = Math.round(pp.x + pl.w / 2 - dw / 2 - cam.x);
      const dy = Math.round(pp.y + pl.h - dh);             // keep feet planted
      blit(img, dx, dy, dw, dh, pl.facing < 0);
    }
```

> This keeps the hitbox unchanged (only the drawn sprite scales) and never mutates `world` — the renderer-readonly test still passes. (The spec's **skid cue** is implemented separately in Task 10 Step 4b as a dust puff on a fast direction-reversal — there's no dedicated skid sprite, so a dust cue is the cheapest faithful read and it lives in the effects layer.)

- [ ] **Step 4: Run tests — expect PASS**, including `renderer.draw mutates nothing in the full world` still ✅.

- [ ] **Step 5: Commit**

```bash
git add src/render/renderer.js tests/renderer-extras.test.js
git commit -m "feat(render): hero squash & stretch (read-only, feet-planted)"
```

---

## Task 8: Transition wipes (renderer-local)

**Files:**
- Modify: `src/render/renderer.js` (renderer-local transition timer + wipe draw)
- Test: extend `tests/renderer-extras.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/renderer-extras.test.js`:
```js
import { wipeProgress } from '../src/render/renderer.js';

test('wipeProgress ramps 0->1 over the duration then clamps', () => {
  assertEqual(wipeProgress(0, 0.3), 0);
  assert(Math.abs(wipeProgress(0.15, 0.3) - 0.5) < 0.001, 'half way');
  assertEqual(wipeProgress(0.3, 0.3), 1);
  assertEqual(wipeProgress(5, 0.3), 1, 'clamped');
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`wipeProgress` not exported).

- [ ] **Step 3: Implement (renderer.js)**

Export the pure helper at module scope (near `heroSquash`):
```js
export const wipeProgress = (t, dur) => Math.max(0, Math.min(1, t / dur));
```

Inside `createRenderer`, add renderer-local transition state near `heroAnim`:
```js
const trans = { prevState: null, t: 0, kind: null };   // kind: 'in' (level start) | 'out' (level clear)
const WIPE_IN = 0.3, WIPE_OUT = 0.35;
```

In `draw(world, cam, alpha, session, state)`, right after `const clock = world.animClock || 0;` (top of the function), add transition tracking:
```js
    if (state !== trans.prevState) {
      if (state === 'playing') { trans.kind = 'in'; trans.t = 0; }
      else if (state === 'level-clear') { trans.kind = 'out'; trans.t = 0; }
      trans.prevState = state;
    }
    if (trans.kind) trans.t += 1 / 60;
```

Replace the existing per-level fade line:
```js
    if (state === 'playing' && clock < 0.4) { ctx.fillStyle = `rgba(0,0,0,${1 - clock / 0.4})`; ctx.fillRect(0, 0, W, H); }
```
with a wipe driven by the renderer-local timer:
```js
    if (trans.kind === 'in') {
      const p = wipeProgress(trans.t, WIPE_IN);            // 0..1 reveal from left
      if (p < 1) { ctx.fillStyle = '#000'; ctx.fillRect(Math.round(p * W), 0, W, H); }
      else trans.kind = null;
    } else if (trans.kind === 'out' && state === 'level-clear') {
      const p = wipeProgress(trans.t, WIPE_OUT);           // 0..1 cover from left
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, Math.round(p * W), H);
    }
```

- [ ] **Step 4: Run tests — expect PASS** (suite green; renderer-readonly still ✅).

- [ ] **Step 5: Commit**

```bash
git add src/render/renderer.js tests/renderer-extras.test.js
git commit -m "feat(render): level start/clear wipes (renderer-local state)"
```

---

## Task 9: CRT / scanline post-pass + toggle

**Files:**
- Create: `src/render/crt.js`
- Test: `tests/crt.test.js`
- Modify: `index.html`, `style.css` (toggle button)

- [ ] **Step 1: Write the failing test**

```js
// tests/crt.test.js
import { test, assert, assertEqual } from './harness.js';
import { createCrt, CRT_KEY } from '../src/render/crt.js';

function stubCtx() {
  const noop = () => {};
  return new Proxy({ canvas: { width: 256, height: 240 } }, {
    get: (t, k) => (k === 'canvas' ? t.canvas : (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop)),
    set: () => true,
  });
}

test('off by default; toggle persists; draw is a no-op when off', () => {
  localStorage.removeItem(CRT_KEY);
  const crt = createCrt(stubCtx());
  assertEqual(crt.isOn(), false, 'default off');
  crt.draw();                       // off => returns immediately, no throw
  crt.toggle();
  assertEqual(crt.isOn(), true);
  assertEqual(localStorage.getItem(CRT_KEY), '1', 'persisted on');
  crt.draw();                       // on => draws scanlines/vignette, no throw
  assert(true);
});

test('reads persisted preference on construction', () => {
  localStorage.setItem(CRT_KEY, '1');
  assertEqual(createCrt(stubCtx()).isOn(), true);
});
```

- [ ] **Step 2: Run tests — expect FAIL.**

- [ ] **Step 3: Implement `src/render/crt.js`**

```js
// src/render/crt.js
// Optional CRT/scanline post-pass over the finished 256x240 frame. Off by
// default; preference persisted. Drawn LAST (covers world + overlays).
export const CRT_KEY = 'pq.crt';
export function createCrt(ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  let on = localStorage.getItem(CRT_KEY) === '1';
  function draw() {
    if (!on) return;
    ctx.save();
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#000';        // scanlines: darken every other row
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, 0, H);        // soft top/bottom vignette
    g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.12, 'rgba(0,0,0,0)');
    g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  return {
    draw, isOn: () => on,
    toggle: () => { on = !on; localStorage.setItem(CRT_KEY, on ? '1' : '0'); return on; },
  };
}
```

- [ ] **Step 4: Run tests — expect PASS.**

- [ ] **Step 5: Add the toggle button (markup + style)**

In `index.html`, right after the `<button id="mute" …>` line, add:
```html
  <button id="crt" aria-label="Toggle CRT effect">📺</button>
```
In `style.css`, after the `#mute{…}` rule, add:
```css
#crt{position:absolute;top:6px;right:46px;font:14px sans-serif;background:#0008;color:#fff;
     border:0;border-radius:6px;padding:6px 8px;cursor:pointer;z-index:60;opacity:0.6}
#crt.on{opacity:1}
```

- [ ] **Step 6: Commit**

```bash
git add src/render/crt.js tests/crt.test.js index.html style.css
git commit -m "feat(render): optional CRT/scanline post-pass + toggle (off by default)"
```

---

## Task 10: Wire effects + hit-stop + fx-overlay + CRT into `main.js`

**Files:**
- Modify: `src/main.js`

> No new unit test (integration). The suite must stay green (imports resolve) and the manual sanity in Step 6 confirms behavior.

- [ ] **Step 1: Add imports** (top of `src/main.js`, with the other imports)

```js
import { createEffects } from './fx/effects.js';
import { createFxOverlay } from './fx/fx-overlay.js';
import { createHitstop } from './engine/hitstop.js';
import { createCrt } from './render/crt.js';
```

- [ ] **Step 2: Construct the systems** (after `const socialOverlay = …` / near the renderer setup)

```js
const effects = createEffects();
const fxOverlay = createFxOverlay(canvas.getContext('2d'));
const hitstop = createHitstop();
const crt = createCrt(canvas.getContext('2d'));
```

- [ ] **Step 3: Wire the loop `step()` (hit-stop BEFORE consuming intent; tick effects always)**

Replace the existing `step()` in the `createLoop({ … })` call:
```js
  step() {
    const intent = input.consumeIntent();
    gs.update(1/60, intent);
    if (gs.world) cam.bounds = gs.world.bounds;
  },
```
with:
```js
  step() {
    if (hitstop.step()) { effects.tick(1 / 60); return; }   // freeze sim; keep particles alive; keep intent pending
    const intent = input.consumeIntent();
    gs.update(1 / 60, intent);
    if (gs.world) cam.bounds = gs.world.bounds;
    effects.tick(1 / 60);
  },
```

- [ ] **Step 4: Feed events into effects + hit-stop** (inside the `afterFrame()` event-drain loop)

In the existing `for (const ev of gs.world.drainEvents()) { … }` loop, after the existing audio/haptic/social handling, add:
```js
      effects.handle(ev);
      if (ev.type === 'enemy-stomped') hitstop.trigger(4);
      else if (ev.type === 'brick-broken') hitstop.trigger(3);
      else if (ev.type === 'player-hit') hitstop.trigger(6);
```
Also clear effects on a fresh level so particles don't carry over — at the top of `afterFrame()`, before the drain, add:
```js
    if (gs.state !== prevState && (gs.state === STATES.intro || gs.state === STATES.title)) effects.clear();
```
*(`prevState` already exists in `main.js` for audio transitions; this reuses it. Keep the existing `prevState` update logic intact.)*

- [ ] **Step 4b: Skid dust cue** (spec §6 skid)

Near the other `main.js` module-scope state (e.g. by `let prevState = …`), add:
```js
let prevFacing = 1;
```
Then inside `afterFrame()`, after the event-drain loop, add a fast-reversal dust puff:
```js
    if (gs.world && gs.state === STATES.playing) {
      const pl = gs.world.player;
      if (pl.onGround && Math.abs(pl.vx) > 60 && pl.facing !== prevFacing) {
        effects.spawn('dust', pl.x + pl.w / 2, pl.y + pl.h);   // skid kick
      }
      prevFacing = pl.facing;
    }
```

- [ ] **Step 5: Draw order in `render(alpha)`** (fx after world, social after fx, CRT last)

At the end of the `render(alpha)` hook, the current last line is:
```js
    socialOverlay.draw(social.getState(), (typeof performance !== 'undefined' ? performance.now() : 0), st);
```
Replace it with:
```js
    if (st !== STATES.title && st !== STATES.difficultySelect && st !== STATES.gameOver && st !== STATES.win && st !== STATES.intro)
      fxOverlay.draw(effects.list(), cam, effects.flash());   // particles over the world only
    socialOverlay.draw(social.getState(), (typeof performance !== 'undefined' ? performance.now() : 0), st);
    crt.draw();                                                // final post-pass over everything
```

- [ ] **Step 6: Wire the CRT toggle button** (near the `#mute` listener)

```js
const crtBtn = document.getElementById('crt');
crtBtn.classList.toggle('on', crt.isOn());
crtBtn.addEventListener('click', () => { crtBtn.classList.toggle('on', crt.toggle()); });
```

- [ ] **Step 7: Run the suite + manual sanity**

Run tests → `FAIL 0`. Then open `http://localhost:8011/` and confirm: stomping a foe spawns stars + a brief freeze + flash; breaking a brick throws debris; collecting a coin sparkles; the hero squashes on landing and stretches on a jump; the camera leads slightly in the run direction; `📺` toggles scanlines; the game still plays normally.

- [ ] **Step 8: Commit**

```bash
git add src/main.js
git commit -m "feat: wire effects, hit-stop, fx-overlay, and CRT into the loop"
```

---

## Task 11: Register new test modules

**Files:**
- Modify: `tests/index.html`

- [ ] **Step 1: Add imports** before `await runAll(...)`:

```js
  await import('./display.test.js');
  await import('./hitstop.test.js');
  await import('./effects.test.js');
  await import('./fx-overlay.test.js');
  await import('./events-coords.test.js');
  await import('./camera.test.js');
  await import('./renderer-extras.test.js');
  await import('./crt.test.js');
```

- [ ] **Step 2: Run the full suite — expect PASS** (baseline 117 + the new tests, `FAIL 0`).

- [ ] **Step 3: Commit**

```bash
git add tests/index.html
git commit -m "test: register Track A test modules"
```

---

## Task 12: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite green** — run tests; `FAIL 0`; the `determinism … golden master` test is ✅ and `renderer.draw mutates nothing` is ✅.

- [ ] **Step 2: Crispness check** — open `/` on desktop; confirm pixels are even (no shimmer) when scrolling a level. Inspect: `canvas.width === 256 && canvas.height === 240` (backbuffer never grew).

- [ ] **Step 3: REQUIRED mobile gate** — load `/` on a real phone (or headless at phone DPR). Confirm: crisp, no shimmer, and **no freeze** while scrolling/playing a full level. (We have a freeze scar from a prior large backbuffer; this is a hard gate before merge.)

- [ ] **Step 4: Juice sanity** — stomp/brick/coin particles, hit-stop, flash, hero squash/stretch, camera look-ahead, wipes on level start/clear, CRT toggle all behave; no event carries over between levels (effects cleared).

- [ ] **Step 5: Commit any final tweaks**

```bash
git add -A && git commit -m "chore: finalize Track A verification" || echo "nothing to commit"
```

---

## Notes for the implementer
- **Do not** import `src/fx/*`, `src/render/crt.js`, or `src/engine/hitstop.js` into `src/game/world.js` or the sim. They are wired only from `main.js`. This preserves the deterministic sim and the renderer-readonly contract.
- The 256×240 backbuffer must never be resized — only the CSS size changes (Task 1). This is the mobile-freeze safeguard.
- Particle randomness uses `Math.random` (fine — effects are not in the sim); the `rng` is injected in tests for determinism.
- Hit-stop is checked **before** `input.consumeIntent()` so jump/fire edges aren't swallowed during a freeze.
```
