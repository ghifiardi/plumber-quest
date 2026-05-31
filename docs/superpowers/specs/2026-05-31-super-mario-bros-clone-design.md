# Super Mario Bros–style Platformer — Design Spec

**Date:** 2026-05-31
**Status:** Approved design, pending implementation plan
**Location:** `/Users/raditio.ghifiardigmail.com/2026/Project/GAME`

## 1. Summary

A side-scrolling platformer in the spirit of *Super Mario Bros* (1985): run, jump,
stomp enemies, collect coins, grab power-ups, and reach the flagpole. Built as a
zero-dependency, zero-build browser game using vanilla HTML5 Canvas + ES modules,
with original (Mario-*inspired*) procedurally drawn pixel art and fully synthesized
audio. Ships to GitHub Pages as a static site.

All visual and audio assets are **original**, generated in code — no Nintendo IP,
nothing to license, no binary asset files.

## 2. Goals & Scope

### Committed scope
- **3 levels** (`world-1-1`, `world-1-2`, `world-1-3`) with progression and a final win screen.
- **Core platforming:** run with acceleration/friction, variable-height jump
  (release-to-cut), coyote-time, jump-buffer, gravity, stomp enemies, coins, score,
  lives, death by enemy/falling, flagpole goal, countdown timer.
- **Power-ups:** mushroom (`small → big`), fire flower (`big → fire`); damage steps
  down one tier with brief invulnerability; hit while `small` ⇒ death. Fire state
  shoots fireballs (capped).
- **Enemies:** Goomba-like only (walk, turn at edges/walls, stomp-kill, side-damage).
- **Audio:** synthesized SFX (jump, stomp, coin, power-up, bump, fireball, death,
  flagpole) + a short looping melody, via Web Audio.
- **Data-driven levels:** ASCII-authored, parsed/validated into typed level data.
- **Headless-style browser tests** with a deterministic run-all page.
- **Deploy** to GitHub Pages; **code review** pass before deploy.

### Explicit stretch goal (not committed)
- **Koopa/shell enemy.** Self-contained enhancement, attempted only after the
  collision system, state machine, and deterministic tests pass. Shells add
  substantial complexity (interact with enemies, walls, player, and state).

### Out of scope (YAGNI)
- One-way / pass-through platforms.
- Moving/elevator platforms, enter-able pipes/warps.
- Multiple worlds beyond 1-x, save files, multiplayer, gamepad support.

## 3. Architecture

Plain ES modules (`<script type="module">`) loaded directly by the browser — no
build step. A fixed-timestep loop drives a deterministic simulation; rendering is
strictly read-only.

```
GAME/
├── index.html              # canvas + module entry, mobile viewport
├── style.css               # page chrome, integer scaling, frame
├── README.md               # controls, run, add-a-level, license note
├── LICENSE                 # MIT
├── src/
│   ├── main.js             # bootstrap: wire systems, own the loop, route events→audio
│   ├── engine/
│   │   ├── loop.js         # fixed-timestep loop (update/render split, interpolation)
│   │   ├── input.js        # keyboard → intent w/ explicit edges
│   │   ├── audio.js        # Web Audio synth: SFX + music
│   │   ├── camera.js       # side-scroll follow + clamp to level bounds
│   │   └── aabb.js         # AABB collision: reports geometric facts only
│   ├── game/
│   │   ├── game-state.js   # state machine + campaign/level progression
│   │   ├── world.js        # owns current-level entities + tilemap; steps physics
│   │   ├── player.js       # movement + power state machine
│   │   ├── enemies.js      # Goomba behavior (Koopa later)
│   │   ├── pickups.js      # mushroom, fire flower, coin (split from projectiles)
│   │   ├── projectiles.js  # fireball
│   │   └── tiles.js        # tile types + consequences (brick break, ?-block spawn)
│   ├── render/
│   │   ├── renderer.js     # draws world from camera + HUD (read-only)
│   │   └── sprites.js      # original pixel-art → offscreen canvases at startup
│   └── levels/
│       ├── level-format.js # parse + validate ASCII → typed level
│       ├── world-1-1.js
│       ├── world-1-2.js
│       └── world-1-3.js
└── tests/
    ├── index.html          # served over HTTP; single run-all entry + pass/fail summary
    └── *.test.js           # deterministic unit tests
```

### Module boundaries (dependency direction)
- **`input`** produces an intent object; nothing downstream knows actual key codes.
- **`game-state.js`** owns state transitions **and** campaign progression (loading the
  next level). Entity and tile code never load levels.
- **`world.js`** owns one level's simulation (entities + tilemap), steps physics,
  emits events, owns the entity lifecycle queue. Knows nothing about canvas.
- **`render/`** reads world state, never mutates it.
- **`aabb.js`** reports geometric facts (`hitFromBelow`, `landedOnTop`, `sideBlocked`);
  **`tiles.js`** decides consequences.
- **`levels/`** are pure declarative data validated through one parser — malformed
  levels fail loudly at load.
- **`audio.js`** is driven only by events forwarded from `main.js`. Entities never
  call audio.

If event routing in `main.js` grows cluttered, it graduates to a dedicated `events.js`.

## 4. Game loop (`loop.js`)

- Fixed-timestep accumulator, **`FIXED_DT = 1/60` second** (seconds, not ticks),
  used consistently everywhere.
- Per animation frame: accumulate real elapsed time, run
  `gameState.update(FIXED_DT, intent)` zero-or-more times, then one
  `renderer.draw(world, camera, alpha)`.

### Top-level update path
The loop never calls `world.update()` directly — different states behave differently
(`title`, `paused`, `dying`, `level-clear` must not run normal physics):

1. The loop calls **`gameState.update(dt, intent)`** each fixed step.
2. `gameState` calls **`world.update(dt, intent)` only during `playing`**; `dying`
   and `level-clear` run their own scripted-update path (§5); other states run no
   simulation.
3. `world.update()` remains the **sole** entry point for current-level simulation.
- **Max-frame-time clamp** prevents the spiral of death after a tab stall.
- **Interpolation:** before each fixed update, each entity snapshots its previous
  transform (`prev`). `renderer.draw(..., alpha)` lerps `prev → current` for smooth
  visuals **without mutating** simulation state.
- **Determinism:** the same intent sequence ⇒ the same world state. This is what
  makes the unit tests meaningful.

### Input edges (`input.js`)
Exposes `jumpPressed`, `jumpHeld`, `jumpReleased`, `firePressed` (and movement
held-states). The loop hands the **pressed** edge to only the **first** simulation
step in a frame; later steps that frame see held-only. A press is consumed exactly
once even when several steps run in one frame (covers 0, 1, and N steps/frame).

### Events
Emitted during every step and **retained**; **drained once after all fixed updates**
for the frame. `main.js` routes events only to external side effects (audio).
Score, coins, lives, and timer mutate **inside** simulation code.

### Entity lifecycle queue (`world.js`)
Iterate current entities → collect `spawn` and `remove` requests → **flush removals
first, then additions**. Newly spawned entities begin updating on the **next** fixed
step. Avoids mutation-during-iteration bugs.

### Collision resolution order
Stable, deterministic order within a step:
**tiles → pickups → enemies → projectiles → finish trigger.**

## 5. Game state machine (`game-state.js`)

| State         | Physics advances? | Game timer counts down? | Notes |
|---------------|:---:|:---:|---|
| `title`       | no  | no  | press-to-start |
| `playing`     | yes | yes | normal sim |
| `paused`      | no  | no  | overlay; resumes cleanly |
| `dying`       | scripted | no | death "pop" via own clock; input ignored |
| `level-clear` | scripted | no | flagpole sequence via own clock; then advance |
| `win`         | no  | no  | campaign complete (after 1-3); press to return to title |
| `game-over`   | no  | no  | out of lives ⇒ back to title |

- `dying` and `level-clear` use a **separate scripted-update path** with their own
  clock/animation progression — distinct from world physics.
- `level-clear` advances to the next `world-1-*`, or to **`win`** after 1-3.
- **Flagpole:** scripted **timer→score conversion** — remaining seconds drain into
  score over ~1–2s, *then* `level-clear` advances.

### Death & campaign rules
- **Timer reaching zero** triggers `dying`.
- **Falling** below the level bottom triggers `dying`.
- Hit while `small` triggers `dying`.
- **After `dying`:** decrement lives, then **reload the current level** if lives
  remain, else enter `game-over`.
- **Entering from `title`** resets persistent session values: **score, coins, lives,
  and level index**.

### Ownership of values
- **`game-state.js` owns persistent session values:** score, coins, lives, current
  level index. These survive level reloads and transitions.
- **`world.js` owns current-level values:** the countdown timer and all entities.
  Rebuilt on every level load/reload.

## 6. Entities & mechanics

### Player (`player.js`)
- Run with acceleration/friction (not instant velocity).
- Variable jump height (release-to-cut), coyote-time, jump-buffer.
- **Power state machine:** `small → big` (mushroom), `big → fire` (flower); damage
  steps down one tier with brief invulnerability; hit while `small` emits
  `player-died`.
- Fire state spawns **fireball** projectiles, **capped at 2 active per player**; the
  active count is decremented through the **lifecycle removal path** only — never via
  scattered callbacks.

### Enemies (`enemies.js`)
- Goomba-like: walk, turn at edges/walls; stomp kills (player bounces) ⇒
  `enemy-stomped`; side contact damages player.
- Koopa/shell: stretch goal only.

### Mechanics → events
Resolved from `aabb` facts. **Simulation applies the gameplay consequence first**
(mutate score/coins/lives/timer, break the brick, spawn the item, change power state),
**then emits a semantic event** purely for **external side effects** such as audio.
Events do not carry gameplay logic; nothing downstream mutates the world.
Events: `coin-collected`, `block-hit`, `brick-broken` (any **non-small** player,
including fire), `powerup-spawned`, `powerup-collected`, `enemy-stomped`,
`player-hit`, `player-died`, `fireball-fired`, `flag-reached`.

## 7. Level format (`level-format.js`)

Authored as an array of ASCII rows. Char set:

| Char | Meaning |
|------|---------|
| `X`  | ground (solid) |
| `#`  | brick (solid; **breaks for any non-small player**, including fire) |
| `?`  | one-shot **coin** block (solid) |
| `U`  | one-shot **adaptive upgrade** block: yields **mushroom while player is `small`, flower otherwise** (solid) |
| `o`  | coin |
| `T`  | solid pipe tile (collidable) |
| `\|` | pipe decoration (visual only, non-collidable) |
| `G`  | goomba spawn |
| `P`  | player spawn (**exactly one required**) |
| `F`  | finish trigger (**exactly one required**); flagpole rendered procedurally |
| `-`  | empty sky |
| ` `  | space — alias for `-` (formatting convenience) |

**Block lifecycle:** after a `?` or `U` block is bumped, it becomes an internal
**used-block** tile (solid, inert, distinct sprite). `#` bricks either break (non-small
player) or bounce (small player).

**Normalization:** spawn and trigger characters (`P`, `G`, `F`) **normalize to empty
tiles after parsing** — they place an entity / register the finish trigger, then leave
no solid tile behind.

### Typed output
The parser converts rows → typed level:

```js
{
  width, height,
  tiles: [[ { tile: 'upgrade-block' }, { tile: 'coin-block' }, ... ], ...],
  entitySpawns: [ { type: 'goomba', x, y }, ... ],
  playerSpawn: { x, y },              // exactly one
  bounds: { left, right, top, bottom },
  finish: { x, y }                    // exactly one trigger
}
```

Tile kinds are explicit (`'coin-block'`, `'upgrade-block'`, `'brick'`, `'ground'`,
`'pipe'`, `'pipe-deco'`, `'used-block'`, `'empty'`). The `upgrade-block` payload
(mushroom vs flower) is **decided at bump time** from the player's power state, not
baked into level data.

### Validation (throws at load)
- Not **exactly one** `P` (zero or duplicate player spawn).
- Not **exactly one** `F` (zero or multiple finish triggers — invalid finish layout).
- Ragged rows (inconsistent width).
- Unknown characters.

Level files (`world-1-*.js`) export **only** this declarative data — no callbacks, no
embedded behavior.

## 8. Rendering (`renderer.js` + `sprites.js`)

- `sprites.js` draws **original** pixel-art **once** into offscreen canvases at startup
  (hero, enemies, blocks, coins, flag, tiles) from small color-grid definitions.
  Mario-*inspired*, not Nintendo art.
- `renderer.draw` blits per the camera, applies interpolation `alpha`, draws a
  **parallax** sky/hill background, then the HUD (score, coins, lives, world, timer).
- **Parallax derived from camera position only** — no renderer-owned animation state.
- **Integer scaling** to fit the window, crisp pixels. **Fallback for small screens:**
  CSS may downscale fractionally while canvas drawing stays pixel-snapped.
- Strictly **read-only**: animation clocks advance during `update`, never `render`.

## 9. Audio (`audio.js`)

- Pure Web Audio synthesis — oscillators + envelopes for all SFX; a short looping
  melody for music. **Zero binary files.**
- **Unlock and resume** the `AudioContext` on user interaction; re-resume if the
  browser suspends it again (interruption/backgrounding).
- **Music and SFX scheduling are kept separate.**
- **Stop/reset scheduled music nodes** on pause, mute, level transitions, and return
  to title.
- **Global mute toggle that works before audio initialization.**

## 10. Testing (`tests/`)

Deterministic browser test page served over **HTTP** (never `file://`, since ES-module
loading varies by browser). A single **run-all** entry point with a clear pass/fail
summary.

Priorities (in order):
1. Collision edge cases — corner clips, tile-from-below.
2. Variable-height jump (full vs cut), coyote/buffer windows.
3. Stomp vs side-collision disambiguation.
4. Entity removal/spawn during update (lifecycle queue correctness).
5. Timer behavior across each state in §5.
6. Level validation — malformed levels throw (incl. **duplicate player spawn** and
   **invalid finish layout**).
7. **Determinism** — fixed intent script ⇒ exact expected world state.

Additional required tests:
8. Input-edge consumption across **0, 1, and multiple** fixed steps per frame.
9. Collision-order: player touches a pickup **and** an enemy in the same step.
10. Fireball **cap** and **decrement-on-removal**.
11. Flagpole **timer→score conversion** and **next-level transition**.
12. Renderer **smoke test**: drawing does **not** mutate serialized world state.

## 11. Deployment (GitHub Pages)

- `GAME/` is its **own standalone git repo** (`git init`, default branch `main`),
  independent of the home directory repo.
- Static site, **no build**. Push to a new GitHub repo (via `gh`), enable Pages with
  source = **`main` branch, repository root**.
- Because everything is vanilla ES modules + procedural assets, what runs locally is
  byte-identical to what Pages serves.
- **Local run:** `python3 -m http.server 8000` (documented in README).
- **`README.md`** documents controls, how to run, how to add a level, and that all
  assets are **original**.
- **`LICENSE`:** MIT.
- **Code review** pass over the diff before deploy.

## 12. Build sequence (high level)

**TDD is incremental:** each implementation slice **begins with its corresponding §10
tests** (red → green → refactor), not a single test phase at the end. A **final
green-test gate** still runs the full §10 suite deterministically before review/deploy.

1. Project skeleton: `index.html`, `style.css`, `main.js`, empty modules, HTTP-served
   test page with the run-all harness.
2. Engine core: `loop.js` (fixed-step + interpolation), `input.js` (edges), `aabb.js`.
   *(Tests: §10.1–10.3, 10.8.)*
3. **`game-state.js` skeleton** (state machine + session values + transitions) **before
   world integration**, so the update path (§4) and state rules (§5) exist up front.
   *(Tests: §10.5 timer/state behavior; death/campaign transitions.)*
4. `level-format.js` + `tiles.js` + `world-1-1`; `world.js` with movement & jump.
   *(Tests: §10.6 validation incl. duplicate-`P`/multiple-`F`; §10.2 jump.)*
5. Collision resolution order; lifecycle queue; events.
   *(Tests: §10.4 lifecycle; §10.9 same-step pickup+enemy order; §10.7 determinism.)*
6. Enemies (Goomba), pickups, power state machine, projectiles (fireball cap).
   *(Tests: §10.10 fireball cap & decrement-on-removal.)*
7. `camera.js`, `renderer.js`, `sprites.js` (procedural art), HUD, parallax.
   *(Tests: §10.12 renderer does not mutate world.)*
8. `audio.js` (SFX + music, lifecycle rules), event routing in `main.js`.
9. Flagpole sequence, timer→score, level progression, `world-1-2`, `world-1-3`, win screen.
   *(Tests: §10.11 timer→score & next-level transition.)*
10. **Final green-test gate:** full §10 suite passes deterministically.
11. README + LICENSE; code review; GitHub Pages deploy.
12. *(Stretch)* Koopa/shell enemy — with its own tests first.
