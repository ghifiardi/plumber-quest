# ECS Core — design spec

**Date:** 2026-06-05
**Status:** Approved (brainstorming) — ready for implementation plan
**Scope:** Foundation only. This is the first of three cycles: **(1) ECS core ← this spec**, (2) mechanics framework, (3) level editor. Mechanics and the editor both build on this core and get their own spec → plan → build cycles.

## 1. Goal & non-goals

**Goal.** Add a second, **data-driven** simulation path to the engine: an Entity-Component-System (ECS) where new levels, entities, and (later) mechanics are authored as plain JS data instead of hand-coded. Prove it end-to-end with one new level, `demo-1` (player + moving platform + tile ground), running on the existing fixed-timestep loop and rendered by the existing renderer.

**Non-goals.**
- Do **not** touch `src/game/*` (classic sim) or its golden-master fingerprint. The shipped 6 levels stay bit-for-bit identical (the **Coexist** decision).
- No full sparse-set ECS. Entities are plain objects with namespaced component bags (pragmatic Option A).
- No enemies/powerups/bricks *implemented* in this cycle — but their event names and capability tags are reserved so the mechanics cycle is additive (§7).
- No editor in this cycle — but the data format and loader are editor-friendly (§6).

## 2. Architecture

The ECS is a second sim path behind a **facade** so `main.js` never branches on sim type.

```
src/sim/
  sim.js            — JSDoc typedefs only (the facade contract; NOT runtime abstraction)
  classic-adapter.js— wraps existing `world` into the facade shape (no change to src/game/)
src/ecs/
  entity.js         — makeEntity(id, components) → { id, c: { ...bags } }
  world-ecs.js      — EcsWorld: entity registry, tile layer, spawn counter, event queue,
                      step(input) running SYSTEM_ORDER. Implements the facade directly.
  components.js      — component factory templates + the type→components registry
  loader.js          — definitionToWorld(def): validate, default, build EcsWorld
  view.js            — ecsWorldToRenderView(world) → render view in the shape renderer.js expects
  systems/
    index.js         — SYSTEM_ORDER (the deterministic schedule)
    input.js · movement.js · physics.js · collision.js · trigger.js · lifetime.js
src/engine/
  tile-collision.js  — pure tile/AABB helpers written fresh for ECS (NOT extracted from
                       game/tiles.js — that would touch src/game/*). Classic may adopt later.
src/levels/ecs/
  demo-1.js          — first data-driven level (acceptance vehicle)
```

**Boundaries (consistent with existing architecture rules):**
- `EcsWorld` is the single source of truth; stepped deterministically; **read-only to the renderer** (guarded by the existing `renderer.draw mutates nothing` test against the ECS view).
- Systems are **pure over the world**: read/write component data only. No DOM, canvas, audio, `Math.random`, or wall-clock time.
- Cosmetic state (anim clocks, squash, transitions, particles) stays in the existing event-driven FX layer — unchanged.
- ECS reuses only **pure** primitives: `aabb.js`, `constants.js`, raw tile IDs, and `engine/tile-collision.js`. It never imports the classic `world` shape.
- **`tile-collision.js` is introduced for ECS first.** It is written fresh (not extracted from `game/tiles.js`, which would modify `src/game/*` and is off-limits this cycle). The classic sim keeps its existing in-place tile logic; adopting the shared helper for classic is deferred to separate work with its own regression pass.
- `ecs-adapter.js` and `sim.reset()` are **not** created. `EcsWorld` implements the facade itself; each level load constructs a fresh sim, so no reset is needed. Add them only if a real mismatch appears.

### 2.1 Facade contract (`src/sim/sim.js`, JSDoc typedefs)

Both `classic-adapter` and `EcsWorld` satisfy:

```js
sim.update(dt, input)      // advance one fixed 1/60 tick
sim.drainEvents()          // return the accumulated event list AND clear the queue
                           //   (matches classic world: `const e = events; events = []; return e`)
sim.getStatus()            // → { timeUp, fell, playerDied, levelClear }  (lifecycle signals)
sim.getCameraTarget()      // → { x, y, w, h, facing? }  (dims + facing for look-ahead)
sim.getBounds()            // → { left, top, right, bottom }  (camera clamp bounds — the shape
                           //   createCamera()/clampX expect; NOT {w,h})
sim.getRenderView()        // → immutable-by-convention view model the renderer consumes
```

`getRenderView()` is read-only **by convention**; the renderer-readonly test is the enforcing guard — we don't deep-freeze or overbuild immutability unless a test catches mutation.

**Lifecycle / game-state coupling (resolved).** `createGameState()` currently branches on classic fields directly — `world.playerDied || world.fell || world.timeUp` → `dying`, `world.flagReached` → `levelClear` (game-state.js:76-77). This cycle **`game-state.js` is updated to read those signals through `sim.getStatus()` instead of poking `world.*`**, so it works against either sim path. The classic adapter derives `getStatus()` from the existing `world` fields (read-only — no change to `src/game/*`); `EcsWorld` derives them from its own state (player death/fall/out-of-bounds; `levelClear` from a `finish` trigger, which is a no-op stub until the mechanics cycle, so `demo-1` simply never reports `levelClear`). The scripted dying/levelClear **animations** stay owned by `game-state.js` (`_scriptT`) — no `beginScripted`/`updateScripted` facade methods are needed.

## 3. Entity & component model

**Entity shape** — namespaced bags to avoid collisions; presence check is `'name' in e.c`:

```js
{ id: 7, c: { transform: {...}, body: {...}, sprite: {...}, mover: {...} } }
```

**Component set for `demo-1`:**

| Component | Fields | On |
|---|---|---|
| `transform` | `x, y, w, h` | every entity (the AABB) |
| `body` | `vx, vy, onGround, gravity, standingOn` | dynamic (player) |
| `control` | `accel, maxVx, facing` | player (horizontal intent) |
| `jump` | `jumpV, coyote, buffer, jumped, heldPrev` | player (vertical jump state machine) |
| `mover` | `axis, dist, speed, origin, phase, solid, delta` | moving platform (kinematic) |
| `sprite` | `id, anim, facing` | anything drawn |

Notes:
- **Jump state lives in a dedicated `jump` component** so coyote-time + input-buffering + edge-detected jump (the `jumped` event) are expressible. Without it the `jump` event would promise behavior the model can't produce.
- `body.standingOn` holds the id of the `mover` an entity rests on (or `null`) — the carry mechanism (§5.3).
- `mover.delta` is the per-tick displacement the movement system records, consumed by carry.
- No separate `collider` — the AABB is `transform`.

## 4. Tilemap vs. entities

Static ground/walls are **level tile data, not entities.**

- `def.tiles` is a solid tile layer (grid of tile IDs, 16px cells) owned by `EcsWorld` as `world.tiles`.
- Tile collision uses `engine/tile-collision.js` against `world.tiles`.
- **Entities are only dynamic/interactive objects** (player, moving platforms, and — later — enemies, pickups, springs). This keeps entity counts low and matches the classic sim's tile/entity split.

## 5. Systems & schedule

### 5.1 `SYSTEM_ORDER` (determinism anchor — explicit and boring)

```
1. input      — read facade input; write intent onto `control`/`jump` (no physics).
                edge-detect jump press → set jump.buffer; decay buffer/coyote timers.
2. movement   — apply carry FIRST: for each entity with body.standingOn, add that
                mover's recorded `delta` to its transform (see §5.3).
                Then apply control intent to body.vx; resolve jump (coyote+buffer) → body.vy.
                Then advance kinematic movers along axis, recording `mover.delta`.
3. physics    — body.onGround = false; apply gravity to body.vy; integrate transform
                from body.v (clamp to terminal velocity from constants.js).
4. collision  — tile resolve via engine/tile-collision.js (sets onGround on landing);
                entity-vs-entity (stomp/hazard/collectible tags, §7); set body.standingOn
                when an entity rests on a `mover.solid` top.
5. trigger    — STUB this cycle (checkpoints/switches/finish land in the mechanics cycle).
6. lifetime   — out-of-bounds cull (below level / past extents); **flush the spawn/remove
                queue here** — the single known structural-mutation point. Nothing iterates
                entities after this step.
```

### 5.2 Structural mutation discipline

- `world.spawn(e)` / `world.remove(e)` only **enqueue**. Queues flush exclusively in `lifetime` (step 6).
- Stable **insertion-order** iteration everywhere; entities are never reordered.
- No system 1–5 ever observes a mid-tick add/remove.

### 5.3 Moving-platform carry — precise rule (cross-tick, no double-move)

To avoid one-frame lag *and* double-application, carry is split across the well-defined ordering:

1. In **collision** (step 4), when an entity's feet rest on a `mover.solid` top, set `body.standingOn = mover.id`; otherwise `null`.
2. In **movement** (step 2) of the **next** tick, *before* applying control/gravity/integration, each entity with `body.standingOn` has that mover's **previous-tick `mover.delta`** added to its `transform`. The mover then advances and records its **new** `delta` later in the same step.

This is deterministic and applies each mover's displacement to its rider exactly once per tick. The rider tracks the platform with at most one tick (~16ms) of visually-imperceptible lag, and never double-moves. (If a future need demands zero-lag carry, it must move riders within the same collision pass with an explicitly redefined order — out of scope here.)

## 6. Loader: validation & defaults

`loader.js: definitionToWorld(def)` **validates — never maps blindly.** It throws on structural errors (fail fast at load, before the sim runs).

Rules:
- `def.meta` must have `name` (string) and `w, h` (finite numbers) → else throw naming the field.
- `def.tiles` must be present and rectangular (`h` rows × `w` cols of tile IDs) → else throw.
- Each `entity.type` must exist in the `components.js` registry → else throw listing the unknown type.
- Build each entity by **deep-merging** the type's component template with the entity's inline component overrides.
- **Exactly one** `player`-type entity → throw on 0 or >1.
- Every entity needs finite `x, y`.
- **Reject unknown component names by default.** The only permitted non-component inline bags are `editor` and `meta` (reserved for editor round-tripping and forward-compat); any other unknown key throws. This is stricter than the earlier draft and prevents silent typos while still leaving the editor an escape hatch.
- Assign `id` from a spawn counter **reset to 0 per load**, monotonic thereafter.

### 6.1 Authoring format (JS object modules)

```js
// src/levels/ecs/demo-1.js
export default {
  meta:  { name: 'Demo 1', w: 200, h: 15 },
  tiles: [ /* h rows × w cols of tile IDs (solid layer) */ ],
  entities: [
    { type: 'player',   x: 32, y: 96 },
    { type: 'platform', x: 80, y: 120, move: { axis: 'x', dist: 48, speed: 0.5 } },
  ],
}
```

## 7. Event compatibility & capability tags

ECS systems emit the **same `{ type, x, y, … }` event strings** the classic sim emits, so `effects.handle`, `audio.playEvent`, `haptic`, `social`, and `hitstop` in `main.js` work **unchanged** through `drainEvents()`.

**Exercised this cycle** (player + platform): `jump` (edge-detected, incl. coyote/buffer), `flag-reached` is *reserved* (no flag entity yet — see below).

**Compatibility event names — wired in the mapping, exercised when their tag-bearing entity types arrive in the mechanics cycle:**

| Event `type` | Driven by capability tag | Cycle that adds the entity |
|---|---|---|
| `enemy-stomped` | `stompable` | mechanics |
| `player-hit` / `player-died` | `hazard` (+ player power state) | mechanics |
| `coin-collected` / `powerup-collected` | `collectible` | mechanics |
| `brick-broken` / `block-hit` | `breakable` | mechanics |
| `flag-reached` | `finish` | mechanics |

The **capability-tag vocabulary** (`stompable`, `hazard`, `collectible`, `breakable`, `finish`) is reserved now and recognized by the collision/trigger systems as no-ops until entities carry them. New ECS-only mechanics (e.g. `spring-bounce`, `checkpoint`) get **new** type strings registered additively — never renaming existing ones.

Events accumulate across all fixed steps of a rendered frame and are returned-and-cleared by `drainEvents()` (classic semantics). Emission order is deterministic: system order → entity insertion order.

## 8. Rendering

`view.js: ecsWorldToRenderView(world)` builds a view in the shape `renderer.js` already consumes (entities with position/sprite/facing, camera info, tile layer). Goal: the existing renderer needs **minimal, additive** change. A dedicated `src/render/ecs-renderer.js` is added **only** if the view cannot be massaged to fit — not preemptively.

Two concrete renderer gaps must be closed for `demo-1` to draw (verified against current `renderer.js`):

1. **Flagpole guard.** `renderer.draw()` unconditionally calls `drawFlagpole(world, …)`, which reads `world.level.finish.x` (renderer.js:112,217). `demo-1` has no finish. **Fix:** guard the call — `if (view.level?.finish) drawFlagpole(...)`. This is an additive, behavior-preserving change (classic levels always have `finish`, so they're unaffected).

2. **Moving-platform drawing.** The renderer only draws known entity types (`goomba`, `koopa`, and `ENT_SPRITE` → `mushroom/flower/fireball`; renderer.js:116-128); a `platform`/`mover` entity would be **invisible**. **Fix (this cycle):** add minimal `platform` support — `ecsWorldToRenderView` emits the platform as a drawable with `type:'platform'` + its `transform`, and the renderer draws it as a solid tile-strip rectangle (16px cells) using the existing tile palette. No new art required.

Both renderer edits are additive and covered by the renderer-readonly test (they must still mutate nothing).

## 9. Determinism contract (enforced)

- Stable insertion-order iteration; entities never reordered.
- Structural add/remove queued, flushed only in `lifetime`.
- Monotonic spawn counter, reset to 0 per level load.
- No `Math.random`, wall-clock time, DOM, audio, or canvas inside any system.
- Events emitted in deterministic (system → entity) order.
- Fixed 1/60 timestep via the existing loop.

## 10. Testing & acceptance

- **ECS golden-master fingerprint test** (new): run `demo-1` headless for a fixed scripted input sequence over N ticks; hash the world state (entity transforms/bodies + event log) into a fingerprint that must stay green — the ECS-path analog of the classic fingerprint. This is the determinism guard.
- **Renderer-readonly test** extended to the ECS render view: `ecsWorldToRenderView` + a draw must mutate nothing.
- **Loader validation tests:** unknown type, unknown component key, 0/2 players, non-rectangular tiles, missing meta fields → each throws with a clear message; the `editor`/`meta` bags are accepted.
- **Carry test:** a player standing on an x-axis platform moves with it exactly one platform-delta per tick, no drift/double-move.
- **Facade-parity tests:** `getBounds()` returns `{left,top,right,bottom}` and feeds `createCamera` without error; `getStatus()` returns `{timeUp,fell,playerDied,levelClear}` from both adapters; `game-state.js` drives `dying`/`levelClear` transitions off `getStatus()` for a forced ECS player-death and (classic) flag-reach.
- **Renderer-gap tests:** drawing a finish-less ECS view does not throw (flagpole guard); a `platform` entity produces visible pixels (platform draw support).
- **Classic regression:** the existing **138/0** suite — including the classic golden-master fingerprint — stays green, proving Coexist.

**Acceptance:** `demo-1` is playable on the ECS path through the facade — player runs/jumps (coyote+buffer), rides the moving platform, the existing renderer draws it, existing audio/haptics/particles fire from ECS events — with the classic game untouched and all tests green.

## 11. Out of scope (future cycles)

- Mechanics: springs, conveyors, checkpoints, switches/triggers, enemies, pickups, hazards, finish (cycle 2).
- Level editor + entity inspector + hot-reload (cycle 3).
- Porting the 6 classic levels to ECS (not planned; Coexist keeps them on the classic path).
