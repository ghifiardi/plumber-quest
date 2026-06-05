# ECS Mechanics Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable mechanics framework to the ECS path — springs, conveyors, checkpoints, a finish trigger, and one stompable enemy — plus the Issue #4 hardening, proven by a playable `demo-2`, with the classic sim and both golden masters untouched.

**Architecture:** Generalize cycle-1's `body.standingOn` into a `body.support` descriptor (mover/bouncer/conveyor/solid). Surface effects run in `collision`; overlap mechanics (checkpoint/finish) run in a real `triggerSystem`; the enemy patrols via a new `walkerSystem`. In-place respawn is added behind a two-method facade (`canRespawnInPlace()`/`respawn()`). All additive; cycle-1 determinism + renderer-read-only rules hold.

**Tech Stack:** Vanilla ES modules, HTML5 Canvas 2D, zero build step. In-browser test harness (`tests/*.test.js` via `tests/harness.js`, run with `bash tools/run-tests.sh`, needs the `:8011` shot server).

**Branch:** `feat/ecs-mechanics` (already created). Keep commits scoped to ECS/mechanics files; leave the unrelated untracked `ios/`, `password/`, `tools/*.html` alone.

**Spec:** `docs/superpowers/specs/2026-06-05-ecs-mechanics-design.md`

---

## Conventions (read once)

- **Run tests:** ensure `:8011` is up (`python3 /tmp/shotsrv.py &` if down), then `bash tools/run-tests.sh` → prints `PASS n / FAIL m` + any `❌`. **Baseline before this cycle: PASS 178 / FAIL 0.**
- **Register every new test file** by adding `await import('./NAME.test.js');` to `tests/index.html` (import list, before the `const out = ...` line) — the harness will NOT auto-discover it. Each task that creates a test file includes this step.
- **Intent shape:** `{ right, left, run, jumpHeld, jumpPressed, jumpReleased, firePressed }`.
- **Harness API:** `test(name, fn)`, `assert(cond, msg)`, `assertEqual(actual, expected, msg)`, `assertClose(actual, expected, eps, msg)` from `./harness.js`.
- **Component shapes after this cycle:**
```js
// body:     { vx, vy, onGround, gravity, support, invuln }
// support:  { entityId, kind:'mover'|'bouncer'|'conveyor'|'solid', deltaX, deltaY, pushX, bounceV } | null
// bouncer:  { bounceV, solid }
// conveyor: { pushX, solid }
// trigger:  { tag:'checkpoint'|'finish', fired, spawnX, spawnY }
// walker:   { speed, dir }
// tags:     ['stompable','hazard']            (array on enemy's c.tags)
```

---

## File Structure

**Create:** `src/ecs/systems/walker.js`, `src/ecs/systems/trigger.js`, `src/levels/ecs/demo-2.js`, tests `ecs-mechanics.test.js`, `ecs-respawn.test.js`, `ecs-determinism-2.test.js`, `ecs-jump.test.js`.
**Modify:** `src/engine/constants.js` (new constants), `src/ecs/components.js` (body field, new templates, registry, tags), `src/ecs/systems/{movement,physics,collision,index}.js`, `src/ecs/world-ecs.js` (state + facade), `src/ecs/view.js` + `src/render/renderer.js` (new entity draws), `src/sim/classic-adapter.js` (respawn facade), `src/game/game-state.js` (respawn branch), `src/main.js` (`?ecsdemo=2`), and tests `ecs-systems.test.js`, `renderer-readonly.test.js`, `game-state.test.js`, `classic-adapter.test.js`, plus `tests/index.html`.

---

## Task 1: Migrate `standingOn` → `body.support` (+ first-contact break, strengthened carry)

Behavior-preserving generalization. The only surface kind here is `'mover'`; springs/conveyors plug into this model in later tasks. Includes Issue #4 multi-surface `break` and the strengthened carry assertion.

**Files:** Modify `src/ecs/components.js`, `src/ecs/systems/movement.js`, `src/ecs/systems/physics.js`, `src/ecs/systems/collision.js`, `tests/ecs-systems.test.js`.

- [ ] **Step 1: Strengthen the carry test + add the multi-surface break test** in `tests/ecs-systems.test.js`.

Replace this exact line (currently line ~87):
```js
  assert(pl.c.body.standingOn === plat.id || pl.c.body.onGround, 'resting on platform');
```
with:
```js
  assert(pl.c.body.support && pl.c.body.support.entityId === plat.id, 'rests on the platform (support descriptor)');
```

Then append this test to the end of `tests/ecs-systems.test.js`:
```js
test('surface: rider rests on the FIRST-contacted surface (multi-mover break)', () => {
  // two stationary movers side by side directly under the player; first-inserted wins.
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'ms', w: 12, h: 6 },
    tiles: [emptyRow(12), emptyRow(12), emptyRow(12), emptyRow(12), emptyRow(12), groundRow(12)],
    entities: [
      { type: 'player', x: 64, y: 16 },
      { type: 'platform', x: 56, y: 48, mover: { axis: 'x', dist: 0, speed: 0 } },
      { type: 'platform', x: 72, y: 48, mover: { axis: 'x', dist: 0, speed: 0 } },
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  const first = w.entities.filter(e => e.type === 'platform')[0];
  for (let i = 0; i < 40; i++) stepWorld(w, 1/60, NONE);
  assert(pl.c.body.support && pl.c.body.support.entityId === first.id, 'first-contacted surface wins, not last');
});
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `bash tools/run-tests.sh`
Expected: FAIL — `body.support` is undefined (still `standingOn`).

- [ ] **Step 3: Add the `support` field to the body template** in `src/ecs/components.js`.

Replace:
```js
  body:      { vx: 0, vy: 0, onGround: false, gravity: true, standingOn: null },
```
with:
```js
  body:      { vx: 0, vy: 0, onGround: false, gravity: true, support: null, invuln: 0 },
```
(`invuln` is wired up in Task 3; harmless here.)

- [ ] **Step 4: Rewrite collision's rest pass to record the descriptor + break** in `src/ecs/systems/collision.js`.

Replace the entire `// rest body-entities on top of solid movers (platforms)` loop (lines ~23-41) with:
```js
  // rest body-entities on the FIRST solid surface they contact (records body.support).
  // kind:'mover' carries the rider next tick; conveyors/bouncers extend this in later tasks.
  for (const e of world.entities) {
    const { body: b, transform: t } = e.c;
    if (!b) continue;
    for (const p of world.entities) {
      const m = p.c.mover; if (!m || !m.solid) continue;
      const pt = p.c.transform;
      const feet = { x: t.x, y: t.y, w: t.w, h: t.h };
      const top  = { x: pt.x, y: pt.y - 1, w: pt.w, h: 2 };
      const horizontallyOver = t.x + t.w > pt.x && t.x < pt.x + pt.w;
      const fallingOnto = b.vy >= 0 && (t.y + t.h) >= pt.y - 1 && (t.y + t.h) <= pt.y + 6;
      if (horizontallyOver && fallingOnto) {
        t.y = pt.y - t.h; b.vy = 0; b.onGround = true;
        b.support = { entityId: p.id, kind: 'mover', deltaX: m.delta.x, deltaY: m.delta.y, pushX: 0, bounceV: 0 };
        break;                                        // first-contacted surface wins
      } else if (overlap(feet, top)) {
        b.onGround = true;
        b.support = { entityId: p.id, kind: 'mover', deltaX: m.delta.x, deltaY: m.delta.y, pushX: 0, bounceV: 0 };
        break;
      }
    }
  }
```

- [ ] **Step 5: Apply support in movement + drop the byId/standingOn carry** in `src/ecs/systems/movement.js`.

Replace lines 7-23 (the `byId` setup and the `(1) carry` loop) with:
```js
export function movementSystem(world, dt) {
  // (1) apply support recorded by collision last tick (cleared by physics each tick)
  for (const e of world.entities) {
    const b = e.c.body; const s = b && b.support;
    if (!s) continue;
    if (s.kind === 'mover') { e.c.transform.x += s.deltaX; e.c.transform.y += s.deltaY; }
    // conveyor push (s.kind === 'conveyor') is added in Task 4
  }
```
(Leave the rest of `movementSystem` — the mover-advance loop and the control/jump loop — unchanged.)

- [ ] **Step 6: Clear support each tick in physics** in `src/ecs/systems/physics.js`.

Replace:
```js
    b.onGround = false;   // re-derived by collision this tick
```
with:
```js
    b.onGround = false; b.support = null;   // both re-derived by collision this tick
```

- [ ] **Step 7: Run to verify all pass**

Run: `bash tools/run-tests.sh`
Expected: PASS (carry + multi-surface tests green); the ECS golden master `demo-1` test still green (carry numbers unchanged); FAIL 0.

- [ ] **Step 8: Commit**

```bash
git add src/ecs/components.js src/ecs/systems/movement.js src/ecs/systems/physics.js src/ecs/systems/collision.js tests/ecs-systems.test.js
git commit -m "refactor(ecs): generalize standingOn -> body.support descriptor + first-contact break"
```

---

## Task 2: Targeted jump tests (Issue #4 #3)

Test-only — locks `movement.js` jump-cut / coyote / buffer behavior that the golden master only covers indirectly. No production change.

**Files:** Create `tests/ecs-jump.test.js`; modify `tests/index.html`.

- [ ] **Step 1: Write the tests** — create `tests/ecs-jump.test.js`:
```js
// tests/ecs-jump.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import { stepWorld } from '../src/ecs/world-ecs.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
function flat() {
  return definitionToWorld({
    engine: 'ecs', meta: { name: 'j', w: 12, h: 4 },
    tiles: [emptyRow(12), emptyRow(12), emptyRow(12), groundRow(12)],
    entities: [{ type: 'player', x: 32, y: 32 }],
  });
}
function settle(w) { for (let i = 0; i < 30; i++) stepWorld(w, 1/60, NONE); }

test('jump-cut: releasing early yields a lower peak than holding', () => {
  const wHold = flat(); settle(wHold);
  const wCut = flat();  settle(wCut);
  const pHold = wHold.entities[0].c, pCut = wCut.entities[0].c;
  const y0 = pHold.transform.y;
  stepWorld(wHold, 1/60, { ...NONE, jumpPressed:true, jumpHeld:true });
  stepWorld(wCut,  1/60, { ...NONE, jumpPressed:true, jumpHeld:true });
  for (let i = 0; i < 3; i++) stepWorld(wHold, 1/60, { ...NONE, jumpHeld:true });
  for (let i = 0; i < 3; i++) stepWorld(wCut,  1/60, { ...NONE, jumpReleased:true });   // release early
  let peakHold = y0, peakCut = y0;
  for (let i = 0; i < 40; i++) { stepWorld(wHold,1/60,{...NONE,jumpHeld:true}); peakHold = Math.min(peakHold, pHold.transform.y); }
  for (let i = 0; i < 40; i++) { stepWorld(wCut,1/60,NONE); peakCut = Math.min(peakCut, pCut.transform.y); }
  assert(peakHold < peakCut - 2, 'held jump rises higher than cut jump');
});

test('coyote: a jump pressed on the first airborne tick after a ledge still fires', () => {
  // walk off the right end; press jump every airborne tick. Coyote should let it fire
  // within the first few airborne ticks (robust to exactly when the foot leaves ground).
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'c', w: 8, h: 6 },
    tiles: [emptyRow(8), emptyRow(8), emptyRow(8), emptyRow(8), emptyRow(8),
            [{tile:'ground'},{tile:'ground'},{tile:'empty'},{tile:'empty'},{tile:'empty'},{tile:'empty'},{tile:'empty'},{tile:'empty'}]],
    entities: [{ type: 'player', x: 8, y: 64 }],
  });
  const p = w.entities[0].c;
  for (let i = 0; i < 30; i++) stepWorld(w, 1/60, NONE);     // settle on the left ground
  let airborneTicks = 0, jumped = false;
  for (let i = 0; i < 40 && !jumped; i++) {
    const air = !p.body.onGround;
    const evs = stepWorld(w, 1/60, { ...NONE, right: true, jumpPressed: air, jumpHeld: true });
    if (air) airborneTicks++;
    if (evs.some(e => e.type === 'jump')) jumped = true;
  }
  assert(jumped, 'a coyote jump fired after leaving the ledge');
  assert(airborneTicks <= 5, 'fired within the coyote window, not arbitrarily late');
});

test('buffer: a jump pressed while airborne fires again on landing', () => {
  // jump, then hold jumpPressed every tick (buffer keeps refilling). On landing,
  // coyote refreshes and the buffered press produces another jump.
  const w = flat();
  for (let i = 0; i < 30; i++) stepWorld(w, 1/60, NONE);     // settle
  stepWorld(w, 1/60, { ...NONE, jumpPressed:true, jumpHeld:true });  // first jump
  let jumps = 0;
  for (let i = 0; i < 60; i++) {
    const evs = stepWorld(w, 1/60, { ...NONE, jumpPressed:true, jumpHeld:true });
    jumps += evs.filter(e => e.type === 'jump').length;
  }
  assert(jumps >= 1, 'a buffered press produced another jump after landing');
});
```

- [ ] **Step 2: Register + run**

Add `await import('./ecs-jump.test.js');` to `tests/index.html`. Run `bash tools/run-tests.sh`.
Expected: all three PASS (they test existing behavior). If any fail, the cycle-1 jump logic differs from the assumption — report DONE_WITH_CONCERNS with which assertion failed (do NOT change production code in this test-only task).

- [ ] **Step 3: Commit**

```bash
git add tests/ecs-jump.test.js tests/index.html
git commit -m "test(ecs): targeted jump-cut/coyote/buffer coverage (Issue #4)"
```

---

## Task 3: `body.invuln` lifecycle (decrement + real view value)

**Files:** Modify `src/ecs/systems/physics.js`, `src/ecs/view.js`; test in `tests/ecs-systems.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-systems.test.js`):
```js
test('invuln: body.invuln decays to 0 over time and surfaces in the view', () => {
  const w = demoWorld();
  const pl = w.entities.find(e => e.type === 'player');
  pl.c.body.invuln = 0.1;
  for (let i = 0; i < 3; i++) stepWorld(w, 1/60, NONE);   // 0.05s elapsed
  assert(pl.c.body.invuln > 0, 'still invulnerable mid-window');
  for (let i = 0; i < 10; i++) stepWorld(w, 1/60, NONE);  // well past 0.1s
  assertEqual(pl.c.body.invuln, 0, 'decayed to exactly 0');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bash tools/run-tests.sh` → FAIL (invuln never decremented; stays 0.1 or so but not clamped — actually it stays at the set value, so the second assertion `=== 0` fails).

- [ ] **Step 3: Decrement invuln in physics** — in `src/ecs/systems/physics.js`, replace:
```js
    b.onGround = false; b.support = null;   // both re-derived by collision this tick
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
```
with:
```js
    b.onGround = false; b.support = null;   // both re-derived by collision this tick
    if (b.invuln > 0) b.invuln = Math.max(0, b.invuln - dt);
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
```
(Note: physics only iterates `gravity` bodies; the player has `gravity:true`, so this covers it.)

- [ ] **Step 4: Surface real invuln in the view** — in `src/ecs/view.js`, replace:
```js
      power: 'big',           // demo-1 hero is the 'big' sprite tier
      invuln: 0,
```
with:
```js
      power: 'big',           // hero is the 'big' sprite tier (no power tiers this cycle)
      invuln: pb.invuln,      // real post-respawn invulnerability (renderer blink)
```

- [ ] **Step 5: Run to verify it passes** → PASS, FAIL 0.

- [ ] **Step 6: Commit**

```bash
git add src/ecs/systems/physics.js src/ecs/view.js tests/ecs-systems.test.js
git commit -m "feat(ecs): body.invuln decay + real view value"
```

---

## Task 4: New component templates + registry + tags

**Files:** Modify `src/ecs/components.js`; test `tests/ecs-mechanics.test.js` (new).

- [ ] **Step 1: Write the failing test** — create `tests/ecs-mechanics.test.js`:
```js
// tests/ecs-mechanics.test.js
import { test, assert, assertEqual } from './harness.js';
import { instantiate, TYPE_REGISTRY } from '../src/ecs/components.js';
import { definitionToWorld } from '../src/ecs/loader.js';

test('registry knows the new mechanic types', () => {
  for (const t of ['spring','conveyor','checkpoint','finish','enemy']) {
    assert(t in TYPE_REGISTRY, `${t} registered`);
  }
});
test('spring/conveyor carry their effect components', () => {
  assert('bouncer' in instantiate('spring').c, 'spring has bouncer');
  assert('conveyor' in instantiate('conveyor').c, 'conveyor has conveyor');
});
test('checkpoint and finish carry a tagged trigger', () => {
  assertEqual(instantiate('checkpoint').c.trigger.tag, 'checkpoint');
  assertEqual(instantiate('finish').c.trigger.tag, 'finish');
});
test('enemy has body+walker and stompable/hazard tags', () => {
  const e = instantiate('enemy').c;
  assert('body' in e && 'walker' in e, 'enemy has body+walker');
  assert(e.tags.includes('stompable') && e.tags.includes('hazard'), 'enemy capability tags');
});
test('loader builds a world with the new types', () => {
  const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
  const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'm', w: 10, h: 4 },
    tiles: [emptyRow(10), emptyRow(10), emptyRow(10), groundRow(10)],
    entities: [
      { type: 'player', x: 16, y: 0 },
      { type: 'spring', x: 32, y: 32 }, { type: 'conveyor', x: 48, y: 32 },
      { type: 'checkpoint', x: 64, y: 16 }, { type: 'finish', x: 80, y: 16 },
      { type: 'enemy', x: 96, y: 32 },
    ],
  });
  assertEqual(w.entities.length, 6);
});
```

- [ ] **Step 2: Register + run**

Add `await import('./ecs-mechanics.test.js');` to `tests/index.html`. Run → FAIL (types not registered).

- [ ] **Step 3: Add templates, registry entries, and tags** in `src/ecs/components.js`.

In `TEMPLATES`, after the `mover:` line, add:
```js
  bouncer:   { bounceV: 360, solid: true },
  conveyor:  { pushX: 60, solid: true },
  trigger:   { tag: 'checkpoint', fired: false, spawnX: null, spawnY: null },
  walker:    { speed: 40, dir: -1 },
```

Replace the `TYPE_REGISTRY` block with:
```js
// type -> which components that entity gets.
export const TYPE_REGISTRY = {
  player:     ['transform', 'body', 'control', 'jump', 'sprite'],
  platform:   ['transform', 'mover', 'sprite'],
  spring:     ['transform', 'bouncer', 'sprite'],
  conveyor:   ['transform', 'conveyor', 'sprite'],
  checkpoint: ['transform', 'trigger', 'sprite'],
  finish:     ['transform', 'trigger', 'sprite'],
  enemy:      ['transform', 'body', 'walker', 'sprite'],
};

// capability tags attached per type (read by collision/trigger).
const TYPE_TAGS = {
  enemy: ['stompable', 'hazard'],
};
```

Replace the `instantiate` function with:
```js
// Build a fresh { c:{...} } component bag for a type (deep-cloned). Throws on unknown type.
export function instantiate(type) {
  const list = TYPE_REGISTRY[type];
  if (!list) throw new Error(`unknown entity type: ${type}`);
  const c = {};
  for (const name of list) c[name] = clone(TEMPLATES[name]);
  if (type === 'platform') c.sprite.id = 'platform';
  if (type === 'finish') c.trigger.tag = 'finish';
  if (type === 'checkpoint') c.trigger.tag = 'checkpoint';
  if (TYPE_TAGS[type]) c.tags = [...TYPE_TAGS[type]];
  if (c.sprite) c.sprite.id = c.sprite.id || type;
  return { c };
}
```

- [ ] **Step 4: Run to verify it passes** → PASS, FAIL 0.

> Loader note: `loader.js` deep-merges inline overrides only for keys present in `c`; `tags` is not a template key, so inline `tags` overrides aren't supported (not needed). Inline `bouncer`/`conveyor`/`walker`/`trigger` overrides DO work (they're in `c`). No loader change required.

- [ ] **Step 5: Commit**

```bash
git add src/ecs/components.js tests/ecs-mechanics.test.js tests/index.html
git commit -m "feat(ecs): component templates + registry + tags for new mechanics"
```

---

## Task 5: Conveyor (surface push + clamp)

**Files:** Modify `src/engine/constants.js`, `src/ecs/systems/collision.js`, `src/ecs/systems/movement.js`; test `tests/ecs-mechanics.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-mechanics.test.js`):
```js
import { stepWorld } from '../src/ecs/world-ecs.js';
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const eRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const gRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));

test('conveyor pushes a standing rider horizontally, clamped', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'cv', w: 16, h: 6 },
    tiles: [eRow(16), eRow(16), eRow(16), eRow(16), eRow(16), gRow(16)],
    entities: [
      { type: 'player', x: 64, y: 16 },
      { type: 'conveyor', x: 56, y: 48, conveyor: { pushX: 80 } },
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  for (let i = 0; i < 20; i++) stepWorld(w, 1/60, NONE);   // land on the conveyor
  const x0 = pl.c.transform.x;
  for (let i = 0; i < 20; i++) stepWorld(w, 1/60, NONE);   // carried by the belt (no input)
  assert(pl.c.transform.x > x0 + 2, 'belt pushed the rider');
  assert(Math.abs(pl.c.body.vx) <= pl.c.control.maxVx + 1e-6, 'vx never exceeds the rider cap');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (conveyor not solid / no push). Note: a conveyor is `mover.solid`? No — it has a `conveyor` component, not `mover`. The current collision rest-pass only checks `mover.solid`. So the player falls through the conveyor → test fails.

- [ ] **Step 3: Add the conveyor cap constant** — in `src/engine/constants.js`, after `export const RUN_MAX_FAST = 220;` add:
```js
export const CONVEYOR_MAX = 160;     // px/s fallback cap for conveyor push when no rider control cap
```

- [ ] **Step 4: Generalize the collision rest-pass to also rest on conveyors/bouncers/solids.**

In `src/ecs/systems/collision.js`, replace the rest-pass loop body that currently only handles `p.c.mover` with a surface-aware version. Replace the entire `for (const p of world.entities) { const m = p.c.mover; ... }` inner loop with:
```js
    for (const p of world.entities) {
      const surf = surfaceOf(p); if (!surf) continue;
      const pt = p.c.transform;
      const feet = { x: t.x, y: t.y, w: t.w, h: t.h };
      const top  = { x: pt.x, y: pt.y - 1, w: pt.w, h: 2 };
      const horizontallyOver = t.x + t.w > pt.x && t.x < pt.x + pt.w;
      const fallingOnto = b.vy >= 0 && (t.y + t.h) >= pt.y - 1 && (t.y + t.h) <= pt.y + 6;
      if (horizontallyOver && fallingOnto) {
        t.y = pt.y - t.h; b.vy = 0; b.onGround = true; b.support = surf; break;
      } else if (overlap(feet, top)) {
        b.onGround = true; b.support = surf; break;
      }
    }
```
And add this helper near the top of the file (after the imports):
```js
// Describe the solid surface an entity offers (or null). Movers carry; conveyors push.
function surfaceOf(p) {
  const t = p.c.transform;
  if (p.c.mover && p.c.mover.solid) {
    const m = p.c.mover;
    return { entityId: p.id, kind: 'mover', deltaX: m.delta.x, deltaY: m.delta.y, pushX: 0, bounceV: 0 };
  }
  if (p.c.conveyor && p.c.conveyor.solid) {
    return { entityId: p.id, kind: 'conveyor', deltaX: 0, deltaY: 0, pushX: p.c.conveyor.pushX, bounceV: 0 };
  }
  return null;
}
```
(Delete the now-unused inline `const m = p.c.mover; if (!m || !m.solid) continue;` and the descriptor-literals from Task 1's loop — the helper replaces them.)

- [ ] **Step 5: Apply conveyor push in movement (clamped).**

In `src/ecs/systems/movement.js`, replace the apply-support block:
```js
  for (const e of world.entities) {
    const b = e.c.body; const s = b && b.support;
    if (!s) continue;
    if (s.kind === 'mover') { e.c.transform.x += s.deltaX; e.c.transform.y += s.deltaY; }
    // conveyor push (s.kind === 'conveyor') is added in Task 4
  }
```
with:
```js
  for (const e of world.entities) {
    const b = e.c.body; const s = b && b.support;
    if (!s) continue;
    if (s.kind === 'mover') { e.c.transform.x += s.deltaX; e.c.transform.y += s.deltaY; }
    else if (s.kind === 'conveyor') {
      const cap = (e.c.control && e.c.control.maxVx) || CONVEYOR_MAX;
      b.vx = Math.max(-cap, Math.min(cap, b.vx + s.pushX));
    }
  }
```
And add `CONVEYOR_MAX` to the constants import at the top of `movement.js`:
```js
import { FRICTION, CONVEYOR_MAX } from '../../engine/constants.js';
```

- [ ] **Step 6: Run to verify it passes** → conveyor test PASS; carry + multi-surface tests still PASS (movers go through the same helper); FAIL 0.

- [ ] **Step 7: Commit**

```bash
git add src/engine/constants.js src/ecs/systems/collision.js src/ecs/systems/movement.js tests/ecs-mechanics.test.js
git commit -m "feat(ecs): conveyor surface push (clamped) via the support model"
```

---

## Task 6: Spring (impulse)

**Files:** Modify `src/ecs/systems/collision.js`; test `tests/ecs-mechanics.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-mechanics.test.js`):
```js
test('spring launches the player up, no support/onGround, emits spring-bounce', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'sp', w: 12, h: 8 },
    tiles: [eRow(12),eRow(12),eRow(12),eRow(12),eRow(12),eRow(12),eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 48, y: 16 },
      { type: 'spring', x: 40, y: 96, bouncer: { bounceV: 320 } },
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  let bounced = false;
  for (let i = 0; i < 60; i++) {
    const evs = stepWorld(w, 1/60, NONE);
    if (evs.some(e => e.type === 'spring-bounce')) {
      bounced = true;
      assert(pl.c.body.vy < 0, 'moving upward right after the bounce');
      assert(pl.c.body.support === null, 'no support recorded on a spring');
      assert(pl.c.body.onGround === false, 'not grounded on the bounce frame');
      break;
    }
  }
  assert(bounced, 'spring-bounce fired');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (no spring-bounce; player rests on the spring as a... actually `bouncer` isn't a surface yet in `surfaceOf`, so the player falls through → never bounces).

- [ ] **Step 3: Implement the spring impulse** in `src/ecs/systems/collision.js`.

Springs are an impulse, NOT a support. Add a dedicated pass AFTER the surface rest-pass loop (so a bouncer never records support). Append this block at the end of `collisionSystem`, before the closing brace:
```js
  // springs: impulse on top-contact crossing (prev->current bottom), not a support state
  for (const e of world.entities) {
    const { body: b, transform: t } = e.c;
    if (!b) continue;
    for (const p of world.entities) {
      const bnc = p.c.bouncer; if (!bnc || !bnc.solid) continue;
      const pt = p.c.transform;
      const horizontallyOver = t.x + t.w > pt.x && t.x < pt.x + pt.w;
      const prevBottom = t.prevY + t.h, curBottom = t.y + t.h;
      const crossed = prevBottom <= pt.y + 6 && curBottom >= pt.y && b.vy > 0;
      if (horizontallyOver && crossed) {
        t.y = pt.y - t.h;
        b.vy = -bnc.bounceV; b.onGround = false; b.support = null;   // launch; not grounded
        world.emit({ type: 'spring-bounce', x: t.x + t.w / 2, y: pt.y });
        break;
      }
    }
  }
```
(`surfaceOf` from Task 5 does NOT include bouncers, so the rest-pass never records support for a spring — exactly the intended split.)

- [ ] **Step 4: Run to verify it passes** → spring test PASS; FAIL 0.

- [ ] **Step 5: Commit**

```bash
git add src/ecs/systems/collision.js tests/ecs-mechanics.test.js
git commit -m "feat(ecs): spring impulse on top-contact (spring-bounce event)"
```

---

## Task 7: Real `triggerSystem` (checkpoint + finish) + world state

**Files:** Create `src/ecs/systems/trigger.js`; modify `src/ecs/systems/index.js`, `src/ecs/world-ecs.js`; test `tests/ecs-mechanics.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-mechanics.test.js`):
```js
test('checkpoint records a respawn transform, one-shot, emits checkpoint', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'cp', w: 12, h: 4 },
    tiles: [eRow(12), eRow(12), eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 40, y: 32 },
      { type: 'checkpoint', x: 40, y: 32, trigger: { spawnX: 41, spawnY: 33 } },
    ],
  });
  let hits = 0;
  for (let i = 0; i < 20; i++) for (const e of (stepWorld(w,1/60,NONE)||[])) if (e.type === 'checkpoint') hits++;
  assert(w.checkpoint && w.checkpoint.x === 41 && w.checkpoint.y === 33, 'respawn transform stored');
  assertEqual(hits, 1, 'checkpoint is one-shot');
});

test('finish sets levelClear once and emits flag-reached once', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'fn', w: 12, h: 4 },
    tiles: [eRow(12), eRow(12), eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 40, y: 32 },
      { type: 'finish', x: 40, y: 32 },
    ],
  });
  let flags = 0;
  for (let i = 0; i < 20; i++) for (const e of (stepWorld(w,1/60,NONE)||[])) if (e.type === 'flag-reached') flags++;
  assert(w.levelClear === true, 'levelClear set');
  assertEqual(flags, 1, 'flag-reached emitted exactly once');
  assert(w.getStatus().levelClear === true, 'status reflects levelClear');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (`triggerSystem` is a no-op stub; `world.checkpoint`/`levelClear` undefined).

- [ ] **Step 3: Add world state** — in `src/ecs/world-ecs.js` constructor, after `this.timeRemaining = 0;`, add:
```js
    this.checkpoint = null;     // { x, y } respawn transform set by a checkpoint trigger
    this.playerDied = false;    // set by hazard collision (Task 9), cleared on respawn
    this.levelClear = false;    // set by the finish trigger
```
And update `getStatus()` — replace its body with:
```js
  getStatus() {
    const p = this._player();
    const fell = !!p && p.c.transform.y > this.bounds.bottom;
    return { timeUp: false, fell, playerDied: this.playerDied, levelClear: this.levelClear };
  }
```

- [ ] **Step 4: Create the trigger system** — `src/ecs/systems/trigger.js`:
```js
// src/ecs/systems/trigger.js
// Overlap triggers: checkpoint (one-shot, stores a respawn transform) and finish
// (one-shot via the world.levelClear guard). Player-vs-trigger AABB overlap.
import { overlap } from '../../engine/aabb.js';

export function triggerSystem(world) {
  const player = world.entities.find(e => e.type === 'player');
  if (!player) return;
  const pb = player.c.transform;
  for (const e of world.entities) {
    const tr = e.c.trigger; if (!tr) continue;
    const t = e.c.transform;
    if (!overlap(pb, t)) continue;
    if (tr.tag === 'checkpoint') {
      if (tr.fired) continue;
      tr.fired = true;
      world.checkpoint = { x: tr.spawnX ?? t.x, y: tr.spawnY ?? t.y };
      world.emit({ type: 'checkpoint', x: t.x, y: t.y });
    } else if (tr.tag === 'finish') {
      if (world.levelClear) continue;
      world.levelClear = true;
      world.emit({ type: 'flag-reached' });
    }
  }
}
```

- [ ] **Step 5: Wire the real trigger system** — in `src/ecs/systems/index.js`:

Remove the stub line:
```js
export function triggerSystem() { /* stub: checkpoints/finish land in the mechanics cycle */ }
```
Add an import with the others:
```js
import { triggerSystem } from './trigger.js';
```
(The `SYSTEM_ORDER` entry `['trigger', triggerSystem]` already references it — now it resolves to the real import.)

- [ ] **Step 6: Run to verify it passes** → checkpoint + finish tests PASS; FAIL 0.

- [ ] **Step 7: Commit**

```bash
git add src/ecs/systems/trigger.js src/ecs/systems/index.js src/ecs/world-ecs.js tests/ecs-mechanics.test.js
git commit -m "feat(ecs): real triggerSystem (checkpoint + finish) + world lifecycle state"
```

---

## Task 8: Walker (enemy patrol) + SYSTEM_ORDER

**Files:** Create `src/ecs/systems/walker.js`; modify `src/ecs/systems/index.js`; test `tests/ecs-mechanics.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-mechanics.test.js`):
```js
test('walker patrols and turns at a wall', () => {
  // ground floor; a wall column at the right. Enemy walks right, hits wall, reverses.
  const rows = [];
  for (let r = 0; r < 5; r++) rows.push(eRow(10));
  rows.push(gRow(10));
  rows[4][8] = { tile: 'ground' }; rows[3][8] = { tile: 'ground' };   // wall near the right
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'wk', w: 10, h: 6 },
    tiles: rows,
    entities: [
      { type: 'player', x: 8, y: 16 },
      { type: 'enemy', x: 96, y: 64, walker: { speed: 40, dir: 1 } },   // walking right toward the wall
    ],
  });
  const en = w.entities.find(e => e.type === 'enemy');
  for (let i = 0; i < 120; i++) stepWorld(w, 1/60, NONE);
  assertEqual(en.c.walker.dir, -1, 'reversed after hitting the wall');
});

test('walker turns at a ledge edge instead of walking off', () => {
  // platform of ground from cols 0..4, empty after; enemy walking right should reverse at the edge.
  const rows = [];
  for (let r = 0; r < 5; r++) rows.push(eRow(10));
  const floor = eRow(10); for (let c = 0; c <= 4; c++) floor[c] = { tile: 'ground' };
  rows.push(floor);
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'le', w: 10, h: 6 },
    tiles: rows,
    entities: [
      { type: 'player', x: 8, y: 16 },
      { type: 'enemy', x: 32, y: 64, walker: { speed: 40, dir: 1 } },
    ],
  });
  const en = w.entities.find(e => e.type === 'enemy');
  for (let i = 0; i < 120; i++) stepWorld(w, 1/60, NONE);
  assert(en.c.transform.x < 5 * 16, 'did not walk off the ledge');
  assertEqual(en.c.walker.dir, -1, 'reversed at the ledge');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (`walkerSystem` does not exist; enemy doesn't move/turn).

- [ ] **Step 3: Create the walker system** — `src/ecs/systems/walker.js`:
```js
// src/ecs/systems/walker.js
// Enemy patrol: set body.vx from walker.dir*speed; flip dir at a wall ahead or a ledge
// ahead. Deterministic tile probes only — no RNG/time. Runs between movement and physics.
import { makeSolid } from '../../engine/tile-collision.js';
import { TILE } from '../../engine/constants.js';

export function walkerSystem(world) {
  const solid = world._solid || (world._solid = makeSolid(world.tiles));
  for (const e of world.entities) {
    const wk = e.c.walker, b = e.c.body, t = e.c.transform;
    if (!wk || !b) continue;
    // probe just ahead of the leading edge, at body mid-height and just below the feet
    const aheadX = wk.dir > 0 ? t.x + t.w + 1 : t.x - 1;
    const col = Math.floor(aheadX / TILE);
    const midRow = Math.floor((t.y + t.h / 2) / TILE);
    const belowRow = Math.floor((t.y + t.h + 2) / TILE);
    const wallAhead = solid(col, midRow);
    const groundAhead = solid(col, belowRow);
    if (wallAhead || (!groundAhead && b.onGround)) wk.dir = -wk.dir;
    b.vx = wk.dir * wk.speed;
  }
}
```

- [ ] **Step 4: Insert walker into SYSTEM_ORDER** — in `src/ecs/systems/index.js`:

Add the import:
```js
import { walkerSystem } from './walker.js';
```
Replace the `SYSTEM_ORDER` array with:
```js
export const SYSTEM_ORDER = [
  ['input', inputSystem],
  ['movement', movementSystem],
  ['walker', walkerSystem],
  ['physics', physicsSystem],
  ['collision', collisionSystem],
  ['trigger', triggerSystem],
  ['lifetime', lifetimeSystem],
];
```

- [ ] **Step 5: Run to verify it passes** → both walker tests PASS. The `demo-1` golden master may now differ ONLY if demo-1 had enemies — it does not, so it stays green. FAIL 0.

- [ ] **Step 6: Commit**

```bash
git add src/ecs/systems/walker.js src/ecs/systems/index.js tests/ecs-mechanics.test.js
git commit -m "feat(ecs): walker enemy patrol (turn at wall/ledge) + SYSTEM_ORDER"
```

---

## Task 9: Stomp + hazard resolution

**Files:** Modify `src/engine/constants.js`, `src/ecs/systems/collision.js`; test `tests/ecs-mechanics.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-mechanics.test.js`):
```js
test('stomp from above removes the enemy, bounces the player, emits enemy-stomped', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'st', w: 12, h: 8 },
    tiles: [eRow(12),eRow(12),eRow(12),eRow(12),eRow(12),eRow(12),eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 48, y: 16 },                              // falls onto the enemy
      { type: 'enemy', x: 48, y: 96, walker: { speed: 0, dir: 1 } }, // stationary under the player
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  let stomped = false;
  for (let i = 0; i < 80; i++) {
    const evs = stepWorld(w, 1/60, NONE);
    if (evs.some(e => e.type === 'enemy-stomped')) { stomped = true; break; }
  }
  assert(stomped, 'enemy-stomped fired');
  assert(pl.c.body.vy < 0, 'player bounced up');
  assert(!w.entities.some(e => e.type === 'enemy'), 'enemy removed');
});

test('side contact kills the player (player-died), suppressed while invuln', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'hz', w: 12, h: 4 },
    tiles: [eRow(12), eRow(12), eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 40, y: 32 },
      { type: 'enemy', x: 48, y: 32, walker: { speed: 0, dir: -1 } },  // beside the player
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  pl.c.body.invuln = 1.0;                          // invulnerable first
  for (let i = 0; i < 5; i++) stepWorld(w, 1/60, NONE);
  assert(w.playerDied === false, 'no death while invulnerable');
  pl.c.body.invuln = 0;                            // drop invuln
  let died = false;
  for (let i = 0; i < 30; i++) { const evs = stepWorld(w, 1/60, { ...NONE, right:true }); if (evs.some(e => e.type === 'player-died')) died = true; }
  assert(died && w.playerDied, 'side contact killed the player once vulnerable');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (no stomp/hazard resolution).

- [ ] **Step 3: Add the stomp bounce constant** — in `src/engine/constants.js`, after the `CONVEYOR_MAX` line add:
```js
export const STOMP_BOUNCE = -220;    // px/s upward impulse after stomping an enemy
```

- [ ] **Step 4: Implement player-vs-enemy resolution** in `src/ecs/systems/collision.js`.

Import the constant — update the constants import line:
```js
import { TILE, STOMP_BOUNCE } from '../../engine/constants.js';
```
Append this pass at the END of `collisionSystem` (after the spring pass), before the closing brace:
```js
  // player-vs-enemy: stomp check FIRST, then hazard damage (only if not stomped and not invuln)
  const player = world.entities.find(e => e.type === 'player');
  if (player) {
    const pt = player.c.transform, pb = player.c.body;
    for (const en of world.entities) {
      if (en === player || !(en.c.tags && en.c.tags.length)) continue;
      const et = en.c.transform;
      if (!overlap(pt, et)) continue;
      const stompable = en.c.tags.includes('stompable');
      const enemyTop = et.y, prevBottom = pt.prevY + pt.h, curBottom = pt.y + pt.h;
      const stomped = stompable && pb.vy > 0 && prevBottom <= enemyTop + 6 && curBottom >= enemyTop;
      if (stomped) {
        world.remove(en);
        pb.vy = STOMP_BOUNCE;
        world.emit({ type: 'enemy-stomped', x: et.x + et.w / 2, y: et.y });
      } else if (en.c.tags.includes('hazard') && pb.invuln <= 0) {
        world.playerDied = true;
        world.emit({ type: 'player-died', x: pt.x + pt.w / 2, y: pt.y });
      }
    }
  }
```

- [ ] **Step 5: Run to verify it passes** → stomp + hazard tests PASS; FAIL 0.

- [ ] **Step 6: Commit**

```bash
git add src/engine/constants.js src/ecs/systems/collision.js tests/ecs-mechanics.test.js
git commit -m "feat(ecs): stomp (bounce+remove) and hazard (death) resolution, invuln-aware"
```

---

## Task 10: Respawn facade (`canRespawnInPlace` / `respawn`)

**Files:** Modify `src/ecs/world-ecs.js`, `src/sim/classic-adapter.js`; tests `tests/ecs-respawn.test.js` (new), `tests/classic-adapter.test.js`.

- [ ] **Step 1: Write the failing tests** — create `tests/ecs-respawn.test.js`:
```js
// tests/ecs-respawn.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';

const eRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const gRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
function world() {
  return definitionToWorld({
    engine: 'ecs', meta: { name: 'rs', w: 12, h: 4 },
    tiles: [eRow(12), eRow(12), eRow(12), gRow(12)],
    entities: [{ type: 'player', x: 32, y: 0 }],
  });
}

test('EcsWorld canRespawnInPlace is true', () => {
  assertEqual(world().canRespawnInPlace(), true);
});

test('respawn resets player to checkpoint and clears transient state', () => {
  const w = world();
  const p = w.entities[0].c;
  w.checkpoint = { x: 80, y: 16 };
  w.playerDied = true;
  p.body.vx = 99; p.body.vy = 99; p.body.onGround = true;
  p.body.support = { entityId: 5, kind: 'mover', deltaX: 1, deltaY: 0, pushX: 0, bounceV: 0 };
  p.jump.buffer = 1; p.jump.coyote = 1; p.jump.jumped = true;
  w.respawn();
  assertEqual(p.transform.x, 80); assertEqual(p.transform.y, 16);
  assertEqual(p.body.vx, 0); assertEqual(p.body.vy, 0);
  assertEqual(p.body.support, null); assertEqual(p.body.onGround, false);
  assertEqual(p.jump.buffer, 0); assertEqual(p.jump.coyote, 0); assertEqual(p.jump.jumped, false);
  assert(p.body.invuln > 0, 'invuln window set');
  assertEqual(w.playerDied, false, 'death flag cleared');
});

test('respawn without a checkpoint returns to spawn', () => {
  const w = world();
  const p = w.entities[0].c;
  p.transform.x = 200;
  w.respawn();
  assertEqual(p.transform.x, 32, 'back to spawn x');
});
```

- [ ] **Step 2: Register + run** — add `await import('./ecs-respawn.test.js');` to `tests/index.html`. Run → FAIL (`canRespawnInPlace`/`respawn` undefined).

- [ ] **Step 3: Capture the spawn transform at load** — in `src/ecs/world-ecs.js` constructor, after the `this.levelClear = false;` line add:
```js
    this.playerSpawn = null;    // { x, y } captured by the loader for respawn fallback
```
And in `src/ecs/loader.js`, inside the entity loop where the player is built, record the spawn. After the existing `if (type === 'player') players++;` line add:
```js
    if (type === 'player') world.playerSpawn = { x: def1.x, y: def1.y };
```

- [ ] **Step 4: Implement the facade methods** — in `src/ecs/world-ecs.js`, add these methods to the `EcsWorld` class (after `getStatus()`):
```js
  canRespawnInPlace() { return true; }
  respawn() {
    const p = this._player(); if (!p) return;
    const at = this.checkpoint || this.playerSpawn || { x: p.c.transform.x, y: p.c.transform.y };
    const t = p.c.transform, b = p.c.body, j = p.c.jump;
    t.x = at.x; t.y = at.y; t.prevX = at.x; t.prevY = at.y;
    b.vx = 0; b.vy = 0; b.onGround = false; b.support = null; b.invuln = 1.2;
    if (j) { j.buffer = 0; j.coyote = 0; j.jumped = false; j.heldPrev = false; }
    this.playerDied = false;
  }
```

- [ ] **Step 5: Add the classic facade methods** — in `src/sim/classic-adapter.js`, inside the returned object (after `getRenderView: () => world,`), add:
```js
    canRespawnInPlace: () => false,
    respawn: () => {},
```
And append a classic test to `tests/classic-adapter.test.js`:
```js
test('classic adapter cannot respawn in place', () => {
  const sim = makeClassicSim(ROWS, ctx);
  assertEqual(sim.canRespawnInPlace(), false);
  sim.respawn();   // no-op, must not throw
  assert(true);
});
```

- [ ] **Step 6: Run to verify all pass** → ECS respawn + classic tests PASS; FAIL 0.

- [ ] **Step 7: Commit**

```bash
git add src/ecs/world-ecs.js src/ecs/loader.js src/sim/classic-adapter.js tests/ecs-respawn.test.js tests/classic-adapter.test.js tests/index.html
git commit -m "feat(sim): in-place respawn facade (ECS resets to checkpoint; classic opts out)"
```

---

## Task 11: game-state in-place respawn branch

**Files:** Modify `src/game/game-state.js`, `tests/game-state.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/game-state.test.js`):
```js
test('in-place respawn returns straight to playing without losing the world', () => {
  let respawned = false;
  const sim = {
    update() {}, getStatus: () => ({ timeUp:false, fell:false, playerDied:false, levelClear:false }),
    beginScripted() {}, updateScripted() {},
    canRespawnInPlace: () => true, respawn() { respawned = true; },
    drainEvents: () => [], getBounds: () => ({left:0,top:0,right:99,bottom:240}),
    getCameraTarget: () => ({x:0,y:0,w:16,h:16,facing:1}), getRenderView: () => ({}),
    get timeRemaining() { return 0; }, set timeRemaining(_v) {},
  };
  const gs = createGameState({ worldFactory: () => sim, levelCount: 1 });
  gs.startGame(); gs.state = STATES.dying; gs.session.lives = 3;
  gs.finishScriptedForTest();        // dying script completes
  assert(respawned, 'sim.respawn() called');
  assertEqual(gs.state, STATES.playing, 'straight to playing, no intro card');
  assertEqual(gs.session.lives, 2, 'a life was spent');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (game-state always reloads via intro; never calls respawn).

- [ ] **Step 3: Add the respawn branch** — in `src/game/game-state.js`, replace the `dying` arm of `_completeScripted`:
```js
    if (gs.state === STATES.dying) {
      gs.session.lives -= 1;
      if (gs.session.lives > 0) { loadLevel(); enterIntro(); }
      else gs.state = STATES.gameOver;
    } else if (gs.state === STATES.levelClear) {
```
with:
```js
    if (gs.state === STATES.dying) {
      gs.session.lives -= 1;
      if (gs.session.lives <= 0) gs.state = STATES.gameOver;
      else if (gs.world.canRespawnInPlace && gs.world.canRespawnInPlace()) {
        gs.world.respawn(); gs.state = STATES.playing;     // checkpoint respawn — no intro card
      } else { loadLevel(); enterIntro(); }                // classic full reload
    } else if (gs.state === STATES.levelClear) {
```

- [ ] **Step 4: Run to verify it passes** — new test PASS; ALL existing game-state tests stay green (they use a stub without `canRespawnInPlace`, so the `&&` guard falls through to the classic reload path — verify the death test at line ~67 still passes). FAIL 0.

> If the existing death test fails because its stub now needs `canRespawnInPlace`, it should NOT — the guard `gs.world.canRespawnInPlace && ...` short-circuits when the method is absent. If it does fail, the stub returned a truthy non-function; inspect and fix the stub minimally, do not weaken assertions.

- [ ] **Step 5: Commit**

```bash
git add src/game/game-state.js tests/game-state.test.js
git commit -m "feat(game-state): in-place checkpoint respawn branch (facade-guarded)"
```

---

## Task 12: Renderer + view for new entity types

**Files:** Modify `src/ecs/view.js`, `src/render/renderer.js`, `tests/renderer-readonly.test.js`.

- [ ] **Step 1: Write the failing tests** (append to `tests/renderer-readonly.test.js`, reusing its `rendererWithSpy`/`ecsView` helpers from cycle 1 — add a new view builder with all entity types):
```js
function ecsViewAll() {
  const eRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
  const gRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'all', w: 20, h: 4 },
    tiles: [eRow(20), eRow(20), eRow(20), gRow(20)],
    entities: [
      { type: 'player', x: 16, y: 0 },
      { type: 'platform', x: 48, y: 40, mover: { axis:'x', dist:16, speed:10 } },
      { type: 'spring', x: 80, y: 32 }, { type: 'conveyor', x: 112, y: 32 },
      { type: 'checkpoint', x: 144, y: 16 }, { type: 'finish', x: 176, y: 16 },
      { type: 'enemy', x: 96, y: 32, walker: { speed: 20, dir: 1 } },
    ],
  });
  for (let i = 0; i < 5; i++) w.update(1/60, { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false });
  return w.getRenderView();
}

test('renderer draws a view with every new entity type without throwing', () => {
  const { renderer, cam } = rendererWithSpy();
  let threw = false;
  try { renderer.draw(ecsViewAll(), cam, 0, { score:0, coins:0, lives:3, levelIndex:0 }, 'playing'); }
  catch (e) { threw = true; }
  assert(!threw, 'new entity types render without throwing');
});

test('view exposes enemy facing for sprite flip', () => {
  const v = ecsViewAll();
  const enemy = v.entities.find(e => e.type === 'enemy');
  assert(enemy && 'facing' in enemy, 'enemy carries a facing in the view');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (no enemy `facing` in view; renderer has no branch for the new types — but they fall through to the `ENT_SPRITE[e.type]` skip, so the throw test may pass; the facing test fails). Confirm the `facing` test fails.

- [ ] **Step 3: Add enemy facing to the view** — in `src/ecs/view.js`, replace the entity push:
```js
    entities.push({
      type: e.type, x: t.x, y: t.y, prevX: t.prevX, prevY: t.prevY, w: t.w, h: t.h,
      // platform extent for drawing (renderer reads w/h)
    });
```
with:
```js
    entities.push({
      type: e.type, x: t.x, y: t.y, prevX: t.prevX, prevY: t.prevY, w: t.w, h: t.h,
      facing: e.c.walker ? e.c.walker.dir : 1,   // enemy sprite flip
    });
```

- [ ] **Step 4: Add renderer draw branches** — in `src/render/renderer.js`, in the entity loop inside `drawWorld`, the existing `platform` branch is followed by `goomba`/`koopa`/`ENT_SPRITE`. Insert handling for the new types right after the `platform` branch (before `if (e.type === 'goomba')`):
```js
      if (e.type === 'enemy') {
        const sz = sprites.goombaSize;
        const img = sprites.goombaFrames[goombaFrame(clock)];
        blit(img, Math.round(p.x + e.w/2 - sz.w/2 - cam.x), Math.round(p.y + e.h - sz.h), sz.w, sz.h, e.facing > 0);
        continue;
      }
      if (e.type === 'spring' || e.type === 'conveyor' || e.type === 'checkpoint' || e.type === 'finish') {
        // plain placeholder markers — a later art pass replaces these (spec §8)
        const COLORS = { spring: '#d33', conveyor: '#888', checkpoint: '#3c6', finish: '#fc3' };
        ctx.fillStyle = COLORS[e.type];
        ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y), e.w, e.h);
        continue;
      }
```

- [ ] **Step 5: Run to verify it passes** — both new tests PASS; the existing `renderer.draw mutates nothing` test stays green (new branches only read + draw); FAIL 0.

- [ ] **Step 6: Commit**

```bash
git add src/ecs/view.js src/render/renderer.js tests/renderer-readonly.test.js
git commit -m "feat(render): draw enemy + spring/conveyor/checkpoint/finish (placeholder markers)"
```

---

## Task 13: demo-2 level + new golden master + tiles-immutable test + main.js launch

**Files:** Create `src/levels/ecs/demo-2.js`, `tests/ecs-determinism-2.test.js`; modify `src/main.js`, `tests/index.html`.

- [ ] **Step 1: Create demo-2** — `src/levels/ecs/demo-2.js`:
```js
// src/levels/ecs/demo-2.js
// Cycle-2 acceptance level: moving platform over a gap -> conveyor -> spring to a ledge ->
// checkpoint -> stompable enemy -> finish. A hazard enemy sits in an OPTIONAL side pocket
// (below the main route) so the happy path never requires dying.
const W = 60, H = 15;
const cell = (k) => ({ tile: k });
const rows = [];
for (let r = 0; r < H; r++) {
  rows[r] = [];
  for (let c = 0; c < W; c++) {
    const groundRow = r >= H - 2;
    const gap = c >= 14 && c <= 20;          // platform bridges this gap
    rows[r][c] = cell(groundRow && !gap ? 'ground' : 'empty');
  }
}
const GY = (H - 3) * 16;   // standing y on the main ground

export default {
  engine: 'ecs',
  meta: { name: 'ECS Demo 2', w: W, h: H },
  tiles: rows,
  entities: [
    { type: 'player', x: 32, y: GY },
    { type: 'platform', x: 14 * 16, y: (H - 4) * 16, mover: { axis: 'x', dist: 6 * 16, speed: 40 } },
    { type: 'conveyor', x: 24 * 16, y: (H - 3) * 16, conveyor: { pushX: 60 } },
    { type: 'spring',   x: 34 * 16, y: (H - 3) * 16, bouncer: { bounceV: 380 } },
    { type: 'checkpoint', x: 40 * 16, y: GY, trigger: { spawnX: 40 * 16, spawnY: GY } },
    { type: 'enemy',    x: 46 * 16, y: GY, walker: { speed: 30, dir: -1 } },
    { type: 'finish',   x: 56 * 16, y: GY },
    // OPTIONAL hazard side-pocket (not on the completion path): an enemy down a pit edge
    { type: 'enemy',    x: 18 * 16, y: (H - 3) * 16, walker: { speed: 30, dir: 1 } },
  ],
};
```

- [ ] **Step 2: Write the golden-master + tiles-immutable tests** — create `tests/ecs-determinism-2.test.js`:
```js
// tests/ecs-determinism-2.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import DEMO2 from '../src/levels/ecs/demo-2.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
function script() {
  const s = [];
  for (let i = 0; i < 20; i++) s.push({ ...NONE });
  for (let i = 0; i < 120; i++) s.push({ ...NONE, right: true });
  for (let i = 0; i < 20; i++) s.push({ ...NONE, right: true, jumpPressed: i === 0, jumpHeld: true });
  return s;
}
function fingerprint(w) {
  const p = w.entities.find(e => e.type === 'player').c;
  return JSON.stringify({
    px: Math.round(p.transform.x), py: Math.round(p.transform.y),
    pvx: Math.round(p.body.vx), pvy: Math.round(p.body.vy),
    ents: w.entities.map(e => e.type).sort(),
  });
}
function tileGrid(w) { return JSON.stringify(w.tiles.map(row => row.map(c => c.tile))); }

function play() {
  const w = definitionToWorld(DEMO2);
  const before = tileGrid(w);
  for (const it of script()) w.update(1/60, it);
  return { fp: fingerprint(w), tilesBefore: before, tilesAfter: tileGrid(w) };
}

test('ECS demo-2 determinism: identical fingerprint across 3 runs', () => {
  const a = play(), b = play(), c = play();
  assertEqual(a.fp, b.fp); assertEqual(b.fp, c.fp);
});

test('tiles invariant: world.tiles unchanged after a scripted run (structural snapshot)', () => {
  const r = play();
  assertEqual(r.tilesAfter, r.tilesBefore, 'cycle 2 never mutates world.tiles');
});

// GOLDEN MASTER — record on first green run, then lock.
const GOLDEN = '__RECORD_ON_FIRST_RUN__';
test('ECS demo-2 determinism: fingerprint matches the recorded golden master', () => {
  const { fp } = play();
  if (GOLDEN === '__RECORD_ON_FIRST_RUN__') throw new Error('GOLDEN not set — set: const GOLDEN = ' + JSON.stringify(fp) + ';');
  assertEqual(fp, GOLDEN);
});
```

- [ ] **Step 3: Register + record** — add `await import('./ecs-determinism-2.test.js');` to `tests/index.html`. Run `bash tools/run-tests.sh`. The 3-run + tiles-invariant tests PASS; the golden master FAILS with `❌ … GOLDEN not set — set: const GOLDEN = "{...}";`. Copy that exact string.

- [ ] **Step 4: Lock the golden master** — replace `const GOLDEN = '__RECORD_ON_FIRST_RUN__';` with the recorded value. Run again → all three PASS, FAIL 0.

- [ ] **Step 5: Wire `?ecsdemo=2` in main.js** — in `src/main.js`:

Add the import after the `import DEMO1 ...` line:
```js
import DEMO2 from './levels/ecs/demo-2.js';
```
Replace:
```js
const ECS_DEMO = new URLSearchParams(location.search).get('ecsdemo');
const LEVELS = ECS_DEMO ? [DEMO1] : [L1, L2, L3, L4, L5, L6];
```
with:
```js
const ECS_DEMO = new URLSearchParams(location.search).get('ecsdemo');
const LEVELS = ECS_DEMO === '2' ? [DEMO2]
  : ECS_DEMO ? [DEMO1]
  : [L1, L2, L3, L4, L5, L6];
```

- [ ] **Step 6: Verify** — `node --check src/main.js` (parses), then `bash tools/run-tests.sh` → full suite green incl. classic + demo-1 + demo-2 golden masters. FAIL 0.

- [ ] **Step 7: Commit**

```bash
git add src/levels/ecs/demo-2.js tests/ecs-determinism-2.test.js src/main.js tests/index.html
git commit -m "feat(ecs): demo-2 mechanics level + golden master + tiles-immutable test; ?ecsdemo=2"
```

---

## Task 14: Final verification + browser smoke

**Files:** none (verification only).

- [ ] **Step 1: Full suite green**

Run: `bash tools/run-tests.sh`
Expected: `PASS n / FAIL 0`, n = 178 + all cycle-2 tests. No `❌`.

- [ ] **Step 2: Both prior golden masters unchanged**

Run: `grep -n "GOLDEN =" tests/determinism.test.js tests/ecs-determinism.test.js`
Expected: classic GOLDEN is the original `{"px":94,...}`; demo-1 GOLDEN is its cycle-1 value. Neither changed (cycle 2 is additive; demo-1 has no enemies/triggers so its fingerprint is stable).

- [ ] **Step 3: Browser smoke** (CDP driver pattern from cycle 1; start `:8011` static server + headless Chrome with `--remote-debugging-port=9222`). Verify three pages boot with **no console exceptions**:
  - `http://localhost:8011/index.html` (classic) — plays normally.
  - `http://localhost:8011/index.html?ecsdemo=1` — basic ECS path still works (regression).
  - `http://localhost:8011/index.html?ecsdemo=2` — mechanics level renders; player rides platform, crosses conveyor, springs up, passes checkpoint, can stomp the enemy, reaches finish.

  Capture a screenshot of `?ecsdemo=2` in gameplay and confirm the entities render (placeholder markers + enemy). Confirm `?ecsdemo=2` does NOT break `?ecsdemo=1` or classic.

- [ ] **Step 4: No stray files**

Run: `git status --porcelain`
Expected: only the unrelated untracked `ios/`, `password/`, `tools/*.html` remain; everything else committed on `feat/ecs-mechanics`.

- [ ] **Step 5: Hand off** — use `superpowers:finishing-a-development-branch`. Per cycle-1 precedent, the user may prefer a PR for review. Mention Issue #4 items addressed: multi-surface break ✓, tiles-immutable test ✓, jump tests ✓, strengthened carry ✓ (close the relevant checklist items on Issue #4).

---

## Self-review notes (for the implementer)

- **Spec coverage:** §1 hardening — multi-surface break (T1), tiles-immutable snapshot (T13), jump tests (T2), strengthened carry (T1). §3 components/systems/SYSTEM_ORDER (T4,T7,T8). §4 surface model (T1,T5). §5 spring (T6), conveyor (T5), checkpoint+finish (T7), walker+stomp+hazard (T8,T9). §6 respawn+invuln+lives (T3,T10,T11). §7 determinism + new golden master (T13). §8 renderer (T12). §9 tests across all. §10 demo-2 (T13). All map to tasks.
- **Determinism:** new systems use no `Math.random`/time/DOM/audio; walker probes tiles deterministically; removals queued→flushed in lifetime; tiles never mutated (tested).
- **Type consistency:** `body.support` descriptor shape, `surfaceOf`, `walkerSystem`, `triggerSystem`, `canRespawnInPlace`/`respawn`, `STOMP_BOUNCE`, `CONVEYOR_MAX`, `world.checkpoint`/`playerDied`/`levelClear`/`playerSpawn` used identically across tasks.
- **Ordering risk:** `SYSTEM_ORDER` becomes input→movement→walker→physics→collision→trigger→lifetime; support set in collision (tick N), applied in movement (tick N+1), cleared in physics (tick N+1) — consistent cross-tick, carry test green.
