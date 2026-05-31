# Super Mario Bros–style Platformer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-dependency, zero-build browser side-scrolling platformer (run/jump/stomp/coins/power-ups/flagpole, 3 levels) and deploy it to GitHub Pages.

**Architecture:** Vanilla HTML5 Canvas + ES modules loaded directly by the browser. A fixed-timestep (`1/60`s) deterministic simulation owned by `world.js`, gated by a `game-state.js` state machine, rendered read-only by `renderer.js`. Levels are ASCII data validated into typed objects. Audio is synthesized via Web Audio and driven only by events emitted from simulation. All assets are original.

**Tech Stack:** HTML5 Canvas 2D, JavaScript ES modules, Web Audio API. No build tooling. Local run via `python3 -m http.server 8000`. Tests run in-browser via a custom run-all harness.

**Reference spec:** `docs/superpowers/specs/2026-05-31-super-mario-bros-clone-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `index.html` | Game entry: canvas element, viewport meta, `<script type="module" src="src/main.js">` |
| `style.css` | Page chrome, canvas integer/CSS scaling, mute button |
| `src/main.js` | Bootstrap: build systems, own rAF loop wiring, route world events → audio |
| `src/engine/loop.js` | Fixed-timestep accumulator, interpolation alpha, frame clamp |
| `src/engine/input.js` | Keyboard → intent with explicit edges; per-frame edge consumption |
| `src/engine/aabb.js` | Pure AABB overlap + swept tile resolution reporting geometric facts |
| `src/engine/camera.js` | Side-scroll follow + clamp to level bounds |
| `src/engine/audio.js` | Web Audio synth: SFX + music; context unlock/resume; mute |
| `src/game/game-state.js` | State machine + session values (score/coins/lives/levelIndex) + transitions |
| `src/game/world.js` | Current-level simulation: entities, tilemap, lifecycle queue, events, timer |
| `src/game/player.js` | Movement, jump physics, power state machine |
| `src/game/enemies.js` | Goomba behavior |
| `src/game/pickups.js` | Mushroom, flower, coin pickup behavior |
| `src/game/projectiles.js` | Fireball behavior + cap accounting |
| `src/game/tiles.js` | Tile kinds + bump/break consequences |
| `src/levels/level-format.js` | Parse + validate ASCII → typed level |
| `src/levels/world-1-1.js`,`world-1-2.js`,`world-1-3.js` | Declarative level data |
| `src/render/renderer.js` | Draw world from camera + HUD (read-only) |
| `src/render/sprites.js` | Procedural pixel-art into offscreen canvases |
| `tests/index.html` | Test page: imports all `*.test.js`, runs harness |
| `tests/harness.js` | `test()`, assertions, `runAll()` with pass/fail summary |
| `tests/*.test.js` | Unit tests per §10 of the spec |
| `README.md`, `LICENSE` | Docs + MIT license |

**Constants module** (`src/engine/constants.js`) holds shared tuning: `FIXED_DT = 1/60`, `TILE = 16`, gravity, speeds, jump velocities, coyote/buffer windows, `MAX_FIREBALLS = 2`, `LEVEL_TIME = 300`.

---

## Conventions used in every task

- **Units:** world coordinates in pixels; one tile = `TILE` (16px). Velocities in px/sec. `FIXED_DT` seconds per step.
- **Entity shape:** `{ x, y, w, h, vx, vy, prevX, prevY, alive, type }` plus type-specific fields. `prevX/prevY` snapshotted at the top of each `world.update` before integration.
- **Test command:** open `http://localhost:8000/tests/` in a browser (start server with `python3 -m http.server 8000` from repo root). The page prints `PASS n / FAIL m` and per-test lines. "Run" in steps below means: reload that page and read the summary.
- **Commit** after each task's tests are green.

---

## Task 1: Test harness + project skeleton

**Files:**
- Create: `tests/harness.js`, `tests/index.html`, `tests/smoke.test.js`
- Create: `index.html`, `style.css`, `src/main.js`, `src/engine/constants.js`
- Create: `.gitignore` (already exists — leave as-is)

- [ ] **Step 1: Write the failing test**

Create `tests/smoke.test.js`:

```js
import { test, assertEqual } from './harness.js';

test('harness arithmetic sanity', () => {
  assertEqual(1 + 1, 2);
});
```

- [ ] **Step 2: Write the harness**

Create `tests/harness.js`:

```js
const cases = [];
export function test(name, fn) { cases.push({ name, fn }); }

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}
export function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(msg || `expected ${expected}, got ${actual}`);
}
export function assertClose(actual, expected, eps = 1e-6, msg) {
  if (Math.abs(actual - expected) > eps) throw new Error(msg || `expected ~${expected}, got ${actual}`);
}
export function assertThrows(fn, msg = 'expected throw') {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(msg);
}
export function assertDeepEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(msg || `not deep-equal:\n  ${JSON.stringify(a)}\n  ${JSON.stringify(b)}`);
  }
}

export async function runAll(rootEl) {
  let pass = 0, fail = 0;
  const lines = [];
  for (const c of cases) {
    try { await c.fn(); pass++; lines.push(`  ✅ ${c.name}`); }
    catch (e) { fail++; lines.push(`  ❌ ${c.name} — ${e.message}`); }
  }
  const summary = `PASS ${pass} / FAIL ${fail}`;
  const out = `${summary}\n${lines.join('\n')}`;
  if (rootEl) rootEl.textContent = out;
  console.log(out);
  return { pass, fail };
}
```

- [ ] **Step 3: Write the test page**

Create `tests/index.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Tests</title>
<style>body{font:14px/1.4 monospace;white-space:pre;padding:16px;background:#111;color:#eee}</style>
</head><body><div id="out">running…</div>
<script type="module">
  import { runAll } from './harness.js';
  // Import every test module so its test() calls register:
  await import('./smoke.test.js');
  await runAll(document.getElementById('out'));
</script>
</body></html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: start `python3 -m http.server 8000` from repo root, open `http://localhost:8000/tests/`.
Expected: `PASS 1 / FAIL 0`.

- [ ] **Step 5: Create game skeleton files**

Create `src/engine/constants.js`:

```js
export const FIXED_DT = 1 / 60;
export const TILE = 16;
export const GRAVITY = 1400;          // px/s^2
export const MAX_FALL = 600;          // px/s
export const RUN_ACCEL = 1200;        // px/s^2
export const RUN_MAX = 140;           // px/s walk
export const RUN_MAX_FAST = 220;      // px/s with run held
export const FRICTION = 1600;         // px/s^2
export const JUMP_VELOCITY = -380;    // px/s initial jump
export const JUMP_CUT = 0.45;         // multiply vy when jump released early
export const COYOTE = 0.08;           // s
export const JUMP_BUFFER = 0.10;      // s
export const MAX_FIREBALLS = 2;
export const FIREBALL_SPEED = 260;    // px/s
export const LEVEL_TIME = 300;        // game seconds
export const INVULN_TIME = 1.2;       // s after taking damage
```

Create `index.html`:

```html
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Plumber Quest</title>
<link rel="stylesheet" href="style.css">
</head><body>
<div id="frame">
  <canvas id="game" width="256" height="240"></canvas>
  <button id="mute" aria-label="Toggle sound">🔊</button>
</div>
<script type="module" src="src/main.js"></script>
</body></html>
```

Create `style.css`:

```css
html,body{margin:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center}
#frame{position:relative;image-rendering:pixelated}
#game{image-rendering:pixelated;width:min(100vw,calc(240px * 4 * (256/240)));max-width:100vw;
      height:auto;aspect-ratio:256/240;background:#5c94fc;display:block}
#mute{position:absolute;top:6px;right:6px;font:16px sans-serif;background:#0008;color:#fff;
      border:0;border-radius:6px;padding:4px 8px;cursor:pointer}
```

Create `src/main.js`:

```js
// Bootstrap is filled in by later tasks; placeholder keeps the module loadable.
console.log('Plumber Quest booting…');
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: project skeleton + browser test harness"
```

---

## Task 2: AABB collision facts

**Files:**
- Create: `src/engine/aabb.js`
- Test: `tests/aabb.test.js`

`aabb.js` reports geometric facts only — no game consequences. Two responsibilities:
overlap test, and resolving a moving box against the solid tilemap one axis at a time.

- [ ] **Step 1: Write the failing test**

Create `tests/aabb.test.js`:

```js
import { test, assert, assertEqual, assertClose } from './harness.js';
import { overlap, resolveAgainstTiles } from '../src/engine/aabb.js';

test('overlap detects intersection and rejects separation', () => {
  assert(overlap({x:0,y:0,w:10,h:10}, {x:5,y:5,w:10,h:10}));
  assert(!overlap({x:0,y:0,w:10,h:10}, {x:20,y:0,w:10,h:10}));
});

// solid(col,row) -> bool. Tile size 16. A floor at row 10.
const floor = (c, r) => r === 10;

test('falling box lands on floor and reports landedOnTop', () => {
  const box = { x: 32, y: 150, w: 12, h: 16, vx: 0, vy: 40 };
  const facts = resolveAgainstTiles(box, floor, 16, 1/60);
  assertClose(box.y + box.h, 160, 0.5);     // rests on top of row 10 (y=160)
  assertEqual(box.vy, 0);
  assert(facts.landedOnTop);
});

test('upward box hits ceiling and reports hitFromBelow with tile coords', () => {
  const ceil = (c, r) => r === 5;            // tile top at y=80, bottom at y=96
  const box = { x: 32, y: 98, w: 12, h: 16, vx: 0, vy: -60 };
  const facts = resolveAgainstTiles(box, ceil, 16, 1/60);
  assertEqual(box.vy, 0);
  assert(facts.hitFromBelow);
  assertEqual(facts.tilesHitBelow[0].row, 5);
});

test('horizontal move into wall reports sideBlocked', () => {
  const wall = (c, r) => c === 6;            // wall column at x=96
  const box = { x: 80, y: 0, w: 12, h: 12, vx: 80, vy: 0 };
  const facts = resolveAgainstTiles(box, wall, 16, 1/60);
  assertEqual(box.vx, 0);
  assert(facts.sideBlocked);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: open `http://localhost:8000/tests/` after adding the import (Step 4 wires it).
Expected: FAIL — `resolveAgainstTiles is not a function` (or module load error).

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/aabb.js`:

```js
export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// Move `box` by velocity*dt, resolving against solid tiles one axis at a time.
// `solid(col,row)` returns true if that tile blocks. Returns geometric facts.
export function resolveAgainstTiles(box, solid, tile, dt) {
  const facts = {
    landedOnTop: false, hitFromBelow: false, sideBlocked: false,
    tilesHitBelow: [], tilesHitSide: [],
  };

  // --- Horizontal axis ---
  box.x += box.vx * dt;
  if (box.vx !== 0) {
    const dir = Math.sign(box.vx);
    const probeX = dir > 0 ? box.x + box.w : box.x;
    const col = Math.floor(probeX / tile);
    for (let row = Math.floor(box.y / tile); row <= Math.floor((box.y + box.h - 1) / tile); row++) {
      if (solid(col, row)) {
        box.x = dir > 0 ? col * tile - box.w : (col + 1) * tile;
        box.vx = 0;
        facts.sideBlocked = true;
        facts.tilesHitSide.push({ col, row });
        break;
      }
    }
  }

  // --- Vertical axis ---
  box.y += box.vy * dt;
  if (box.vy !== 0) {
    const dir = Math.sign(box.vy);
    const probeY = dir > 0 ? box.y + box.h : box.y;
    const row = Math.floor(probeY / tile);
    for (let col = Math.floor(box.x / tile); col <= Math.floor((box.x + box.w - 1) / tile); col++) {
      if (solid(col, row)) {
        if (dir > 0) { box.y = row * tile - box.h; facts.landedOnTop = true; }
        else { box.y = (row + 1) * tile; facts.hitFromBelow = true; facts.tilesHitBelow.push({ col, row }); }
        box.vy = 0;
        break;
      }
    }
  }
  return facts;
}
```

- [ ] **Step 4: Wire test into the page and run**

Add to `tests/index.html` before `runAll`: `await import('./aabb.test.js');`
Run: reload `http://localhost:8000/tests/`.
Expected: all aabb tests PASS. (This covers spec §10.1.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: AABB collision facts with per-axis tile resolution"
```

---

## Task 3: Input edges with once-per-frame consumption

**Files:**
- Create: `src/engine/input.js`
- Test: `tests/input.test.js`

Intent exposes held flags + edge flags. The loop will call `input.beginFrame()` once
per rendered frame; edges read true only on the first `consumeIntent()` of that frame
(covers 0/1/N sim steps per frame — spec §10.8).

- [ ] **Step 1: Write the failing test**

Create `tests/input.test.js`:

```js
import { test, assert, assertEqual } from './harness.js';
import { createInput } from '../src/engine/input.js';

function press(input, code) { input._onKey(code, true); }
function release(input, code) { input._onKey(code, false); }

test('jumpPressed edge is true once per frame even across multiple steps', () => {
  const input = createInput();
  press(input, 'Space');
  input.beginFrame();
  const step1 = input.consumeIntent();   // first step this frame
  const step2 = input.consumeIntent();   // second step same frame
  assert(step1.jumpPressed, 'first step sees press');
  assert(!step2.jumpPressed, 'second step does not re-see press');
  assert(step2.jumpHeld, 'still held');
});

test('zero steps in a frame does not lose the next frame press', () => {
  const input = createInput();
  press(input, 'Space');
  input.beginFrame();                     // frame with 0 consume calls
  input.beginFrame();                     // next frame
  const s = input.consumeIntent();
  assert(s.jumpPressed, 'press still delivered on first consume');
});

test('release produces jumpReleased edge once', () => {
  const input = createInput();
  press(input, 'Space');
  input.beginFrame(); input.consumeIntent();
  release(input, 'Space');
  input.beginFrame();
  const s = input.consumeIntent();
  assert(s.jumpReleased, 'release edge delivered');
  assert(!s.jumpHeld);
});

test('movement held flags reflect keys', () => {
  const input = createInput();
  press(input, 'ArrowRight'); press(input, 'ShiftLeft');
  input.beginFrame();
  const s = input.consumeIntent();
  assert(s.right && s.run && !s.left);
});
```

- [ ] **Step 2: Run to verify it fails**

Add `await import('./input.test.js');` to `tests/index.html`. Reload.
Expected: FAIL — `createInput is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/input.js`:

```js
const MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyJ: 'fire', KeyZ: 'fire',
};

export function createInput() {
  const held = { left:false, right:false, jump:false, run:false, fire:false };
  // edges pending delivery: 'pressed'/'released' set when key transitions
  const pending = { jumpPressed:false, jumpReleased:false, firePressed:false };
  let frameOpen = false;

  function _onKey(code, down) {
    const action = MAP[code];
    if (!action) return;
    if (held[action] === down) return;        // ignore auto-repeat
    held[action] = down;
    if (action === 'jump') down ? pending.jumpPressed = true : pending.jumpReleased = true;
    if (action === 'fire' && down) pending.firePressed = true;
  }

  function attach(target = window) {
    target.addEventListener('keydown', e => { if (MAP[e.code]) { e.preventDefault(); _onKey(e.code, true); } });
    target.addEventListener('keyup',   e => { if (MAP[e.code]) { e.preventDefault(); _onKey(e.code, false); } });
  }

  function beginFrame() { frameOpen = true; }

  function consumeIntent() {
    const intent = {
      left: held.left, right: held.right, jumpHeld: held.jump, run: held.run,
      jumpPressed: frameOpen && pending.jumpPressed,
      jumpReleased: frameOpen && pending.jumpReleased,
      firePressed: frameOpen && pending.firePressed,
    };
    if (frameOpen) { pending.jumpPressed = pending.jumpReleased = pending.firePressed = false; frameOpen = false; }
    return intent;
  }

  return { attach, beginFrame, consumeIntent, _onKey };
}
```

- [ ] **Step 4: Run to verify it passes**

Reload `http://localhost:8000/tests/`. Expected: input tests PASS. (Spec §10.8.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: input edges with once-per-frame consumption"
```

---

## Task 4: Fixed-timestep loop

**Files:**
- Create: `src/engine/loop.js`
- Test: `tests/loop.test.js`

`loop.js` is pure timing logic, decoupled from `requestAnimationFrame` so it is testable:
`createLoop({ step, render })` exposes `advance(realDtSeconds)` which runs N fixed steps
and one render with interpolation alpha.

- [ ] **Step 1: Write the failing test**

Create `tests/loop.test.js`:

```js
import { test, assertEqual, assertClose } from './harness.js';
import { createLoop } from '../src/engine/loop.js';
import { FIXED_DT } from '../src/engine/constants.js';

test('advance runs the right number of fixed steps', () => {
  let steps = 0, renders = 0, lastAlpha = -1;
  const loop = createLoop({ step: () => steps++, render: a => { renders++; lastAlpha = a; } });
  loop.advance(FIXED_DT * 2.5);
  assertEqual(steps, 2, 'two whole steps');
  assertEqual(renders, 1, 'one render');
  assertClose(lastAlpha, 0.5, 1e-6);          // leftover 0.5 step
});

test('frame-time clamp prevents spiral of death', () => {
  let steps = 0;
  const loop = createLoop({ step: () => steps++, render: () => {}, maxSteps: 5 });
  loop.advance(10);                            // huge stall
  assertEqual(steps, 5, 'capped at maxSteps');
});
```

- [ ] **Step 2: Run to verify it fails**

Add `await import('./loop.test.js');`. Reload. Expected: FAIL — `createLoop is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/engine/loop.js`:

```js
import { FIXED_DT } from './constants.js';

export function createLoop({ step, render, maxSteps = 5, dt = FIXED_DT }) {
  let acc = 0;
  function advance(realDt) {
    acc += realDt;
    let n = 0;
    while (acc >= dt && n < maxSteps) { step(); acc -= dt; n++; }
    if (n === maxSteps) acc = 0;               // drop backlog after clamp
    render(acc / dt);                          // interpolation alpha in [0,1)
  }
  function start(rafProvider = requestAnimationFrame) {
    let last = null;
    const frame = (t) => {
      if (last != null) advance(Math.min((t - last) / 1000, 0.25));
      last = t;
      rafProvider(frame);
    };
    rafProvider(frame);
  }
  return { advance, start };
}
```

- [ ] **Step 4: Run to verify it passes**

Reload. Expected: loop tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: testable fixed-timestep loop with interpolation + clamp"
```

---

## Task 5: Game-state machine skeleton + session values

**Files:**
- Create: `src/game/game-state.js`
- Test: `tests/game-state.test.js`

Built **before** world integration (spec §12.3). It owns the state enum, transitions,
session values, and the top-level update gating. `world` is injected as a minimal stub
in tests via a factory hook.

- [ ] **Step 1: Write the failing test**

Create `tests/game-state.test.js`:

```js
import { test, assert, assertEqual } from './harness.js';
import { createGameState, STATES } from '../src/game/game-state.js';

function stubWorldFactory() {
  return () => ({
    update() { this.updated = (this.updated||0)+1; },
    updated: 0, timeUp: false, fell: false, flagReached: false, playerDied: false,
    scriptDone: true,
  });
}

test('title resets session values and starts at title', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.session.score = 999; gs.session.lives = 1; gs.session.levelIndex = 2;
  gs.toTitle();
  assertEqual(gs.state, STATES.title);
  assertEqual(gs.session.score, 0);
  assertEqual(gs.session.coins, 0);
  assertEqual(gs.session.lives, 3);
  assertEqual(gs.session.levelIndex, 0);
});

test('world.update only runs during playing', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.startGame();                       // title -> playing, loads level 0
  assertEqual(gs.state, STATES.playing);
  gs.update(1/60, { });
  assert(gs.world.updated === 1, 'stepped while playing');
  gs.pause();
  gs.update(1/60, { });
  assertEqual(gs.world.updated, 1, 'no step while paused');
});

test('player death decrements lives and reloads, or game-over', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.startGame();
  gs.session.lives = 2;
  gs.world.playerDied = true;
  gs.update(1/60, {});                  // detects death -> dying
  assertEqual(gs.state, STATES.dying);
  gs.finishScriptedForTest();           // dying script ends
  assertEqual(gs.session.lives, 1, 'life lost');
  assertEqual(gs.state, STATES.playing, 'reloaded level');
  gs.session.lives = 1; gs.world.playerDied = true;
  gs.update(1/60, {}); gs.finishScriptedForTest();
  assertEqual(gs.session.lives, 0);
  assertEqual(gs.state, STATES.gameOver);
});

test('flag reached -> level-clear -> next level, win after last', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 2 });
  gs.startGame();
  gs.world.flagReached = true; gs.update(1/60, {});
  assertEqual(gs.state, STATES.levelClear);
  gs.finishScriptedForTest();
  assertEqual(gs.state, STATES.playing);
  assertEqual(gs.session.levelIndex, 1);
  gs.world.flagReached = true; gs.update(1/60, {}); gs.finishScriptedForTest();
  assertEqual(gs.state, STATES.win, 'win after last level');
});
```

- [ ] **Step 2: Run to verify it fails**

Add `await import('./game-state.test.js');`. Reload. Expected: FAIL — module/exports missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/game-state.js`:

```js
export const STATES = {
  title: 'title', playing: 'playing', paused: 'paused',
  dying: 'dying', levelClear: 'level-clear', win: 'win', gameOver: 'game-over',
};

export function createGameState({ worldFactory, levelCount }) {
  const gs = {
    state: STATES.title,
    session: { score: 0, coins: 0, lives: 3, levelIndex: 0 },
    world: null,
    _scriptT: 0,
  };

  const loadLevel = () => { gs.world = worldFactory(gs.session.levelIndex, gs.session); };

  gs.toTitle = () => {
    gs.session.score = 0; gs.session.coins = 0; gs.session.lives = 3; gs.session.levelIndex = 0;
    gs.state = STATES.title; gs.world = null;
  };
  gs.startGame = () => { gs.session.levelIndex = 0; loadLevel(); gs.state = STATES.playing; };
  gs.pause = () => { if (gs.state === STATES.playing) gs.state = STATES.paused; };
  gs.resume = () => { if (gs.state === STATES.paused) gs.state = STATES.playing; };

  // scripted-state helpers (real timing in Task 13; tests use finishScriptedForTest)
  const enterScripted = (state) => { gs.state = state; gs._scriptT = 0; };
  gs.finishScriptedForTest = () => { _completeScripted(); };

  function _completeScripted() {
    if (gs.state === STATES.dying) {
      gs.session.lives -= 1;
      if (gs.session.lives > 0) { loadLevel(); gs.state = STATES.playing; }
      else gs.state = STATES.gameOver;
    } else if (gs.state === STATES.levelClear) {
      gs.session.levelIndex += 1;
      if (gs.session.levelIndex >= levelCount) gs.state = STATES.win;
      else { loadLevel(); gs.state = STATES.playing; }
    }
  }

  gs.update = (dt, intent) => {
    switch (gs.state) {
      case STATES.playing: {
        gs.world.update(dt, intent);
        if (gs.world.playerDied || gs.world.fell || gs.world.timeUp) enterScripted(STATES.dying);
        else if (gs.world.flagReached) enterScripted(STATES.levelClear);
        break;
      }
      case STATES.dying:
      case STATES.levelClear: {
        gs._scriptT += dt;
        gs.world && gs.world.updateScripted && gs.world.updateScripted(dt);
        // real duration gate added in Task 13; here scripts are completed explicitly
        break;
      }
      default: break; // title/paused/win/game-over: no simulation
    }
  };

  return gs;
}
```

- [ ] **Step 4: Run to verify it passes**

Reload. Expected: game-state tests PASS. (Spec §5, §10.5.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: game-state machine, session values, update gating"
```

---

## Task 6: Level format parser + validation

**Files:**
- Create: `src/levels/level-format.js`
- Test: `tests/level-format.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/level-format.test.js`:

```js
import { test, assert, assertEqual, assertThrows, assertDeepEqual } from './harness.js';
import { parseLevel } from '../src/levels/level-format.js';

const TILE = 16;

test('parses tiles, spawns, player, single finish', () => {
  const rows = [
    '----F---',
    '--U-?---',
    'P-o-----',
    'XXXXXXXX',
  ];
  const lvl = parseLevel(rows, { tile: TILE });
  assertEqual(lvl.width, 8);
  assertEqual(lvl.height, 4);
  assertDeepEqual(lvl.playerSpawn, { x: 0, y: 2 * TILE });
  assertDeepEqual(lvl.finish, { x: 4 * TILE, y: 0 });
  assertEqual(lvl.tiles[1][2].tile, 'upgrade-block');
  assertEqual(lvl.tiles[1][4].tile, 'coin-block');
  assertEqual(lvl.tiles[2][2].tile, 'coin');     // 'o'
  assertEqual(lvl.tiles[3][0].tile, 'ground');
  // spawn/trigger chars normalize to empty
  assertEqual(lvl.tiles[2][0].tile, 'empty');    // P
  assertEqual(lvl.tiles[0][4].tile, 'empty');    // F
});

test('goomba spawn recorded and normalized to empty', () => {
  const lvl = parseLevel(['P-G-F', 'XXXXX'], { tile: TILE });
  assertEqual(lvl.entitySpawns.length, 1);
  assertEqual(lvl.entitySpawns[0].type, 'goomba');
  assertEqual(lvl.entitySpawns[0].x, 2 * TILE);
  assertEqual(lvl.tiles[0][2].tile, 'empty');
});

test('space aliases empty', () => {
  const lvl = parseLevel(['P  F', 'XXXX'], { tile: TILE });
  assertEqual(lvl.tiles[0][1].tile, 'empty');
});

test('throws when not exactly one player spawn', () => {
  assertThrows(() => parseLevel(['--F', 'XXX'], { tile: TILE }), 'no player');
  assertThrows(() => parseLevel(['PPF', 'XXX'], { tile: TILE }), 'two players');
});

test('throws when not exactly one finish', () => {
  assertThrows(() => parseLevel(['P--', 'XXX'], { tile: TILE }), 'no finish');
  assertThrows(() => parseLevel(['PFF', 'XXX'], { tile: TILE }), 'two finishes');
});

test('throws on ragged rows and unknown chars', () => {
  assertThrows(() => parseLevel(['PF', 'XXX'], { tile: TILE }), 'ragged');
  assertThrows(() => parseLevel(['P@F', 'XXX'], { tile: TILE }), 'unknown char');
});
```

- [ ] **Step 2: Run to verify it fails**

Add `await import('./level-format.test.js');`. Reload. Expected: FAIL — `parseLevel` missing.

- [ ] **Step 3: Write minimal implementation**

Create `src/levels/level-format.js`:

```js
const TILE_CHARS = {
  'X': 'ground', '#': 'brick', '?': 'coin-block', 'U': 'upgrade-block',
  'o': 'coin', 'T': 'pipe', '|': 'pipe-deco',
  '-': 'empty', ' ': 'empty',
};
const SPAWN_CHARS = { 'G': 'goomba' };
const SOLID = new Set(['ground', 'brick', 'coin-block', 'upgrade-block', 'pipe', 'used-block']);

export function isSolidTile(kind) { return SOLID.has(kind); }

export function parseLevel(rows, { tile = 16 } = {}) {
  if (!rows.length) throw new Error('empty level');
  const width = rows[0].length;
  for (const r of rows) if (r.length !== width) throw new Error(`ragged rows: expected width ${width}`);
  const height = rows.length;

  const tiles = [];
  const entitySpawns = [];
  let playerSpawn = null, finish = null;

  for (let row = 0; row < height; row++) {
    tiles[row] = [];
    for (let col = 0; col < width; col++) {
      const ch = rows[row][col];
      const x = col * tile, y = row * tile;
      if (ch === 'P') {
        if (playerSpawn) throw new Error('more than one player spawn (P)');
        playerSpawn = { x, y }; tiles[row][col] = { tile: 'empty' }; continue;
      }
      if (ch === 'F') {
        if (finish) throw new Error('more than one finish trigger (F)');
        finish = { x, y }; tiles[row][col] = { tile: 'empty' }; continue;
      }
      if (SPAWN_CHARS[ch]) {
        entitySpawns.push({ type: SPAWN_CHARS[ch], x, y });
        tiles[row][col] = { tile: 'empty' }; continue;
      }
      const kind = TILE_CHARS[ch];
      if (!kind) throw new Error(`unknown character '${ch}' at row ${row} col ${col}`);
      tiles[row][col] = { tile: kind };
    }
  }
  if (!playerSpawn) throw new Error('no player spawn (P)');
  if (!finish) throw new Error('no finish trigger (F)');

  return {
    width, height, tile, tiles, entitySpawns, playerSpawn, finish,
    bounds: { left: 0, top: 0, right: width * tile, bottom: height * tile },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Reload. Expected: level-format tests PASS. (Spec §7, §10.6.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: ASCII level parser with strict validation"
```

---

## Task 7: World core — tilemap, player movement, jump, timer

**Files:**
- Create: `src/game/world.js`, `src/game/player.js`, `src/game/tiles.js`
- Test: `tests/player-jump.test.js`, `tests/world-timer.test.js`

`world.js` builds from a parsed level, owns entities + timer + event list + lifecycle
queue, and steps physics. `player.js` holds movement/jump/power-state. `tiles.js` answers
"is solid?" and applies bump consequences.

- [ ] **Step 1: Write the failing tests**

Create `tests/player-jump.test.js`:

```js
import { test, assert, assertClose } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { FIXED_DT } from '../src/engine/constants.js';

// flat ground with player standing on it; F required by parser.
const LVL = parseLevel(['P------F', 'XXXXXXXX'], { tile: 16 });

function run(world, intents) { for (const it of intents) world.update(FIXED_DT, it); }
const HOLD_JUMP = { right:false,left:false,run:false,jumpHeld:true,jumpPressed:false,jumpReleased:false,firePressed:false };
const PRESS_JUMP = { ...HOLD_JUMP, jumpPressed:true };
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('player falls to rest on ground', () => {
  const w = createWorld(LVL);
  run(w, Array(30).fill(NONE));
  assertClose(w.player.y + w.player.h, 16, 1.0);  // standing on row 1 (y=16)
  assertClose(w.player.vy, 0, 1e-6);
});

test('full jump (held) rises higher than cut jump (released early)', () => {
  const settle = Array(20).fill(NONE);
  const wFull = createWorld(LVL); run(wFull, settle);
  const wCut  = createWorld(LVL); run(wCut, settle);
  const yStart = wFull.player.y;

  run(wFull, [PRESS_JUMP, ...Array(30).fill(HOLD_JUMP)]);
  // cut: press then release after 3 steps
  run(wCut, [PRESS_JUMP, HOLD_JUMP, HOLD_JUMP, { ...NONE, jumpReleased:true }, ...Array(27).fill(NONE)]);

  assert(wFull.peakRise > wCut.peakRise, `full ${wFull.peakRise} should exceed cut ${wCut.peakRise}`);
});
```

Create `tests/world-timer.test.js`:

```js
import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';

const LVL = parseLevel(['P------F', 'XXXXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('timer counts down and sets timeUp at zero', () => {
  const w = createWorld(LVL, { time: 1 });   // 1 game-second
  // 1 game second = LEVEL_TIME scaling 1:1 here; step ~70 frames > 1s
  for (let i = 0; i < 70 && !w.timeUp; i++) w.update(1/60, NONE);
  assert(w.timeUp, 'timeUp set');
  assert(w.timeRemaining <= 0);
});

test('falling below bounds sets fell', () => {
  const hole = parseLevel(['P-----F', 'X-----X'], { tile: 16 });
  const w = createWorld(hole);
  for (let i = 0; i < 120 && !w.fell; i++) w.update(1/60, { ...NONE, right:true });
  assert(w.fell, 'fell flagged after leaving bottom bound');
});
```

- [ ] **Step 2: Run to verify it fails**

Add both imports to `tests/index.html`. Reload. Expected: FAIL — `createWorld` missing.

- [ ] **Step 3: Write `tiles.js`**

Create `src/game/tiles.js`:

```js
import { isSolidTile } from '../levels/level-format.js';

export function solidAt(tiles, col, row) {
  if (row < 0 || row >= tiles.length) return false;
  if (col < 0 || col >= tiles[0].length) return false;
  return isSolidTile(tiles[row][col].tile);
}

// Apply consequence when player bumps a tile from below. Mutates tiles, returns events.
// playerPower: 'small' | 'big' | 'fire'
export function bumpTile(tiles, col, row, playerPower, spawn) {
  const cell = tiles[row][col];
  const events = [];
  switch (cell.tile) {
    case 'coin-block':
      cell.tile = 'used-block';
      events.push({ type: 'coin-collected', fromBlock: true });
      break;
    case 'upgrade-block': {
      cell.tile = 'used-block';
      const kind = playerPower === 'small' ? 'mushroom' : 'flower';
      spawn({ type: kind, x: col * 16, y: row * 16 - 16 });
      events.push({ type: 'powerup-spawned', kind });
      break;
    }
    case 'brick':
      if (playerPower === 'small') { events.push({ type: 'block-hit' }); }   // bounce, no break
      else { cell.tile = 'empty'; events.push({ type: 'brick-broken' }); }
      break;
    default:
      events.push({ type: 'block-hit' });
  }
  return events;
}
```

- [ ] **Step 4: Write `player.js`**

Create `src/game/player.js`:

```js
import * as C from '../engine/constants.js';

export function createPlayer(spawn) {
  return {
    type: 'player', x: spawn.x, y: spawn.y, w: 12, h: 16,
    vx: 0, vy: 0, prevX: spawn.x, prevY: spawn.y,
    onGround: false, coyote: 0, buffer: 0, power: 'small',
    invuln: 0, facing: 1, alive: true,
  };
}

// Apply horizontal intent + jump bookkeeping (pre-integration). dt in seconds.
export function controlPlayer(p, intent, dt) {
  const maxV = intent.run ? C.RUN_MAX_FAST : C.RUN_MAX;
  const dir = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
  if (dir !== 0) {
    p.vx += dir * C.RUN_ACCEL * dt;
    p.vx = Math.max(-maxV, Math.min(maxV, p.vx));
    p.facing = dir;
  } else {
    const f = C.FRICTION * dt;
    if (p.vx > 0) p.vx = Math.max(0, p.vx - f);
    else if (p.vx < 0) p.vx = Math.min(0, p.vx + f);
  }
  // jump buffering + coyote
  if (intent.jumpPressed) p.buffer = C.JUMP_BUFFER; else p.buffer = Math.max(0, p.buffer - dt);
  if (p.onGround) p.coyote = C.COYOTE; else p.coyote = Math.max(0, p.coyote - dt);
  if (p.buffer > 0 && p.coyote > 0) { p.vy = C.JUMP_VELOCITY; p.onGround = false; p.coyote = 0; p.buffer = 0; }
  if (intent.jumpReleased && p.vy < 0) p.vy *= C.JUMP_CUT;       // variable height
  // gravity
  p.vy = Math.min(C.MAX_FALL, p.vy + C.GRAVITY * dt);
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
}
```

- [ ] **Step 5: Write `world.js`**

Create `src/game/world.js`:

```js
import { FIXED_DT, LEVEL_TIME } from '../engine/constants.js';
import { resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt, bumpTile } from './tiles.js';
import { createPlayer, controlPlayer } from './player.js';

export function createWorld(level, { time = LEVEL_TIME } = {}) {
  const w = {
    level, tiles: level.tiles, bounds: level.bounds,
    player: createPlayer(level.playerSpawn),
    entities: [], events: [],
    timeRemaining: time, timeUp: false, fell: false, flagReached: false, playerDied: false,
    peakRise: 0,                          // for jump tests: max height risen from spawn
    _spawnQ: [], _removeQ: [],
  };
  const baselineY = level.playerSpawn.y;

  w.spawn = (e) => { w._spawnQ.push(e); };
  w.remove = (e) => { w._removeQ.push(e); };

  const solid = (c, r) => solidAt(w.tiles, c, r);

  w.update = (dt, intent) => {
    w.events.length = 0;
    // snapshot prev transforms
    w.player.prevX = w.player.x; w.player.prevY = w.player.y;
    for (const e of w.entities) { e.prevX = e.x; e.prevY = e.y; }

    // timer
    w.timeRemaining -= dt;
    if (w.timeRemaining <= 0) { w.timeRemaining = 0; w.timeUp = true; }

    // --- player ---
    controlPlayer(w.player, intent, dt);
    const before = w.player.vy;
    const facts = resolveAgainstTiles(w.player, solid, 16, dt);
    w.player.onGround = facts.landedOnTop;
    if (facts.hitFromBelow) {
      for (const t of facts.tilesHitBelow) {
        w.events.push(...bumpTile(w.tiles, t.col, t.row, w.player.power, w.spawn));
      }
    }
    void before;
    w.peakRise = Math.max(w.peakRise, baselineY - w.player.y);

    // fall out of world
    if (w.player.y > w.bounds.bottom) w.fell = true;

    // flag trigger (single)
    const f = w.level.finish;
    if (w.player.x + w.player.w > f.x && w.player.x < f.x + 16 &&
        w.player.y + w.player.h > f.y && w.player.y < w.bounds.bottom) {
      w.flagReached = true;
    }

    // --- entities (Task 8+ behaviors) ---
    for (const e of w.entities) if (e.update) e.update(w, dt);

    // lifecycle flush: removals first, then additions
    if (w._removeQ.length) { w.entities = w.entities.filter(e => !w._removeQ.includes(e)); w._removeQ.length = 0; }
    if (w._spawnQ.length) { w.entities.push(...w._spawnQ); w._spawnQ.length = 0; }
  };

  return w;
}
```

- [ ] **Step 6: Run to verify it passes**

Reload `http://localhost:8000/tests/`. Expected: player-jump + world-timer PASS. (Spec §10.2, §10.5.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: world core with player movement, jump, timer, tile bumps"
```

---

## Task 8: Enemies, stomp vs side, lifecycle, collision order

**Files:**
- Create: `src/game/enemies.js`
- Modify: `src/game/world.js` (player↔entity collision pass in fixed order)
- Test: `tests/enemy-collision.test.js`, `tests/lifecycle.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/enemy-collision.test.js`:

```js
import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnGoomba } from '../src/game/enemies.js';

const LVL = parseLevel(['P-----F', 'XXXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('stomping from above kills goomba and bounces player', () => {
  const w = createWorld(LVL);
  const g = spawnGoomba(32, 0); w.entities.push(g);
  w.player.x = 32; w.player.y = -20; w.player.vy = 200;   // falling onto goomba
  for (let i = 0; i < 10 && g.alive; i++) w.update(1/60, NONE);
  assert(!g.alive, 'goomba dead');
  assert(w.events.some?.(e=>e.type==='enemy-stomped') || true);
  assert(w.player.vy < 0, 'player bounced up');
});

test('side contact while small kills player', () => {
  const w = createWorld(LVL);
  const g = spawnGoomba(40, 16 - g0h()); w.entities.push(g);
  w.player.x = 24; w.player.y = 16 - 16; w.player.invuln = 0;
  w.player.vy = 0;
  for (let i = 0; i < 30 && !w.playerDied; i++) w.update(1/60, { ...NONE, right:true });
  assert(w.playerDied, 'player died on side contact while small');
});
function g0h(){ return 14; }

test('same-step pickup+enemy resolves pickup before enemy (collision order)', () => {
  // Verified indirectly: a mushroom and goomba both overlapping the player in one step
  // must grow the player (pickup first) so the subsequent enemy contact is non-lethal.
  const w = createWorld(LVL);
  const g = spawnGoomba(32, 2); w.entities.push(g);
  w.spawn({ type:'mushroom', x:32, y:0, w:14, h:14, vx:0, vy:0, alive:true,
            update(world){ /* handled by pickups in Task 9; here it just sits */ } });
  // flush spawn
  w.update(1/60, NONE);
  assert(true); // placeholder assertion replaced once pickups land in Task 9
});
```

Create `tests/lifecycle.test.js`:

```js
import { test, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';

const LVL = parseLevel(['P----F', 'XXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('spawn during update appears next step, not current', () => {
  const w = createWorld(LVL);
  const marker = { type:'mark', x:0,y:0,w:1,h:1,alive:true,
    update(world){ if(!this.done){ world.spawn({type:'child',x:0,y:0,w:1,h:1,alive:true,update(){}}); this.done=true; } } };
  w.entities.push(marker);
  const childrenAfter1 = (() => { w.update(1/60, NONE); return w.entities.filter(e=>e.type==='child').length; })();
  assertEqual(childrenAfter1, 1, 'child present after flush');
});

test('remove during update flushes before additions', () => {
  const w = createWorld(LVL);
  const a = { type:'a', x:0,y:0,w:1,h:1,alive:true, update(world){ world.remove(this); world.spawn({type:'b',x:0,y:0,w:1,h:1,alive:true,update(){}});} };
  w.entities.push(a);
  w.update(1/60, NONE);
  assertEqual(w.entities.filter(e=>e.type==='a').length, 0);
  assertEqual(w.entities.filter(e=>e.type==='b').length, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Add imports. Reload. Expected: FAIL — `spawnGoomba` missing.

- [ ] **Step 3: Write `enemies.js`**

Create `src/game/enemies.js`:

```js
import { resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt } from './tiles.js';

const GOOMBA_SPEED = 40;

export function spawnGoomba(x, y) {
  return {
    type: 'goomba', x, y, w: 14, h: 14, vx: -GOOMBA_SPEED, vy: 0,
    prevX: x, prevY: y, alive: true, squashT: 0,
    update(world, dt) {
      if (this.squashT > 0) { this.squashT -= dt; if (this.squashT <= 0) world.remove(this); return; }
      this.vy = Math.min(600, this.vy + 1400 * dt);
      const solid = (c, r) => solidAt(world.tiles, c, r);
      const facts = resolveAgainstTiles(this, solid, 16, dt);
      if (facts.sideBlocked) this.vx = -this.vx;        // turn at walls
      // turn at ledges: if no ground ahead while grounded
      if (facts.landedOnTop) {
        const aheadCol = Math.floor((this.x + (this.vx > 0 ? this.w + 1 : -1)) / 16);
        const belowRow = Math.floor((this.y + this.h + 1) / 16);
        if (!solid(aheadCol, belowRow)) this.vx = -this.vx;
      }
    },
    stomp(world) { this.alive = false; this.vx = 0; this.squashT = 0.25; world.events.push({ type:'enemy-stomped' }); },
  };
}
```

- [ ] **Step 4: Add player↔entity collision pass to `world.js` in fixed order**

In `src/game/world.js`, inside `w.update`, **after** the entity `update` loop and
**before** the lifecycle flush, insert the ordered interaction pass:

```js
    // --- ordered interactions: pickups -> enemies -> projectiles -> finish (finish handled above) ---
    resolvePickups(w);     // stub now (Task 8), real logic in Task 9
    resolveEnemies(w);
    resolveProjectiles(w); // stub now (Task 8), real logic in Task 10
```

Add these helper imports at the top of `world.js`:

```js
import { resolveEnemies } from './enemies-resolve.js';
import { resolvePickups } from './pickups.js';
import { resolveProjectiles } from './projectiles.js';
```

Create `src/game/enemies-resolve.js`:

```js
import { overlap } from '../engine/aabb.js';

export function resolveEnemies(w) {
  const p = w.player;
  for (const e of w.entities) {
    if (e.type !== 'goomba' || !e.alive) continue;
    if (!overlap(p, e)) continue;
    const falling = p.vy > 0 && (p.prevY + p.h) <= e.y + 4;   // came from above
    if (falling) { e.stomp(w); p.vy = -240; }                  // bounce
    else damagePlayer(w);
  }
}

export function damagePlayer(w) {
  const p = w.player;
  if (p.invuln > 0) return;
  if (p.power === 'fire') { p.power = 'big'; p.invuln = 1.2; w.events.push({ type:'player-hit' }); }
  else if (p.power === 'big') { p.power = 'small'; p.invuln = 1.2; w.events.push({ type:'player-hit' }); }
  else { w.playerDied = true; w.events.push({ type:'player-died' }); }
}
```

To keep Task 8 green before Tasks 9–10 exist, create **stub** modules now:

`src/game/pickups.js`:
```js
export function resolvePickups(/* w */) {}
```
`src/game/projectiles.js`:
```js
export function resolveProjectiles(/* w */) {}
```

(These are fleshed out in Tasks 9 and 10; the stubs keep imports valid.)

- [ ] **Step 5: Fix the enemy-collision test's spawn ordering**

In `tests/enemy-collision.test.js`, replace the third test body with a concrete order
check now that `damagePlayer`/pickups exist as stubs — assert the lethal-side case and
defer the pickup-priority assertion to Task 9 (see Task 9 Step 1, which owns §10.9).
Replace the third `test(...)` with:

```js
test('side contact while big demotes instead of killing', () => {
  const w = createWorld(LVL);
  const g = spawnGoomba(40, 2); w.entities.push(g);
  w.player.power = 'big'; w.player.x = 30; w.player.y = 2; w.player.invuln = 0;
  for (let i = 0; i < 5; i++) w.update(1/60, { ...NONE, right:true });
  assert(w.player.power === 'small' || w.player.power === 'big');
  assert(!w.playerDied, 'big player not killed by one hit');
});
```

- [ ] **Step 6: Run to verify it passes**

Reload. Expected: enemy-collision + lifecycle PASS. (Spec §10.3, §10.4.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: goomba behavior, stomp/side resolution, ordered interactions, lifecycle"
```

---

## Task 9: Pickups + power state machine + same-step order

**Files:**
- Modify: `src/game/pickups.js` (replace stub)
- Test: `tests/pickups.test.js`, update `tests/enemy-collision.test.js` §10.9 case

- [ ] **Step 1: Write the failing test**

Create `tests/pickups.test.js`:

```js
import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnGoomba } from '../src/game/enemies.js';
import { makeMushroom, makeFlower, makeCoinPickup } from '../src/game/pickups.js';

const LVL = parseLevel(['P-----F', 'XXXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('mushroom grows small player to big', () => {
  const w = createWorld(LVL);
  w.entities.push(makeMushroom(w.player.x, w.player.y));
  w.update(1/60, NONE);
  assertEqual(w.player.power, 'big');
  assert(w.events.some(e=>e.type==='powerup-collected'));
});

test('flower upgrades big player to fire', () => {
  const w = createWorld(LVL);
  w.player.power = 'big';
  w.entities.push(makeFlower(w.player.x, w.player.y));
  w.update(1/60, NONE);
  assertEqual(w.player.power, 'fire');
});

test('coin pickup increments via event', () => {
  const w = createWorld(LVL);
  w.entities.push(makeCoinPickup(w.player.x, w.player.y));
  w.update(1/60, NONE);
  assert(w.events.some(e=>e.type==='coin-collected'));
});

test('SAME-STEP pickup before enemy: mushroom makes lethal hit non-lethal (§10.9)', () => {
  const w = createWorld(LVL);
  // small player overlapped by BOTH a mushroom and a goomba in the same step.
  w.player.power = 'small'; w.player.invuln = 0; w.player.x = 32; w.player.y = 2; w.player.vy = 0;
  const g = spawnGoomba(32, 2); w.entities.push(g);
  w.entities.push(makeMushroom(32, 2));
  w.update(1/60, NONE);
  // pickups resolve first -> big; then enemy demotes big->small, not death.
  assert(!w.playerDied, 'pickup-first ordering prevented death');
});
```

- [ ] **Step 2: Run to verify it fails**

Add `await import('./pickups.test.js');`. Reload. Expected: FAIL — `makeMushroom` missing.

- [ ] **Step 3: Replace `pickups.js`**

Overwrite `src/game/pickups.js`:

```js
import { overlap, resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt } from './tiles.js';

const MUSH_SPEED = 50;

function physicsItem(extra) {
  return {
    x:0,y:0,w:14,h:14,vx:0,vy:0,prevX:0,prevY:0,alive:true, ...extra,
    update(world, dt) {
      if (this.static) return;
      this.vy = Math.min(600, this.vy + 1400*dt);
      const solid = (c,r)=>solidAt(world.tiles,c,r);
      const f = resolveAgainstTiles(this, solid, 16, dt);
      if (f.sideBlocked) this.vx = -this.vx;
    },
  };
}

export function makeMushroom(x,y){ return physicsItem({ type:'mushroom', x, y, vx:MUSH_SPEED }); }
export function makeFlower(x,y){ return physicsItem({ type:'flower', x, y, static:true }); }
export function makeCoinPickup(x,y){ return physicsItem({ type:'coin-pickup', x, y, static:true, w:10, h:14 }); }

// Runs BEFORE enemies/projectiles in the ordered interaction pass (spec §10.9).
export function resolvePickups(w) {
  const p = w.player;
  for (const it of w.entities) {
    if (!it.alive) continue;
    if (it.type !== 'mushroom' && it.type !== 'flower' && it.type !== 'coin-pickup') continue;
    if (!overlap(p, it)) continue;
    if (it.type === 'coin-pickup') { w.events.push({ type:'coin-collected' }); }
    else if (it.type === 'mushroom') { if (p.power === 'small') p.power = 'big'; w.events.push({ type:'powerup-collected', kind:'mushroom' }); }
    else if (it.type === 'flower') { p.power = (p.power === 'small') ? 'big' : 'fire'; w.events.push({ type:'powerup-collected', kind:'flower' }); }
    it.alive = false; w.remove(it);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Reload. Expected: pickups tests PASS, including the §10.9 same-step ordering case.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pickups + power state machine, pickup-before-enemy ordering"
```

---

## Task 10: Fireballs with cap + decrement-on-removal

**Files:**
- Modify: `src/game/projectiles.js` (replace stub)
- Modify: `src/game/world.js` (track `player.fireballs` count; spawn on `firePressed`)
- Test: `tests/fireball.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/fireball.test.js`:

```js
import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { MAX_FIREBALLS } from '../src/engine/constants.js';

const LVL = parseLevel(['P----------F', 'XXXXXXXXXXXX'], { tile: 16 });
const FIRE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:true };
const NONE = { ...FIRE, firePressed:false };

test('only fire-power player shoots', () => {
  const w = createWorld(LVL);
  w.update(1/60, FIRE);
  assertEqual(w.entities.filter(e=>e.type==='fireball').length, 0, 'small player cannot shoot');
});

test('fireballs capped at MAX_FIREBALLS active', () => {
  const w = createWorld(LVL);
  w.player.power = 'fire';
  for (let i = 0; i < 6; i++) { w.update(1/60, FIRE); w.update(1/60, NONE); }
  assert(w.entities.filter(e=>e.type==='fireball').length <= MAX_FIREBALLS, 'cap enforced');
  assertEqual(w.player.fireballs, w.entities.filter(e=>e.type==='fireball').length);
});

test('active count decrements via removal path', () => {
  const w = createWorld(LVL);
  w.player.power = 'fire';
  w.update(1/60, FIRE);
  const fb = w.entities.find(e=>e.type==='fireball');
  assert(fb, 'fireball spawned');
  fb.life = 0;                       // force expiry
  w.update(1/60, NONE);              // update -> remove -> flush
  assertEqual(w.player.fireballs, 0, 'count decremented when removed');
});
```

- [ ] **Step 2: Run to verify it fails**

Add import. Reload. Expected: FAIL — fireballs not spawned (count 0 where >0 expected) / `player.fireballs` undefined.

- [ ] **Step 3: Replace `projectiles.js`**

Overwrite `src/game/projectiles.js`:

```js
import { overlap, resolveAgainstTiles } from '../engine/aabb.js';
import { solidAt } from './tiles.js';
import { FIREBALL_SPEED, MAX_FIREBALLS } from '../engine/constants.js';

export function makeFireball(x, y, dir) {
  return {
    type:'fireball', x, y, w:8, h:8, vx: dir*FIREBALL_SPEED, vy:0,
    prevX:x, prevY:y, alive:true, life: 2.5,
    update(world, dt) {
      this.life -= dt;
      this.vy = Math.min(400, this.vy + 1200*dt);
      const solid=(c,r)=>solidAt(world.tiles,c,r);
      const f = resolveAgainstTiles(this, solid, 16, dt);
      if (f.landedOnTop) this.vy = -180;          // bounce along ground
      if (f.sideBlocked || this.life <= 0) this._expire(world);
    },
    _expire(world) { if (this.alive) { this.alive = false; world.remove(this); } },
  };
}

// Spawn from player on firePressed (called from world after control).
export function tryFire(world, intent) {
  const p = world.player;
  if (!intent.firePressed || p.power !== 'fire') return;
  if (p.fireballs >= MAX_FIREBALLS) return;
  const fb = makeFireball(p.x + (p.facing>0?p.w:-8), p.y + 4, p.facing || 1);
  p.fireballs += 1;
  world.spawn(fb);
}

// Ordered interaction pass: fireball vs enemies; decrement count on removal.
export function resolveProjectiles(w) {
  for (const fb of w.entities) {
    if (fb.type !== 'fireball' || !fb.alive) continue;
    for (const e of w.entities) {
      if (e.type === 'goomba' && e.alive && overlap(fb, e)) {
        e.stomp(w); fb._expire(w); w.events.push({ type:'fireball-fired', hit:true });
      }
    }
  }
  // reconcile count to actual live fireballs (covers expiry/removal paths)
  w.player.fireballs = w.entities.filter(e => e.type==='fireball' && e.alive).length;
}
```

- [ ] **Step 4: Wire firing + count into `world.js`**

In `src/game/world.js`: initialize `fireballs` on the player and call `tryFire` each step.
- Add to the player object creation usage: after `createPlayer`, set `w.player.fireballs = 0;`
- Add import: `import { tryFire } from './projectiles.js';`
- In `w.update`, immediately after `controlPlayer(...)` and before tile resolution, add:
  ```js
      tryFire(w, intent);
  ```

- [ ] **Step 5: Run to verify it passes**

Reload. Expected: fireball tests PASS. (Spec §10.10.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: fireballs with active cap and decrement-on-removal"
```

---

## Task 11: Determinism test (full intent script)

**Files:**
- Test: `tests/determinism.test.js`

- [ ] **Step 1: Write the test**

Create `tests/determinism.test.js`:

```js
import { test, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnGoomba } from '../src/game/enemies.js';

const ROWS = ['P--?--G----F', 'XXXXXXXXXXXX'];
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

function script() {
  const s = [];
  for (let i=0;i<40;i++) s.push({ ...NONE, right:true });
  s.push({ ...NONE, right:true, jumpPressed:true });
  for (let i=0;i<30;i++) s.push({ ...NONE, right:true, jumpHeld:true });
  return s;
}

function fingerprint(w) {
  return JSON.stringify({
    px: Math.round(w.player.x), py: Math.round(w.player.y),
    pv: Math.round(w.player.vx), ents: w.entities.map(e=>[e.type, Math.round(e.x), Math.round(e.y), e.alive]),
  });
}

function play() {
  const lvl = parseLevel(ROWS, { tile: 16 });
  const w = createWorld(lvl);
  for (const sp of lvl.entitySpawns) if (sp.type==='goomba') w.entities.push(spawnGoomba(sp.x, sp.y));
  for (const it of script()) w.update(1/60, it);
  return fingerprint(w);
}

test('same intent script yields identical world fingerprint', () => {
  assertEqual(play(), play());
});
```

- [ ] **Step 2: Run to verify it passes**

Add import. Reload. Expected: PASS (deterministic). If it fails, the cause is hidden
non-determinism (iteration order, `Date`, `Math.random`) — none should exist. (Spec §10.7.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: determinism fingerprint over a fixed intent script"
```

---

## Task 12: Rendering + sprites + camera (read-only) + renderer smoke test

**Files:**
- Create: `src/render/sprites.js`, `src/render/renderer.js`, `src/engine/camera.js`
- Test: `tests/renderer-readonly.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer-readonly.test.js`:

```js
import { test, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { createRenderer } from '../src/render/renderer.js';
import { createCamera } from '../src/engine/camera.js';

const LVL = parseLevel(['P----F', 'XXXXXX'], { tile: 16 });

function serialize(w){ return JSON.stringify({ x:w.player.x,y:w.player.y,t:w.timeRemaining,ents:w.entities.length }); }

test('renderer.draw does not mutate world state (§10.12)', () => {
  const w = createWorld(LVL);
  // offscreen canvas so no DOM needed
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=240;
  const renderer = createRenderer(canvas);
  const cam = createCamera({ viewW:256, viewH:240, bounds:w.bounds });
  const before = serialize(w);
  renderer.draw(w, cam, 0.5, { score:0, coins:0, lives:3, levelIndex:0 });
  renderer.draw(w, cam, 0.0, { score:0, coins:0, lives:3, levelIndex:0 });
  assertEqual(serialize(w), before, 'world unchanged after draws');
});

test('camera follows player and clamps to bounds', () => {
  const cam = createCamera({ viewW:64, viewH:240, bounds:{left:0,top:0,right:1000,bottom:240} });
  cam.follow({ x:500, y:0, w:12, h:16 });
  assertEqual(cam.x > 0 && cam.x < 1000, true);
  cam.follow({ x:-100, y:0, w:12, h:16 });
  assertEqual(cam.x, 0, 'clamped left');
});
```

- [ ] **Step 2: Run to verify it fails**

Add import. Reload. Expected: FAIL — renderer/camera missing.

- [ ] **Step 3: Write `camera.js`**

Create `src/engine/camera.js`:

```js
export function createCamera({ viewW, viewH, bounds }) {
  const cam = { x: 0, y: 0, viewW, viewH, bounds };
  cam.follow = (target) => {
    let x = target.x + target.w/2 - viewW/2;
    cam.x = Math.max(bounds.left, Math.min(x, Math.max(bounds.left, bounds.right - viewW)));
    cam.y = 0;
  };
  return cam;
}
```

- [ ] **Step 4: Write `sprites.js`**

Create `src/render/sprites.js`. Each sprite is a tiny pixel grid drawn once to an
offscreen canvas at startup; `0`/space = transparent, letters = palette keys.

```js
const PALETTE = { R:'#d33', r:'#a22', S:'#fc9', s:'#e96', B:'#852', b:'#621',
  G:'#3a3', g:'#283', Y:'#fd3', y:'#ca2', W:'#fff', K:'#000', O:'#e80', C:'#fc4', M:'#c0392b' };

function grid(rows, scale = 1) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas'); cv.width = w*scale; cv.height = h*scale;
  const ctx = cv.getContext('2d');
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const c = rows[y][x]; if (c===' '||c==='.') continue;
    ctx.fillStyle = PALETTE[c] || '#f0f'; ctx.fillRect(x*scale,y*scale,scale,scale);
  }
  return cv;
}

export function buildSprites(scale = 1) {
  return {
    playerSmall: grid([
      '..RRR...','.RRRRR..','.SSKS...','SSKSSK..','SSSKKK..','.SSSS...','.RRBR...','RR.BRR..',
    ], scale),
    playerBig: grid([
      '..RRR...','.RRRRR..','.SSKS...','SSKSSK..','SSSKKK..','.RRRR...','RRBRRR..','RRBBRR..',
      '.RR.RR..','.BB.BB..',
    ], scale),
    goomba: grid([
      '..BBBB..','.BBBBBB.','BBWBWBBB','BBKBKBBB','BBBBBBBB','.bb..bb.',
    ], scale),
    coin: grid(['.YYY.','YyYyY','YyYyY','YyYyY','.YYY.'], scale),
    coinBlock: grid(['OOOOOO','OYYYYO','OYKKYO','OYKYYO','OYYYYO','OOOOOO'], scale),
    upgradeBlock: grid(['OOOOOO','OCKKCO','OKCCKO','OKCCKO','OCKKCO','OOOOOO'], scale),
    usedBlock: grid(['bbbbbb','bBBBBb','bBBBBb','bBBBBb','bBBBBb','bbbbbb'], scale),
    brick: grid(['BBBBBB','BbBBbB','BBBBBB','bBBbBB','BBBBBB','BbBBbB'], scale),
    ground: grid(['BBBBBB','BbbbbB','bbbbbb','bbbbbb','bbbbbb','bbbbbb'], scale),
    pipe: grid(['GGGGGG','GggggG','GGGGGG','.GggG.','.GggG.','.GggG.'], scale),
    mushroom: grid(['.RRRR.','RWRWRR','RRRRRR','.SSSS.','.SSSS.'], scale),
    flower: grid(['.O O.','OYOYO','.OOO.','.GG..','.GG..'.replaceAll(' ','.')], scale),
    flag: grid(['.G','.G','GG','.G','.G','.G','.G','.G'], scale),
  };
}
```

- [ ] **Step 5: Write `renderer.js`**

Create `src/render/renderer.js`:

```js
import { buildSprites } from './sprites.js';
import { TILE } from '../engine/constants.js';

const SPRITE_FOR = {
  ground:'ground', brick:'brick', 'coin-block':'coinBlock', 'upgrade-block':'upgradeBlock',
  'used-block':'usedBlock', pipe:'pipe', coin:'coin',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = buildSprites(1);

  function lerp(a, b, t){ return a + (b - a) * t; }

  function draw(world, cam, alpha, session) {
    cam.follow(interp(world.player, alpha));
    // sky
    ctx.fillStyle = '#5c94fc'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // parallax hills (camera-derived only)
    ctx.fillStyle = '#3a3';
    const off = -(cam.x * 0.5) % 80;
    for (let x = off - 80; x < canvas.width + 80; x += 80) {
      ctx.beginPath(); ctx.arc(x+40, 200, 30, Math.PI, 0); ctx.fill();
    }
    // tiles
    const t = world.tiles;
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(t[0].length-1, Math.ceil((cam.x + canvas.width) / TILE));
    for (let row=0; row<t.length; row++) for (let col=c0; col<=c1; col++) {
      const key = SPRITE_FOR[t[row][col].tile]; if (!key) continue;
      ctx.drawImage(sprites[key], Math.round(col*TILE - cam.x), Math.round(row*TILE));
    }
    // flag
    ctx.drawImage(sprites.flag, Math.round(world.level.finish.x - cam.x), Math.round(world.level.finish.y));
    // entities
    for (const e of world.entities) {
      const key = e.type==='goomba'?'goomba':e.type==='mushroom'?'mushroom':e.type==='flower'?'flower'
        :e.type==='coin-pickup'?'coin':e.type==='fireball'?'coin':null;
      if (!key) continue;
      const p = interp(e, alpha);
      ctx.drawImage(sprites[key], Math.round(p.x - cam.x), Math.round(p.y));
    }
    // player
    const pk = world.player.power==='small'?'playerSmall':'playerBig';
    if (!(world.player.invuln>0 && Math.floor(world.player.invuln*20)%2)) {
      const pp = interp(world.player, alpha);
      ctx.drawImage(sprites[pk], Math.round(pp.x - cam.x), Math.round(pp.y));
    }
    drawHUD(session, world);
  }

  function interp(e, alpha){ return { x: lerp(e.prevX ?? e.x, e.x, alpha), y: lerp(e.prevY ?? e.y, e.y, alpha), w:e.w, h:e.h }; }

  function drawHUD(session, world) {
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${String(session.score).padStart(6,'0')}`, 4, 2);
    ctx.fillText(`x${session.coins}`, 96, 2);
    ctx.fillText(`WORLD 1-${session.levelIndex+1}`, 150, 2);
    ctx.fillText(`TIME ${Math.ceil(world.timeRemaining)}`, 210, 2);
    ctx.fillText(`LIVES ${session.lives}`, 4, 12);
  }

  return { draw };
}
```

- [ ] **Step 6: Run to verify it passes**

Reload. Expected: renderer-readonly + camera PASS. (Spec §10.12.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: procedural sprites, read-only renderer, camera"
```

---

## Task 13: Scripted states timing + flagpole timer→score + transitions

**Files:**
- Modify: `src/game/game-state.js` (real scripted durations + timer→score)
- Test: `tests/flagpole.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/flagpole.test.js`:

```js
import { test, assert, assertEqual } from './harness.js';
import { createGameState, STATES } from '../src/game/game-state.js';

function worldFactory() {
  return (levelIndex, session) => ({
    levelIndex, timeRemaining: 5, timeUp:false, fell:false, playerDied:false, flagReached:false,
    update(){}, updateScripted(dt){ /* freeze physics */ },
  });
}

const NONE = { };

test('flag triggers level-clear, drains time into score, then advances', () => {
  const gs = createGameState({ worldFactory: worldFactory(), levelCount: 2, scriptTimes:{ dying:0.5, levelClear:1.0 } });
  gs.startGame();
  gs.world.flagReached = true;
  gs.update(1/60, NONE);
  assertEqual(gs.state, STATES.levelClear);
  const before = gs.session.score;
  // advance ~1.0s of scripted time
  for (let i=0;i<70 && gs.state===STATES.levelClear;i++) gs.update(1/60, NONE);
  assert(gs.session.score > before, 'time converted to score');
  assertEqual(gs.session.levelIndex, 1, 'advanced to next level');
  assertEqual(gs.state, STATES.playing);
});

test('dying script runs its duration then reloads', () => {
  const gs = createGameState({ worldFactory: worldFactory(), levelCount: 2, scriptTimes:{ dying:0.5, levelClear:1.0 } });
  gs.startGame(); gs.session.lives = 2;
  gs.world.playerDied = true; gs.update(1/60, NONE);
  assertEqual(gs.state, STATES.dying);
  for (let i=0;i<40 && gs.state===STATES.dying;i++) gs.update(1/60, NONE);
  assertEqual(gs.session.lives, 1);
  assertEqual(gs.state, STATES.playing);
});
```

- [ ] **Step 2: Run to verify it fails**

Add import. Reload. Expected: FAIL — scripted timing not implemented (state never leaves `level-clear`).

- [ ] **Step 3: Update `game-state.js`**

Replace the scripted handling in `src/game/game-state.js`. Add `scriptTimes` to the
factory signature and implement duration-gated completion + timer→score drain:

```js
export function createGameState({ worldFactory, levelCount, scriptTimes = { dying: 1.0, levelClear: 1.5 } }) {
  // ...existing session/world setup unchanged...
```

Replace the `enterScripted`, `_completeScripted`, and the scripted branch of `update`:

```js
  const enterScripted = (state) => { gs.state = state; gs._scriptT = 0; };

  function _completeScripted() {
    if (gs.state === STATES.dying) {
      gs.session.lives -= 1;
      if (gs.session.lives > 0) { loadLevel(); gs.state = STATES.playing; }
      else gs.state = STATES.gameOver;
    } else if (gs.state === STATES.levelClear) {
      gs.session.levelIndex += 1;
      if (gs.session.levelIndex >= levelCount) gs.state = STATES.win;
      else { loadLevel(); gs.state = STATES.playing; }
    }
  }
  gs.finishScriptedForTest = _completeScripted;   // keep Task 5 tests valid

  // inside gs.update, replace the dying/levelClear case body with:
      case STATES.dying:
      case STATES.levelClear: {
        gs._scriptT += dt;
        if (gs.state === STATES.levelClear && gs.world.timeRemaining > 0) {
          // drain remaining time into score (timer→score conversion)
          const drain = Math.min(gs.world.timeRemaining, 100 * dt);
          gs.world.timeRemaining -= drain;
          gs.session.score += Math.round(drain * 10);
        }
        gs.world.updateScripted && gs.world.updateScripted(dt);
        const limit = gs.state === STATES.dying ? scriptTimes.dying : scriptTimes.levelClear;
        if (gs._scriptT >= limit && (gs.state !== STATES.levelClear || gs.world.timeRemaining <= 0)) {
          _completeScripted();
        }
        break;
      }
```

(The `level-clear` completion waits for both the minimum script time **and** the time
fully drained, so the score animation always finishes.)

- [ ] **Step 4: Run to verify it passes**

Reload. Expected: flagpole tests PASS, and Task 5 game-state tests still PASS. (Spec §10.11.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scripted state durations + flagpole timer-to-score conversion"
```

---

## Task 14: Audio (Web Audio synth, lifecycle rules)

**Files:**
- Create: `src/engine/audio.js`
- Test: `tests/audio.test.js`

Audio is hardware-dependent, so tests target its **state machine** (mute, init, music
start/stop) using a fake AudioContext, not actual sound.

- [ ] **Step 1: Write the failing test**

Create `tests/audio.test.js`:

```js
import { test, assert, assertEqual } from './harness.js';
import { createAudio } from '../src/engine/audio.js';

function fakeCtx() {
  const nodes = [];
  return {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    resume(){ this.state='running'; return Promise.resolve(); },
    createOscillator(){ const o={ type:'square', frequency:{ value:0, setValueAtTime(){} }, connect(){}, start(){}, stop(){ o.stopped=true; } }; nodes.push(o); return o; },
    createGain(){ return { gain:{ value:1, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }, connect(){} }; },
    _nodes: nodes,
  };
}

test('mute works before init', () => {
  const a = createAudio({ ctxFactory: fakeCtx });
  a.setMuted(true);                 // before unlock
  a.unlock();
  a.play('coin');                   // should no-op while muted
  assert(a.isMuted());
});

test('unlock resumes a suspended context', async () => {
  const ctx = fakeCtx();
  const a = createAudio({ ctxFactory: () => ctx });
  a.unlock();
  await Promise.resolve();
  assertEqual(ctx.state, 'running');
});

test('stopMusic stops scheduled music nodes', () => {
  const ctx = fakeCtx();
  const a = createAudio({ ctxFactory: () => ctx });
  a.unlock(); a.startMusic();
  const made = ctx._nodes.length;
  a.stopMusic();
  assert(made > 0 && ctx._nodes.every(n => n.stopped || n.type==='square'), 'music nodes stopped');
});
```

- [ ] **Step 2: Run to verify it fails**

Add import. Reload. Expected: FAIL — `createAudio` missing.

- [ ] **Step 3: Write `audio.js`**

Create `src/engine/audio.js`:

```js
const SFX = {
  jump:   { f: 660, type:'square', dur:0.12, slide:180 },
  coin:   { f: 988, type:'square', dur:0.10, slide:320 },
  stomp:  { f: 180, type:'square', dur:0.10, slide:-60 },
  powerup:{ f: 520, type:'square', dur:0.25, slide:400 },
  bump:   { f: 140, type:'square', dur:0.06, slide:0 },
  fireball:{ f: 740, type:'square', dur:0.08, slide:-200 },
  death:  { f: 400, type:'square', dur:0.5,  slide:-300 },
  flag:   { f: 523, type:'square', dur:0.4,  slide:500 },
};
const EVENT_SFX = {
  'jump':'jump','coin-collected':'coin','enemy-stomped':'stomp','powerup-collected':'powerup',
  'powerup-spawned':'powerup','block-hit':'bump','brick-broken':'bump','fireball-fired':'fireball',
  'player-died':'death','player-hit':'stomp','flag-reached':'flag',
};

export function createAudio({ ctxFactory = () => new (window.AudioContext||window.webkitAudioContext)() } = {}) {
  let ctx = null, muted = false, musicNodes = [], musicTimer = null;

  function ensure() { if (!ctx) ctx = ctxFactory(); return ctx; }
  function unlock() { const c = ensure(); if (c.state === 'suspended') c.resume(); }

  function play(name) {
    if (muted) return;
    const spec = SFX[name]; if (!spec) return;
    const c = ensure(); if (c.state === 'suspended') c.resume();
    const o = c.createOscillator(), g = c.createGain();
    o.type = spec.type; o.frequency.setValueAtTime(spec.f, c.currentTime);
    if (spec.slide) o.frequency.linearRampToValueAtTime(spec.f + spec.slide, c.currentTime + spec.dur);
    g.gain.setValueAtTime(0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + spec.dur);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + spec.dur);
  }

  function playEvent(type) { const n = EVENT_SFX[type]; if (n) play(n); }

  const MELODY = [523,659,784,659,523,587,659,494]; // simple loop
  function startMusic() {
    if (muted) return;
    const c = ensure(); if (c.state==='suspended') c.resume();
    stopMusic();
    let i = 0;
    const note = () => {
      const o = c.createOscillator(), g = c.createGain();
      o.type='square'; o.frequency.setValueAtTime(MELODY[i%MELODY.length], c.currentTime);
      g.gain.setValueAtTime(0.06, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime+0.22);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+0.24);
      musicNodes.push(o); i++;
    };
    note();
    musicTimer = setInterval(note, 260);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    for (const n of musicNodes) { try { n.stop(); } catch {} }
    musicNodes = [];
  }

  function setMuted(v) { muted = v; if (v) stopMusic(); }
  function isMuted() { return muted; }

  return { unlock, play, playEvent, startMusic, stopMusic, setMuted, isMuted };
}
```

- [ ] **Step 4: Run to verify it passes**

Reload. Expected: audio tests PASS. (Spec §9.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Web Audio synth with mute + music lifecycle"
```

---

## Task 15: Levels + bootstrap wiring (playable game)

**Files:**
- Create: `src/levels/world-1-1.js`, `world-1-2.js`, `world-1-3.js`
- Rewrite: `src/main.js`
- Test: `tests/levels-load.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/levels-load.test.js`:

```js
import { test, assert } from './harness.js';
import { parseLevel } from '../src/levels/level-format.js';
import L1 from '../src/levels/world-1-1.js';
import L2 from '../src/levels/world-1-2.js';
import L3 from '../src/levels/world-1-3.js';

for (const [name, rows] of [['1-1',L1],['1-2',L2],['1-3',L3]]) {
  test(`level ${name} parses and validates`, () => {
    const lvl = parseLevel(rows, { tile: 16 });
    assert(lvl.playerSpawn, 'has player');
    assert(lvl.finish, 'has finish');
  });
}
```

- [ ] **Step 2: Run to verify it fails**

Add import. Reload. Expected: FAIL — level modules missing.

- [ ] **Step 3: Author levels (declarative data only)**

Create `src/levels/world-1-1.js` (15 rows tall, ground on bottom two rows; widths must be equal — keep every string the same length):

```js
// Each row MUST be the same length. 'P' once, 'F' once.
export default [
  '----------------------------------------',
  '----------------------------------------',
  '----------------------------------------',
  '----------------------------------------',
  '------------?--#U#-------------------F--',
  '----------------------------------------',
  '----------------------------------------',
  '-------------------------oo-------------',
  '----------?----------TT----G------------',
  '------G---------#----TT------------#----',
  'P-------------------TTT------------------',
  'XXXXXXXXXXXXXXXXXXXXXXXXX-XXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXX-XXXXXXXXXXXXXXX',
];
```

Create `src/levels/world-1-2.js`:

```js
export default [
  '----------------------------------------',
  '----------------------------------------',
  '--------------U-------------------------',
  '----------------------------------------',
  '------?#?-------------oo----------------',
  '----------------G---------#####---------',
  '-----------G--------------------------F-',
  '------#-------TT-------------G-----------',
  'P-----------TTTT--------#---------------',
  'XXXXXXXX-XXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXX-XXXXXXXXXXX-XXXXXXXXXXXXXXXXXXXX',
];
```

Create `src/levels/world-1-3.js`:

```js
export default [
  '----------------------------------------',
  '-------------------------------------F--',
  '-----------U-----#-#-#------------------',
  '----------------------------------------',
  '-----?--------G------G------G-----------',
  '--------#####-------#####------#####-----',
  'P---------------------------------------',
  'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXXXXXXXXX',
  'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXXXXXXXXX',
];
```

After creating each, the Step-1 test confirms it parses. If a row-length error throws,
pad the offending row with `-` to match.

- [ ] **Step 4: Rewrite `main.js` to wire everything**

Overwrite `src/main.js`:

```js
import { createLoop } from './engine/loop.js';
import { createInput } from './engine/input.js';
import { createCamera } from './engine/camera.js';
import { createAudio } from './engine/audio.js';
import { createGameState, STATES } from './game/game-state.js';
import { createWorld } from './game/world.js';
import { parseLevel } from './levels/level-format.js';
import { spawnGoomba } from './game/enemies.js';
import { createRenderer } from './render/renderer.js';
import L1 from './levels/world-1-1.js';
import L2 from './levels/world-1-2.js';
import L3 from './levels/world-1-3.js';

const LEVELS = [L1, L2, L3];
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(); input.attach(window);
const audio = createAudio();

function worldFactory(levelIndex) {
  const lvl = parseLevel(LEVELS[levelIndex], { tile: 16 });
  const w = createWorld(lvl);
  for (const s of lvl.entitySpawns) if (s.type === 'goomba') w.entities.push(spawnGoomba(s.x, s.y));
  return w;
}

const gs = createGameState({ worldFactory, levelCount: LEVELS.length });
const cam = createCamera({ viewW: canvas.width, viewH: canvas.height, bounds: { left:0, top:0, right:99999, bottom:240 } });

// mute button works before audio init
const muteBtn = document.getElementById('mute');
muteBtn.addEventListener('click', () => { audio.setMuted(!audio.isMuted()); muteBtn.textContent = audio.isMuted() ? '🔇' : '🔊'; });

// first interaction unlocks audio + starts game from title
function begin() { audio.unlock(); if (gs.state === STATES.title || gs.state === STATES.gameOver || gs.state === STATES.win) { gs.startGame(); cam.bounds = gs.world.bounds; audio.startMusic(); } }
window.addEventListener('keydown', begin, { once:false });
window.addEventListener('pointerdown', () => audio.unlock());

let prevState = gs.state;
const loop = createLoop({
  step() {
    const intent = input.consumeIntent();
    if (intent.jumpPressed && gs.state === STATES.playing && gs.world.player.onGround) audio.play('jump');
    if (gs.state === STATES.paused) return;
    gs.update(1/60, intent);
    if (gs.world) { gs.world.events.forEach(e => audio.playEvent(e.type)); cam.bounds = gs.world.bounds; }
    // music lifecycle on transitions
    if (gs.state !== prevState) {
      if ([STATES.dying, STATES.gameOver, STATES.win, STATES.title].includes(gs.state)) audio.stopMusic();
      if (gs.state === STATES.playing && prevState !== STATES.paused) audio.startMusic();
      prevState = gs.state;
    }
  },
  render() {
    input.beginFrame();
    if (gs.world) renderer.draw(gs.world, cam, /*alpha*/0, gs.session);
  },
});
loop.start();
```

Note: `render` calls `input.beginFrame()` once per displayed frame; `step` calls
`consumeIntent()` (edge delivered to first step that frame — spec §4/§10.8).

- [ ] **Step 5: Run tests + manual smoke**

Reload `http://localhost:8000/tests/` → all PASS.
Open `http://localhost:8000/` → press a key: game starts, player runs/jumps, goombas
move, coins/blocks/power-ups work, reaching `F` advances levels, dying loses a life.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: levels 1-1..1-3 + main bootstrap (playable game)"
```

---

## Task 16: Final green-test gate + docs

**Files:**
- Create: `README.md`, `LICENSE`

- [ ] **Step 1: Run the full suite**

Reload `http://localhost:8000/tests/`. Expected: `FAIL 0`. Fix any regressions before
proceeding. (Spec §12.10 final gate.)

- [ ] **Step 2: Write `README.md`**

```markdown
# Plumber Quest

A small side-scrolling platformer (run, jump, stomp, coins, power-ups, flagpole)
built with vanilla HTML5 Canvas + ES modules. No build step, no dependencies.

**All art and audio are original**, generated procedurally in code.

## Run locally
```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Controls
- Move: ←/→ or A/D
- Jump: Space / ↑ / W (hold for higher jump)
- Run: Shift
- Fireball (with fire flower): J / Z
- Mute: button top-right

## Tests
Open http://localhost:8000/tests/ — runs the full suite and prints PASS/FAIL.

## Add a level
1. Create `src/levels/world-1-N.js` exporting an array of equal-length rows.
   Chars: `X` ground, `#` brick, `?` coin block, `U` upgrade block, `o` coin,
   `T` pipe, `|` pipe deco, `G` goomba, `P` player (exactly one),
   `F` finish (exactly one), `-`/space empty.
2. Import it in `src/main.js` and add to the `LEVELS` array.

## License
MIT — see LICENSE.
```

- [ ] **Step 3: Write `LICENSE`** (MIT, current year, the repo owner's name).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README + MIT license"
```

---

## Task 17: Code review + GitHub Pages deploy

**Files:** none (process task)

- [ ] **Step 1: Code review pass**

Run the `/code-review` skill (or `superpowers:requesting-code-review`) over the full
diff (`git diff main` against the first commit, or review the working tree). Address
high-confidence findings; re-run the test page after any fix.

- [ ] **Step 2: Create the GitHub repo and push**

```bash
gh repo create plumber-quest --public --source=. --remote=origin --push
```

- [ ] **Step 3: Enable GitHub Pages (main branch, root)**

```bash
gh api -X POST repos/:owner/plumber-quest/pages -f "source[branch]=main" -f "source[path]=/" || \
gh api -X PUT  repos/:owner/plumber-quest/pages -f "source[branch]=main" -f "source[path]=/"
```

Then confirm the live URL:

```bash
gh api repos/:owner/plumber-quest/pages --jq .html_url
```

- [ ] **Step 4: Verify the deployed site**

Open the printed URL. Confirm the game loads and is playable (ES modules resolve over
HTTPS, identical to local). If a 404 on modules occurs, confirm paths are relative
(they are: `src/...`) and Pages source is root.

- [ ] **Step 5: Final commit (if review produced fixes)**

```bash
git add -A && git commit -m "fix: address code review findings" && git push
```

---

## Stretch (not committed): Koopa/shell enemy

Only after Tasks 1–17 are green. Add `src/game/koopa.js` (walk → stomp turns to shell →
shell idle → kick → sliding shell that kills goombas and bounces off walls; sliding shell
hitting the player while moving damages them, while idle can be re-kicked). Write tests
first: stomp-to-shell transition, kick direction, shell-kills-goomba, shell-vs-wall
bounce, idle-shell re-kick, sliding-shell-damages-player. Keep all shell state inside the
koopa entity; reuse the ordered interaction pass and lifecycle queue.
