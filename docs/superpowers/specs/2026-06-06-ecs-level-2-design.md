# ECS Level 2 + auto-player — design spec

**Date:** 2026-06-06
**Status:** Approved (brainstorming) — ready for short implementation plan
**Scope:** Small content + test-harness piece on the shipped ECS engine/editor. Proves the engine/editor loop with a multi-mechanic, completable level beyond the flat proof-level `level-1`.

## 1. Goal & non-goals

**Goal.** Author a genuinely rich, **deterministically completable** ECS level (`level-2`) using the editor's compact-export format, and prove its completability with a reusable, boring **greedy auto-player** test helper. Make it loadable + playable in the editor (`?editor=1` level picker).

**Non-goals.** No new engine mechanics, no sim changes, no new launch param. Completion must NOT depend on spring physics or moving-platform timing (those stay as visible/recovery affordances). No frame-perfect scripts. Classic + all ECS golden masters stay green.

## 2. Components

### 2.1 Auto-player — `tests/helpers/ecs-autoplay.js` (TEST-ONLY, not `src/`)
It reads `EcsWorld` internals (`.entities`, `.tiles`) and is not product code, so it lives under `tests/helpers/`.

`autoPlay(world, budget) -> { cleared, ticks }`. Deterministic, boring heuristics:
- **Always hold `right`.**
- **Jump only on a rising edge** when the player is `onGround` **and** `jumpCooldown <= 0`; on jump, set `jumpPressed` this tick, then **hold `jumpHeld` for a fixed 6 ticks**, and set a small `jumpCooldown` so it doesn't re-fire mid-air.
- **On death/fall** (`getStatus().playerDied || .fell`): `world.respawn()` and continue (lives-free).
- Stop at `world.getStatus().levelClear` (return `cleared:true`) or when `budget` ticks elapse.

**Obstacle probes (generous, to avoid over-jumping):**
- **Edge/gap:** jump if there is no solid tile **one AND two tiles ahead, below the feet** (a single-tile probe over-reacts to tiny seams).
- **Wall/stall:** jump only after **several consecutive low-`vx` ticks** while `right` is held (not a single tick).
- **Enemy:** jump only if a `hazard`/`stompable` entity is **ahead and in roughly the same vertical band** as the player (so it ignores side-pocket enemies below/above).

Tile solidity via `makeSolid(world.tiles)` (`src/engine/tile-collision.js`); player/enemy state via `world.entities`.

### 2.2 `src/levels/ecs/level-2.js`
Editor compact-export style (char-legend `T` + row strings → `{tile}` cells + `export default`), loadable by `definitionToWorld()` **with no special casing**. Rich but **run-right-jump-solvable** on the main route:
- conveyor stretch (assists rightward),
- one or two **small jumpable gaps** (no moving-platform-timing dependency on the critical path),
- a **stompable enemy** on the path (auto-player jumps → stomps/clears),
- a **checkpoint**,
- a **spring** as a *recoverable/showcase* affordance (e.g. at the base of a dip so a mistimed fall bounces back) — **not** gating completion,
- a **finish**.

Geometry is **tuned by running the auto-player headlessly** until it completes within budget.

### 2.3 Editor level picker
Add `level-1` and `level-2` (static imports) to the editor's level-picker dropdown in `src/editor/editor.js`, so they load via `definitionToEditorModel` and can be **Played** in the editor — the on-theme proof of the author→load→play loop.

## 3. Testing
- **`tests/ecs-level-2-complete.test.js`:** `autoPlay(definitionToWorld(LEVEL2), BUDGET)` asserts `cleared` is true — assert "**clears within budget**", NOT an exact tick count (exact timing belongs to golden masters, not playability tests). BUDGET loose (e.g. 3000 ticks ≈ 50 s).
- **Auto-player unit test:** on a tiny crafted world, it jumps a wall and an edge (focused behavior check).
- **Regression:** full suite + classic + demo-1 + demo-2 golden masters unchanged.

## 4. Out of scope (future)
- Required spring/moving-platform-timing routes; retrofitting demo-2 to be auto-completable (the helper makes it possible later); a launch param for level-2; richer enemy variety.
