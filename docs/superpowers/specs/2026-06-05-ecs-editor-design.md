# ECS Level Editor — design spec

**Date:** 2026-06-05
**Status:** Approved (brainstorming) — ready for implementation plan
**Cycle:** 3 of 3 (1: ECS core ✓ · 2: mechanics ✓ · **3: level editor ← this spec**). Builds on the merged ECS core + mechanics.

A **developer-tool-first**, browser-based level editor for the ECS path, gated behind `?editor=1` and hidden from players. It authors the same `engine:'ecs'` JS-object-module shape `loader.js` already consumes. Scope is deliberately narrow (place/move/delete tiles & entities, schema-driven property edits, validate, in-editor playtest, compact export). The classic sim and shipped game stay untouched. This cycle also **bundles the Issue #6 follow-ups** so the editor is judged against real playable content.

---

## 1. Goal & non-goals

**Goal.** A focused editor that lets a developer load a known ECS level, edit tiles/entities, validate against the real loader, **playtest it in the real sim** (fixed-step, lives-free, disposable), and **export** a compact `engine:'ecs'` module — closing the content-production loop and proving the cycle-1/2 architecture produces authorable, playable levels.

**Non-goals (out of scope this cycle):**
- No in-game / user-facing editor, save slots, cloud sharing, moderation, or mobile editor UX.
- No arbitrary **text import** (levels load via static imports of known modules; compact text is **export-only**).
- No undo/redo history, multi-level project management, or tilemap layers.
- No changes to the deterministic sim, classic game, or the loader contract. The compact export expands to a normal `{tile}` definition **before** `export default` — the loader learns nothing new.

---

## 2. Architecture

**Boot — `?editor=1` router (riskiest integration edit; side-effects fully gated).**
`index.html` loads `src/main.js` unchanged. Inside `main.js`, the entire current game-boot body is wrapped in a `startGame()` function. **Nothing with a side effect runs before the router** — no DOM listeners, audio unlock, social setup, renderer/loop creation, or localStorage access. The module tail becomes:
```js
if (new URLSearchParams(location.search).has('editor')) import('./editor/editor.js').then(m => m.boot());
else startGame();
```
Static imports still load (harmless), but their effects are inert until `startGame()`. When `?editor=1`, the game never boots; the editor takes over.

**Modules (`src/editor/`, one responsibility each):**
- `editor.js` — boot; builds editor DOM (toolbar, tile/entity palette, property panel, status bar, Play/Copy/Download); owns the editor loop (render + input) and the model.
- `model.js` — the editable model + **pure** operations. Source of truth.
- `serialize.js` — the **contract seam**: `definitionToEditorModel`, `editorModelToDefinition`, `editorModelToModuleText`.
- `validate.js` — `validateModel(model)` wrapping the real loader as the validation authority.
- `render.js` — draws the model on the dedicated editor canvas (read-only of the model).
- `input.js` — pointer/keyboard → model ops + tool/selection/pan state.
- `playtest.js` — disposable real-stack play of a serialized snapshot.

**Separation guarantees.** The editor imports only existing public surfaces (`definitionToWorld`, `makeSim`, `buildSprites`, `createRenderer/Input/Camera`, `TYPE_REGISTRY`, the tile constants). It never imports `src/game/*` or runs inside the sim. Renderer-read-only and determinism rules are unaffected.

---

## 3. Editor model & serialize seam

**Model — deliberately boring, one schema, no drift:**
```js
{ meta: { name, w, h },
  tiles: string[][],                              // kind strings, h rows × w cols
  entities: [ { type, x, y, ...overrides } ] }    // overrides limited to the allowed keys (§3.2)
```

### 3.1 `model.js` — pure operations
Mutate-and-return; preserve the invariant `tiles.length === meta.h` and every row length `=== meta.w`:
- `paintTile(m, col, row, kind)`, `eraseTile` = paint `'empty'`, `floodFill(m, col, row, kind)`.
- `placeEntity(m, type, x, y)` — placing `player` **replaces** any existing player; `moveEntity(m, i, x, y)`; `deleteEntity(m, i)`; `setEntityProp(m, i, path, value)`.
- `resize(m, w, h)` — crop/extend tiles with `'empty'`, update `meta.w/h`, drop out-of-bounds entities.

### 3.2 `serialize.js` — the contract seam (tested both ways)
- `definitionToEditorModel(def)` — `{tile}` cells → kind strings; copy entities verbatim (incl. allowed override + `editor`/`meta` bags); `meta = {name,w,h}`.
- `editorModelToDefinition(model)` — **validates editor-model invariants FIRST** (fails early, does not rely on the loader afterward): rectangular tiles, `tiles` dims match `meta.w/h`, every tile kind is known (legend), every entity `x/y` finite, **exactly one `player`**, and every entity key ∈ the allowed set `{type, x, y, transform, mover, conveyor, bouncer, trigger, walker, editor, meta}` (any other key throws — the editor is not a loophole around strict loader validation). Then emits `{ engine:'ecs', meta, tiles:[[{tile}]], entities }`.
- `editorModelToModuleText(model, { compactTiles = true })` — emits module **text** that imports to a **normal loader definition**. With `compactTiles`, emits a char-legend + row-strings + a tiny inline expander building the `{tile}` grid, then `export default {...}`. `compactTiles:false` emits the literal grid. **Export-only** (no in-editor importer).

**Tile legend** (fixed; defined once in `serialize.js`): `' '→empty, #→ground, B→brick, U→upgrade-block, C→coin-block, o→coin, x→used-block, P→pipe, p→pipe-deco`. Unknown chars/kinds throw on conversion.

### 3.3 `validate.js`
`validateModel(model) → { ok, errors[] }`: runs `editorModelToDefinition` (catching its invariant errors) then `definitionToWorld` in try/catch (loader authority: single-player, rectangular, finite coords, unknown-component-key rejection with the `editor`/`meta` escape hatch), plus editor warnings (no `finish`, no `checkpoint`). **Play and Export are gated on `ok`.**

---

## 4. UI, interaction, playtest

**Layout (built by `editor.js`):** Toolbar (tools: Paint·Erase·Fill·Select/Move·Place-entity; tile palette; entity palette of the 7 types; level picker; `name`/`w`/`h` fields → `resize`; Validate·Play/Stop·Copy·Download) · window-wide editor canvas (grid overlay, atlas sprites, horizontal pan, selection box, entity handles) · status bar (validation/coords/tool).

**Interaction (`input.js`):** tile tools paint/erase/fill the current kind; entity tool places the current type snapped to the 16px grid; click-select an entity, drag to `moveEntity`, `Delete` to remove; pan via drag/wheel/arrows.

**Schema-driven property panel (not generic path editing).** A fixed descriptor table drives the UI; it renders only descriptors matching the selected entity's components and writes via `setEntityProp`:
`mover.dist, mover.speed` · `conveyor.pushX` · `bouncer.bounceV` · `walker.speed, walker.dir` · `trigger.spawnX, trigger.spawnY` · `transform.w, transform.h`. Each descriptor declares type/min/max/step. This prevents creating invalid bags by accident.

**Load (no text import):** the level picker lists **statically-imported** known modules (`demo-1`, `demo-2`, "Blank") → `definitionToEditorModel`.

**Export (gated on `validateModel().ok`):** `editorModelToModuleText(model,{compactTiles:true})` → **Copy** (clipboard) / **Download** (`<name>.js`).

**Playtest (`playtest.js`) — four constraints:**
1. **Snapshot isolation:** `def = editorModelToDefinition(model)`; `sim = makeSim(def)`. The live model is never handed to the sim.
2. **Fixed timestep:** a disposable loop using the game's accumulator (`FIXED_DT = 1/60`); never `sim.update(variableDt)`.
3. **Real stack, lives-free death policy:** reuses `createRenderer`/`createInput`/`createCamera` on the 256×240 game canvas; **no `game-state`/session/lives involvement**. On death: `canRespawnInPlace()` → `sim.respawn()` and keep playing; else rebuild `sim = makeSim(snapshot)`; show a small "Respawned"/"Restarted" status. `levelClear` → "Level complete!" banner.
4. **Disposable:** `stop()` cancels RAF, calls `input.dispose()`, clears banners, restores the editor canvas at the prior scroll position. No listeners/RAF survive Stop.

**`createInput().dispose()`** — new detach API on `src/engine/input.js`. Purely additive: **the normal game is byte-identical when `dispose()` is never called** (existing `attach` behavior unchanged).

---

## 5. Issue #6 bundled work (ships this cycle, audited separately — §7)

1. **Dogfood a completable level** → `src/levels/ecs/level-1.js`, **generated from the editor's export path** (author in the editor → export → drop in; lightly normalized only if needed). This proves the contract end-to-end.
2. **Completion coverage test:** a determinism-style headless test scripting a **stable, boring (not frame-perfect)** successful run that reaches `levelClear` on `level-1`.
3. **Placeholder art cleanup:** replace the spring/conveyor/checkpoint/finish colored-rect markers in `renderer.js` with real sprites — **additive only** (no classic sprite regressions; the `renderer.draw mutates nothing` test stays/extends green).
4. **Respawn FX cleanup:** `main.js` — on `dying→playing` via in-place respawn, clear FX + `hitstop` (the residual; tighten "full transient reset").

---

## 6. File structure

- *Create:* `src/editor/{editor,model,serialize,validate,render,input,playtest}.js`; `src/levels/ecs/level-1.js`; tests `ecs-editor-model.test.js`, `ecs-editor-serialize.test.js`, `ecs-editor-validate.test.js`, `ecs-level-1-complete.test.js`.
- *Modify:* `src/main.js` (`startGame()` wrap + `?editor` router, side-effects gated), `src/engine/input.js` (`dispose()`), `src/render/renderer.js` (#5.3 sprites), `tests/index.html`, `tests/renderer-readonly.test.js` (extend), and `tests/input.test.js` (dispose).

---

## 7. Testing & acceptance — two tiers (kept auditable)

### 7.A Editor MVP — must pass (judged on its own, free of art/demo concerns)
- **Model:** `model.js` ops + the `tiles=h×w` / `meta.w/h` invariant after paint/fill/resize.
- **Serialize (contract layer):** round-trip `demo-2` (def→model→def loads, behavior-relevant fields preserved); compact export imports to a loader-valid `engine:'ecs'` definition; escape-hatch fidelity (an `editor` bag survives; an unknown component key like `wings` is rejected); serializer invariant checks (non-rectangular, `meta.w/h` mismatch, unknown tile kind, non-finite coords, missing/duplicate player, disallowed entity key all throw early).
- **Validate:** `{ok,errors}` for a valid model and each invalid case; Play/Export gated on `ok`.
- **Disposable input:** existing `input.test.js` stays green; new test asserts `dispose()` detaches listeners; **game unchanged when `dispose()` never called.**
- **Router gating (riskiest edit):** a targeted test or browser-smoke assertion that `?editor=1` performs **no game side effects** (no audio/social/loop/localStorage) before the router, and the editor boots with no console exceptions; `?ecsdemo=1/2` and classic still boot normally.

### 7.B Issue #6 bundled — must pass (separate from the MVP judgment)
- `level-1` completes (reaches `levelClear`) under the stable scripted run (#5.2), and was produced via the editor/export path (#5.1).
- Renderer art cleanup additive: classic golden master + both ECS golden masters unchanged; `renderer.draw mutates nothing` green.
- Respawn FX cleanup present (#5.4).

### 7.C Always-green
Full suite (currently **206/0**) stays green; classic + demo-1 + demo-2 golden masters unchanged.

---

## 8. Out of scope (future)
- In-game/user-facing editor, save slots, sharing, moderation, mobile UX.
- Text/file import, undo/redo, tile layers, multi-level projects.
- Procedural/auto-tiling, entity prefabs, scripting.
