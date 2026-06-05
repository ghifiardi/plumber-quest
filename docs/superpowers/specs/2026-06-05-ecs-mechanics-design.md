# ECS Mechanics Framework — design spec

**Date:** 2026-06-05
**Status:** Approved (brainstorming) — ready for implementation plan
**Cycle:** 2 of 3 (1: ECS core ✓ shipped · **2: mechanics ← this spec** · 3: level editor). Builds on the merged ECS core (`docs/superpowers/specs/2026-06-05-ecs-core-design.md`).

This cycle adds a **mechanics framework** to the ECS path — springs, conveyors, checkpoints, a finish trigger, and one stompable enemy — as reusable components + systems, and folds in the required hardening from the ECS-core review (GitHub Issue #4). The classic sim stays untouched and byte-identical.

---

## 1. Required hardening (Issue #4) — acceptance-blocking

These are **requirements of this cycle, not optional cleanup.** This cycle is what exercises the latent bugs, so they ship with it.

1. **Multi-surface `break` (blocking).** `src/ecs/systems/collision.js`'s rest-on-surface pass currently tests a body against *every* solid surface and lets the last match win. This cycle adds springs + conveyors as additional solid surfaces, making last-writer-wins a real bug. The pass must record the **first-contacted** support and `break`. Acceptance: a test with two adjacent surfaces asserts the rider rests on the first one (by `body.support.entityId`).
2. **`_solid` cache deferral, made defensible.** `world._solid` is cached once from `world.tiles`. This cycle adds **no mutable tiles** (all new mechanics are entities, not tiles), so the cache stays valid. Encode the invariant explicitly — *Cycle 2 never mutates `world.tiles` after load* — and guard it with a **structural snapshot test**: capture the full tile-ID grid before a scripted `demo-2` run and assert it is structurally identical after. (Breakable-tile invalidation stays deferred to a later cycle.)
3. **Targeted jump tests.** Add direct unit tests for `movement.js` jump mechanics that the golden master only covers indirectly: jump-cut (`vy *= jumpCut` on early release), coyote-time decay, input-buffer pre-press.
4. **Stricter carry assertion.** Rewrite the cycle-1 carry test to assert the platform-specific support directly via `body.support.entityId` (no `|| onGround` escape that could pass on plain ground).

---

## 2. Goal & non-goals

**Goal.** A reusable mechanics framework on the ECS path: surface effects (spring, conveyor), overlap triggers (checkpoint, finish), and a mobile hazard (stompable enemy), proven end-to-end by a new playable level `demo-2`. Validate that the cycle-1 architecture pays off — the `trigger` primitive is reused twice, the surface model generalizes movers/conveyors/bouncers/solids.

**Non-goals (deferred, reserved tags stay unused):**
- No power-up/damage tiers (small/big/fire). Hazard contact = death. The `collectible` tag stays reserved.
- No breakable tiles. The `breakable` tag stays reserved; no `world.tiles` mutation (§1.2).
- No ECS level timer, no scripted flag-slide/celebration on finish (`timeUp` stays false; `beginScripted` stays a no-op for ECS).
- No change to the classic sim (`src/game/*`) or its golden-master fingerprint.

---

## 3. Architecture additions

All additive; cycle-1 boundaries hold (deterministic sim, renderer read-only of world, ECS reuses only pure primitives, structural mutation queued and flushed only in `lifetime`).

**New components** (templates in `components.js`):

| Component | Fields (defaults) | On |
|---|---|---|
| `bouncer` | `bounceV:360, solid:true` | spring |
| `conveyor` | `pushX:60, solid:true` | conveyor |
| `trigger` | `tag:'checkpoint', fired:false, spawnX:null, spawnY:null` | checkpoint, finish |
| `walker` | `speed:40, dir:-1` | enemy |
| `tags` | array, e.g. `['stompable','hazard']` | enemy |

**Evolved `body`** (cycle-1 `body` was `{vx,vy,onGround,gravity,standingOn}`):
```
body = { vx, vy, onGround, gravity, support, invuln }
```
- `support` replaces `standingOn` — a descriptor (§4), or `null`.
- `invuln` — seconds of post-respawn invulnerability (decremented in `physics`; the renderer's existing blink keys on it).

**New `TYPE_REGISTRY` entries:**
- `spring`: `transform + bouncer + sprite`
- `conveyor`: `transform + conveyor + sprite`
- `checkpoint`: `transform + trigger(tag:'checkpoint') + sprite`
- `finish`: `transform + trigger(tag:'finish') + sprite`
- `enemy`: `transform + body + walker + sprite + tags(['stompable','hazard'])`

**New / promoted systems:**
- `walkerSystem` (NEW, `src/ecs/systems/walker.js`) — enemy patrol.
- `triggerSystem` — promoted from the cycle-1 no-op stub in `index.js` into `src/ecs/systems/trigger.js` (checkpoint + finish).
- Surface-effect + enemy-interaction logic extends `collision.js`.

**`SYSTEM_ORDER`** (the determinism anchor) becomes:
```
input → movement → walker → physics → collision → trigger → lifetime
```

**New world state** (on `EcsWorld`): `checkpoint` (`null | {x,y}`), `playerDied` (bool), `levelClear` (bool). `getStatus()` → `{ timeUp:false, fell, playerDied: this.playerDied, levelClear: this.levelClear }` (where `fell` = player transform below bounds, as today).

**Note on two distinct "tag" concepts:** `trigger.tag` names the *kind* of trigger (`'checkpoint'`/`'finish'`); `c.tags` is the capability-marker array on an entity (`'stompable'`,`'hazard'`). Different fields, documented to avoid confusion.

---

## 4. Surface model (generalized support)

Replaces cycle-1's `body.standingOn = moverId`. Collision records, on the supported body:

```js
body.support = {
  entityId,                 // always present — stable hook for tests/future mechanics
  kind,                     // 'mover' | 'bouncer' | 'conveyor' | 'solid'
  deltaX: 0, deltaY: 0,     // mover carry displacement (captured at collision time)
  pushX: 0,                 // conveyor horizontal push
  bounceV: 0,               // (recorded for completeness; spring acts via impulse, §5)
}
```

**Reset rule (physics, every tick, before collision rebuilds it):**
```
body.onGround = false; body.support = null;
```
**Support detection (collision, rest pass):** test the body against each solid surface entity; on the **first** contact that establishes support, record the descriptor and **`break`** (Issue #1.1). `deltaX/deltaY` are captured from the supporting mover's `mover.delta` at collision time — equal to the value cycle-1's carry read the next tick, so carry behavior is byte-identical and the (strengthened) carry test stays green.

**Apply-support (movement, step 1 — next tick):**
- `kind:'mover'` → `transform.x += deltaX; transform.y += deltaY` (carry, unchanged semantics).
- `kind:'conveyor'` → `body.vx = clamp(body.vx + pushX, -maxVx, +maxVx)` where `maxVx` is the rider's `control.maxVx` if present, else a global cap constant. Prevents conveyors stacking into unbounded `vx`.
- `kind:'solid'` / `'bouncer'` → support only, no displacement.

---

## 5. Mechanics in detail

### 5.1 Spring (`bouncer`)
A **collision response (impulse), not a support state.** In `collision`, when a body crosses onto a `bouncer` top (same prev→current bottom crossing as a stomp, §5.5): set `body.vy = -bounceV`; **do not record support and do not set `onGround = true` that frame** (the body leaves the surface). Emit **`spring-bounce`** (new event). Entity: `transform + bouncer + sprite`.

### 5.2 Conveyor (`conveyor`)
A solid surface that pushes its rider horizontally. On rest, record `support = { kind:'conveyor', pushX, entityId }`; `onGround = true` while supported. The push is applied **next tick** in `movement` (clamped, §4) — collision never mutates horizontal motion mid-pass. No event (continuous). Entity: `transform + conveyor + sprite`.

### 5.3 Checkpoint (`trigger`, tag `'checkpoint'`)
`triggerSystem`: on player–trigger overlap and `!trigger.fired` → set the **respawn transform** and mark one-shot:
```js
world.checkpoint = { x: trigger.spawnX ?? transform.x, y: trigger.spawnY ?? transform.y };
trigger.fired = true;          // one-shot — never re-fires
```
Emit **`checkpoint`** (new event). Entity: `transform + trigger + sprite`.

### 5.4 Finish (`trigger`, tag `'finish'`)
`triggerSystem`: on player–trigger overlap, **guarded by `world.levelClear`** so it fires exactly once:
```js
if (!world.levelClear) { world.levelClear = true; world.emit({ type:'flag-reached' }); }
```
(The `levelClear` guard is the finish's one-shot — `trigger.fired` is unused for finish.) No timer, no flag-slide. Entity: `transform + trigger + sprite`.

### 5.5 Stompable enemy (`walker` + tags `stompable,hazard`)
Entity: `transform + body + walker + sprite + tags`. Has gravity.

**`walkerSystem`** (between `movement` and `physics`): set `body.vx = dir * speed`; **flip `dir`** when a wall is ahead (solid tile probe at the front edge) **or** a ledge is ahead (no solid tile below the front edge). Deterministic — tile probes via `makeSolid`, no RNG/time.

**Player-vs-enemy (collision, after tile + surface passes) — explicit priority:**
1. **Stomp check first.** Using prev→current bottom crossing (robust, not "feet near top"):
   ```
   prevBottom <= enemyTop + tol && currentBottom >= enemyTop && player.body.vy > 0
   ```
   → `world.remove(enemy)` (queued; flushed in `lifetime`), `player.body.vy = STOMP_BOUNCE`, emit **`enemy-stomped`** (existing event).
2. **Else hazard damage**, only if not stomped **and** `player.body.invuln <= 0`: `world.playerDied = true`, emit **`player-died`** (existing event). While `invuln > 0`, hazard is a **no-op for death** but does **not** block movement or stomp resolution.

---

## 6. Respawn, invulnerability & lives

**Facade additions (two methods):**
```js
sim.canRespawnInPlace()   // → boolean
sim.respawn()             // reset player to last checkpoint/spawn (ECS); see below
```
- **ECS (`EcsWorld`):** `canRespawnInPlace()` → `true`. `respawn()`:
  - position → `world.checkpoint ?? playerSpawn`;
  - `body.vx = body.vy = 0`;
  - clear support / `onGround` (`body.support = null; body.onGround = false`);
  - clear jump state (`jump.buffer = 0; jump.coyote = 0; jump.jumped = false; jump.heldPrev = false`);
  - `body.invuln = 1.2`;
  - `world.playerDied = false`.
- **Classic (`classic-adapter`):** `canRespawnInPlace()` → `false`; `respawn()` is a no-op. The full-reload-on-death behavior stays owned in `game-state` (where it already lives) — the adapter does not gain factory/session context.

**`body.invuln`** decremented each tick in `physics` (`invuln = max(0, invuln - dt)`); the renderer's existing player blink keys on `player.invuln` (now real, was hardcoded 0). Hazard damage suppressed while `invuln > 0` (§5.5).

**`game-state` respawn branch** (additive; `dying`-script completion):
```
decrement a life;
if (lives <= 0) → gameOver;
else if (sim.canRespawnInPlace()) → sim.respawn(); state = playing;   // straight to play, NO intro card
else → loadLevel(); enterIntro();                                      // today's classic path, unchanged
```
Lives economy preserved (death still costs a life, gameOver at 0). Checkpoint respawn goes **straight to `playing`** — no intro card (that would read as a level reload). Hit-stop / lingering FX are cleared externally by the host loop on the respawn transition (same place `effects.clear()` already runs on state changes).

---

## 7. Determinism

- New systems obey the cycle-1 contract: no `Math.random`, wall-clock, DOM, audio, or canvas. Stable insertion-order iteration. Enemy removal queued via `world.remove`, flushed only in `lifetime`.
- `walkerSystem` turning is deterministic (tile probes only). `triggerSystem` is order-deterministic (system → entity insertion order); checkpoint is one-shot via `trigger.fired`, finish is one-shot via the `world.levelClear` guard.
- **Tiles-immutable invariant (testable):** capture the full tile-ID grid before a scripted `demo-2` run; assert it is **structurally identical** after (deep snapshot, not a spot-check). This makes the `_solid` cache deferral defensible.
- New events `spring-bounce`, `checkpoint` are additive; emission order deterministic.
- **New ECS golden-master** fingerprint over `demo-2` (player + platform + conveyor + spring + checkpoint + enemy + finish) for a fixed scripted input sequence. The cycle-1 `demo-1` golden master and the classic golden master both stay green.

---

## 8. Renderer

Additive and read-only (the `renderer.draw mutates nothing` rule holds):
- `ecsWorldToRenderView` emits the new entity types with transforms; the renderer gains minimal branches: **enemy → reuse the existing goomba sprite frames**; **spring / conveyor / checkpoint / finish → plain sprite or colored-strip markers** (reuse existing block sprites / flat fills, **no new art**).
- **These markers are intentionally plain and temporary** — a Track B / dedicated art pass can replace the visuals later without touching sim or view logic.
- `renderer-readonly` test extended with a view containing every new entity type (must mutate nothing).
- Player blink now driven by real `player.invuln`.

---

## 9. Testing & acceptance

TDD; in-browser harness (`tests/*.test.js`, registered in `tests/index.html`, run via `bash tools/run-tests.sh`). Baseline before this cycle: **PASS 178 / FAIL 0**.

**Hardening (§1):** multi-surface `break` (first-contact wins by `support.entityId`); tiles-immutable structural snapshot; jump-cut / coyote / buffer; strengthened carry assertion.

**Mechanics (§5):** spring impulse (`vy` up, no support, no `onGround` that frame, emits `spring-bounce`); conveyor push **+ clamp** (no unbounded `vx`); checkpoint sets respawn transform + one-shot + emits `checkpoint`; finish → `levelClear` + single `flag-reached`; walker turns at wall **and** ledge; stomp via prev→current bottom crossing → `enemy-stomped` + bounce + enemy removed; hazard → `player-died` + `playerDied`, suppressed while `invuln > 0`, stomp-before-hazard priority.

**Respawn/lifecycle (§6):** `respawn()` clears the full transient set (pos, vel, support, onGround, jump buffer/coyote/jumped, sets invuln, clears playerDied); `canRespawnInPlace()` ECS=true / classic=false; game-state in-place respawn (straight to `playing`, life decremented, gameOver at 0) vs classic full-reload path stays green.

**Renderer (§8):** finish-less / new-entity view draws without throwing; mutates nothing.

**Integration (browser smoke, like cycle 1):** `?ecsdemo=2` boots with **no console exceptions** and does **not** break `?ecsdemo=1` or the classic path.

**Acceptance:** `demo-2` is playable on the ECS path — the player rides a moving platform, crosses a conveyor, springs to a ledge, passes a checkpoint, stomps an enemy, and reaches the finish — with respawn-at-checkpoint provable (tests + optional manual), the classic game untouched, and all tests green (178 baseline + the new cycle-2 tests).

---

## 10. Demo level (`demo-2`)

The acceptance vehicle (`src/levels/ecs/demo-2.js`, launched via `?ecsdemo=2`; `demo-1` is kept for basic-path regression). Main completion path, left→right:

1. start on ground → **moving platform** over a gap (reuses cycle-1 mover);
2. a **conveyor** stretch (push assists/opposes movement);
3. a **spring** to bounce up to a higher ledge;
4. a **checkpoint** on the ledge;
5. a **stompable enemy** on the path to stomp;
6. a **finish** trigger.

**The hazard (death) path is NOT required for normal completion** — place a hazard enemy/spot in an **optional side pocket** off the main route, so the acceptance run completes without dying. Respawn-at-checkpoint is proven by deterministic tests (and optionally a manual poke into the side pocket), not by the happy-path run.

---

## 11. File structure (additive)

- New: `src/ecs/systems/walker.js`, `src/ecs/systems/trigger.js`, `src/levels/ecs/demo-2.js`.
- Modify: `src/ecs/systems/index.js` (SYSTEM_ORDER + import real triggerSystem), `collision.js` (surface model + `break` + spring impulse + enemy interaction), `physics.js` (clear support, decrement invuln), `movement.js` (apply-support incl. conveyor clamp; read `body.support`), `components.js` (new templates + registry + tags), `world-ecs.js` (`checkpoint`/`playerDied`/`levelClear` state, `canRespawnInPlace`/`respawn`, getStatus), `view.js` + `renderer.js` (new entity draws), `classic-adapter.js` (`canRespawnInPlace`→false, `respawn` no-op), `game-state.js` (in-place respawn branch).
- Tests: extend `ecs-systems.test.js`; new `ecs-mechanics.test.js`, `ecs-respawn.test.js`, `ecs-determinism-2.test.js`; extend `renderer-readonly.test.js`, `game-state.test.js`, `classic-adapter.test.js`.

---

## 12. Out of scope (future cycles)

- Power-up/damage tiers + collectibles (`collectible` tag) — later cycle.
- Breakable tiles (`breakable` tag) + `_solid` cache invalidation — later cycle.
- ECS level timer + scripted finish celebration.
- Level editor (cycle 3).
- More enemy types / boss, themed worlds, world-map progression (roadmap tracks B/C/D).
