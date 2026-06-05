# ECS Level Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A developer-tool-first browser level editor (`?editor=1`) that loads, edits, validates, playtests (real fixed-step ECS sim, lives-free, disposable), and exports `engine:'ecs'` level modules — plus the bundled Issue #6 follow-ups.

**Architecture:** A boring kind-grid editor model with a tested serialize seam to the loader definition; the real `loader.definitionToWorld` as validation authority; a self-contained playtest that builds ECS sims via `definitionToWorld()` directly (never `makeSim` → never `src/game/*`); a side-effect-gated `startGame()` router for `?editor=1`.

**Tech Stack:** Vanilla ES modules, HTML5 Canvas 2D, zero build step. In-browser test harness (`tests/*.test.js` via `tests/harness.js`, run with `bash tools/run-tests.sh`, needs the `:8011` shot server). Tests run in real headless Chrome (DOM available).

**Branch:** `feat/ecs-editor` (already created; spec committed). Keep commits scoped; leave unrelated untracked `ios/`, `password/`, `tools/*.html` alone.

**Spec:** `docs/superpowers/specs/2026-06-05-ecs-editor-design.md` (the two wording fixes are already applied: playtest uses `definitionToWorld`; `no finish`/`no checkpoint` are warnings).

---

## Conventions

- **Run tests:** `:8011` up (`python3 /tmp/shotsrv.py &` if down), then `bash tools/run-tests.sh` → `PASS n / FAIL m` + `❌`. **Baseline: PASS 206 / FAIL 0.**
- **Register every new test file** in `tests/index.html` (before the `const out = ...` line).
- **Editor model shape:** `{ meta:{name,w,h}, tiles: string[][], entities:[{type,x,y,...overrides}] }`.
- **Stages are review checkpoints.** A: pure core · B: integration shell · C: playtest · D: Issue #6 · E: verification.

---

# STAGE A — Pure core (model, serialize, validate)

## Task A1: serialize — legend + `definitionToEditorModel` + `editorModelToDefinition` (invariants)

**Files:** Create `src/editor/serialize.js`, `tests/ecs-editor-serialize.test.js`; modify `tests/index.html`.

- [ ] **Step 1: Write the failing test** — create `tests/ecs-editor-serialize.test.js`:

```js
// tests/ecs-editor-serialize.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToEditorModel, editorModelToDefinition } from '../src/editor/serialize.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import DEMO2 from '../src/levels/ecs/demo-2.js';

function expectThrow(fn, why) { let t=false; try{fn();}catch{t=true;} assert(t, why); }
const eRow = (w) => Array.from({length:w}, () => ({ tile:'empty' }));
const gRow = (w) => Array.from({length:w}, () => ({ tile:'ground' }));
function goodModel() {
  return { meta:{name:'m',w:4,h:2}, tiles:[['empty','empty','empty','empty'],['ground','ground','ground','ground']],
    entities:[{type:'player',x:16,y:0},{type:'finish',x:32,y:0}] };
}

test('definitionToEditorModel converts {tile} cells to kind strings', () => {
  const def = { engine:'ecs', meta:{name:'d',w:4,h:2}, tiles:[eRow(4),gRow(4)], entities:[{type:'player',x:0,y:0}] };
  const m = definitionToEditorModel(def);
  assertEqual(m.tiles[1][0], 'ground');
  assertEqual(m.tiles[0][0], 'empty');
  assertEqual(m.entities[0].type, 'player');
});

test('editorModelToDefinition emits a loader-valid {tile} definition', () => {
  const def = editorModelToDefinition(goodModel());
  assertEqual(def.engine, 'ecs');
  assertEqual(def.tiles[1][0].tile, 'ground');
  definitionToWorld(def);   // must not throw
});

test('round-trip demo-2: def -> model -> def still loads, fields preserved', () => {
  const m = definitionToEditorModel(DEMO2);
  const def = editorModelToDefinition(m);
  definitionToWorld(def);
  // behavior-relevant: same entity types in order, same tile kinds
  assertEqual(def.entities.map(e=>e.type).join(','), DEMO2.entities.map(e=>e.type).join(','));
  assertEqual(JSON.stringify(def.tiles.map(r=>r.map(c=>c.tile))), JSON.stringify(DEMO2.tiles.map(r=>r.map(c=>c.tile))));
  // override preserved
  const plat = def.entities.find(e=>e.type==='platform');
  assertEqual(plat.mover.speed, 40);
});

test('editorModelToDefinition rejects invariant violations EARLY', () => {
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:4,h:2}, tiles:[eRow(4)], entities:[{type:'player',x:0,y:0}] }), 'tiles rows != h');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:4,h:2}, tiles:[['empty'],['ground','ground','ground','ground']], entities:[{type:'player',x:0,y:0}] }), 'ragged');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:2}, tiles:[['empty','nope'],['ground','ground']], entities:[{type:'player',x:0,y:0}] }), 'unknown tile kind');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[{type:'player',x:NaN,y:0}] }), 'non-finite coord');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[] }), 'zero players');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[{type:'player',x:0,y:0},{type:'player',x:16,y:0}] }), 'two players');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[{type:'player',x:0,y:0,wings:{}}] }), 'disallowed entity key');
});

test('editor/meta escape-hatch bags survive', () => {
  const def = editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[{type:'player',x:0,y:0,editor:{note:'spawn'}}] });
  assertEqual(def.entities[0].editor.note, 'spawn');
});
```

- [ ] **Step 2: Register + run to verify it fails**

Add `await import('./ecs-editor-serialize.test.js');` to `tests/index.html`. Run → FAIL (module missing).

- [ ] **Step 3: Implement `src/editor/serialize.js`** (the `editorModelToModuleText` part is added in A2):

```js
// src/editor/serialize.js
// The contract seam between the editor's kind-grid model and the loader definition.
// editorModelToDefinition validates editor-model invariants FIRST (fail early), then
// emits the exact { engine:'ecs', meta, tiles:[[{tile}]], entities } shape loader.js consumes.

// compact char <-> tile-kind legend (fixed; unknown chars/kinds throw on conversion)
export const TILE_LEGEND = {
  ' ': 'empty', '#': 'ground', 'B': 'brick', 'U': 'upgrade-block',
  'C': 'coin-block', 'o': 'coin', 'x': 'used-block', 'P': 'pipe', 'p': 'pipe-deco',
};
export const KIND_TO_CHAR = Object.fromEntries(Object.entries(TILE_LEGEND).map(([ch, k]) => [k, ch]));
const KNOWN_KINDS = new Set(Object.values(TILE_LEGEND));
const ALLOWED_ENTITY_KEYS = new Set(['type', 'x', 'y', 'transform', 'mover', 'conveyor', 'bouncer', 'trigger', 'walker', 'editor', 'meta']);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

export function definitionToEditorModel(def) {
  return {
    meta: { name: def.meta.name, w: def.meta.w, h: def.meta.h },
    tiles: def.tiles.map(row => row.map(c => c.tile)),
    entities: def.entities.map(e => clone(e)),
  };
}

export function editorModelToDefinition(model) {
  const { meta, tiles, entities } = model || {};
  if (!meta || typeof meta.name !== 'string' || !isNum(meta.w) || !isNum(meta.h)) throw new Error('editor: meta {name,w,h} required');
  if (!Array.isArray(tiles) || tiles.length !== meta.h) throw new Error('editor: tiles must have meta.h rows');
  for (const row of tiles) {
    if (!Array.isArray(row) || row.length !== meta.w) throw new Error('editor: tiles must be rectangular (meta.w cols)');
    for (const k of row) if (!KNOWN_KINDS.has(k)) throw new Error(`editor: unknown tile kind '${k}'`);
  }
  if (!Array.isArray(entities)) throw new Error('editor: entities array required');
  let players = 0;
  for (const e of entities) {
    if (!isNum(e.x) || !isNum(e.y)) throw new Error(`editor: entity ${e.type} needs finite x,y`);
    if (e.type === 'player') players++;
    for (const key of Object.keys(e)) if (!ALLOWED_ENTITY_KEYS.has(key)) throw new Error(`editor: disallowed entity key '${key}' on ${e.type}`);
  }
  if (players !== 1) throw new Error(`editor: exactly one player required (got ${players})`);
  return {
    engine: 'ecs',
    meta: { name: meta.name, w: meta.w, h: meta.h },
    tiles: tiles.map(row => row.map(k => ({ tile: k }))),
    entities: entities.map(e => clone(e)),
  };
}
```

- [ ] **Step 4: Run to verify it passes** → all A1 tests PASS, FAIL 0.

- [ ] **Step 5: Commit**

```bash
git add src/editor/serialize.js tests/ecs-editor-serialize.test.js tests/index.html
git commit -m "feat(editor): serialize seam — model<->definition with early invariant checks"
```

---

## Task A2: serialize — `editorModelToModuleText` (compact, export-only)

**Files:** Modify `src/editor/serialize.js`, `tests/ecs-editor-serialize.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-editor-serialize.test.js`):

```js
import { editorModelToModuleText } from '../src/editor/serialize.js';
// evaluate emitted module text without a bundler: turn `export default` into a return.
function evalModule(text) { return new Function(text.replace('export default', 'return'))(); }

test('compact export re-imports to a loader-valid definition', () => {
  const text = editorModelToModuleText(goodModel(), { compactTiles: true });
  const def = evalModule(text);
  assertEqual(def.engine, 'ecs');
  assertEqual(def.tiles[1][0].tile, 'ground');
  definitionToWorld(def);   // must not throw
  assertEqual(def.entities.find(e=>e.type==='finish').type, 'finish');
});

test('compact export round-trips demo-2 to a valid definition', () => {
  const text = editorModelToModuleText(definitionToEditorModel(DEMO2), { compactTiles: true });
  const def = evalModule(text);
  definitionToWorld(def);
  assertEqual(def.entities.length, DEMO2.entities.length);
});

test('editorModelToModuleText validates before emitting', () => {
  expectThrow(() => editorModelToModuleText({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[] }), 'invalid model must not export');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (`editorModelToModuleText` undefined).

- [ ] **Step 3: Add `editorModelToModuleText`** to `src/editor/serialize.js`:

```js
// Emit module TEXT that imports to a NORMAL loader definition (loader unchanged).
// compactTiles: a char-legend + row-strings + inline expander build the {tile} grid.
export function editorModelToModuleText(model, { compactTiles = true } = {}) {
  editorModelToDefinition(model);                 // validate first; throws if invalid
  const { meta, tiles, entities } = model;
  const ents = entities.map(e => '    ' + JSON.stringify(e)).join(',\n');
  if (!compactTiles) {
    return `export default ${JSON.stringify(editorModelToDefinition(model), null, 2)};\n`;
  }
  const legend = Object.entries(TILE_LEGEND).map(([ch, k]) => `${JSON.stringify(ch)}: ${JSON.stringify(k)}`).join(', ');
  const rows = tiles.map(row => '    ' + JSON.stringify(row.map(k => KIND_TO_CHAR[k]).join(''))).join(',\n');
  return `// ${meta.name}
const T = { ${legend} };
const rows = [
${rows}
  ].map(r => [...r].map(ch => ({ tile: T[ch] })));
export default {
  engine: 'ecs',
  meta: ${JSON.stringify(meta)},
  tiles: rows,
  entities: [
${ents}
  ],
};
`;
}
```

- [ ] **Step 4: Run to verify it passes** → PASS, FAIL 0.

- [ ] **Step 5: Commit**

```bash
git add src/editor/serialize.js tests/ecs-editor-serialize.test.js
git commit -m "feat(editor): compact export-only module text (expands to normal definition)"
```

---

## Task A3: `model.js` — editing operations

**Files:** Create `src/editor/model.js`, `tests/ecs-editor-model.test.js`; modify `tests/index.html`.

- [ ] **Step 1: Write the failing test** — create `tests/ecs-editor-model.test.js`:

```js
// tests/ecs-editor-model.test.js
import { test, assert, assertEqual } from './harness.js';
import { blankModel, paintTile, eraseTile, floodFill, placeEntity, moveEntity, deleteEntity, setEntityProp, resize } from '../src/editor/model.js';

function rectInvariant(m) {
  assertEqual(m.tiles.length, m.meta.h, 'rows == h');
  for (const row of m.tiles) assertEqual(row.length, m.meta.w, 'cols == w');
}

test('blankModel has one player and rectangular empty tiles', () => {
  const m = blankModel(10, 6, 'L');
  assertEqual(m.meta.w, 10); assertEqual(m.meta.h, 6);
  assertEqual(m.entities.filter(e=>e.type==='player').length, 1);
  assertEqual(m.tiles[0][0], 'empty');
  rectInvariant(m);
});

test('paint/erase a tile in bounds; out of bounds is a no-op', () => {
  const m = blankModel(4, 3);
  paintTile(m, 1, 2, 'ground');
  assertEqual(m.tiles[2][1], 'ground');
  eraseTile(m, 1, 2);
  assertEqual(m.tiles[2][1], 'empty');
  paintTile(m, 99, 99, 'ground');   // no throw, no change
  rectInvariant(m);
});

test('floodFill replaces a contiguous region of the same kind', () => {
  const m = blankModel(3, 3);
  floodFill(m, 0, 0, 'ground');     // all empty -> all ground
  assertEqual(m.tiles[0][0], 'ground');
  assertEqual(m.tiles[2][2], 'ground');
});

test('placeEntity(player) replaces the existing player', () => {
  const m = blankModel(8, 4);
  placeEntity(m, 'player', 64, 16);
  assertEqual(m.entities.filter(e=>e.type==='player').length, 1, 'still one player');
  assertEqual(m.entities.find(e=>e.type==='player').x, 64);
});

test('place/move/delete a non-player entity', () => {
  const m = blankModel(8, 4);
  const i = placeEntity(m, 'enemy', 32, 16);
  moveEntity(m, i, 48, 16);
  assertEqual(m.entities[i].x, 48);
  setEntityProp(m, i, 'walker.speed', 55);
  assertEqual(m.entities[i].walker.speed, 55);
  deleteEntity(m, i);
  assert(!m.entities.some(e=>e.type==='enemy'), 'enemy removed');
});

test('resize keeps the rectangular invariant and drops out-of-bounds entities', () => {
  const m = blankModel(8, 4);
  placeEntity(m, 'enemy', 7*16, 0);   // near the right edge
  resize(m, 4, 4);                     // shrink width to 4 tiles (x<64)
  assertEqual(m.meta.w, 4);
  rectInvariant(m);
  assert(!m.entities.some(e=>e.type==='enemy'), 'out-of-bounds enemy dropped');
});
```

- [ ] **Step 2: Register + run to verify it fails**

Add `await import('./ecs-editor-model.test.js');` to `tests/index.html`. Run → FAIL.

- [ ] **Step 3: Implement `src/editor/model.js`**:

```js
// src/editor/model.js
// The editor's source of truth: a kind-grid + plain entity list, with pure ops that
// preserve the rectangular invariant (tiles = meta.h rows x meta.w cols).
import { TILE } from '../engine/constants.js';

export function blankModel(w = 32, h = 15, name = 'Untitled') {
  const tiles = Array.from({ length: h }, () => Array.from({ length: w }, () => 'empty'));
  return { meta: { name, w, h }, tiles, entities: [{ type: 'player', x: 16, y: (h - 3) * TILE }] };
}

const inBounds = (m, col, row) => row >= 0 && row < m.meta.h && col >= 0 && col < m.meta.w;

export function paintTile(m, col, row, kind) { if (inBounds(m, col, row)) m.tiles[row][col] = kind; return m; }
export function eraseTile(m, col, row) { return paintTile(m, col, row, 'empty'); }

export function floodFill(m, col, row, kind) {
  if (!inBounds(m, col, row)) return m;
  const from = m.tiles[row][col];
  if (from === kind) return m;
  const stack = [[col, row]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (!inBounds(m, c, r) || m.tiles[r][c] !== from) continue;
    m.tiles[r][c] = kind;
    stack.push([c+1, r], [c-1, r], [c, r+1], [c, r-1]);
  }
  return m;
}

export function placeEntity(m, type, x, y) {
  if (type === 'player') m.entities = m.entities.filter(e => e.type !== 'player');
  m.entities.push({ type, x, y });
  return m.entities.length - 1;
}
export function moveEntity(m, i, x, y) { const e = m.entities[i]; if (e) { e.x = x; e.y = y; } return m; }
export function deleteEntity(m, i) { if (m.entities[i]) m.entities.splice(i, 1); return m; }

export function setEntityProp(m, i, path, value) {
  const e = m.entities[i]; if (!e) return m;
  const parts = path.split('.');
  let obj = e;
  for (let k = 0; k < parts.length - 1; k++) { obj[parts[k]] = obj[parts[k]] || {}; obj = obj[parts[k]]; }
  obj[parts[parts.length - 1]] = value;
  return m;
}

export function resize(m, w, h) {
  const tiles = Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => (m.tiles[r] && m.tiles[r][c]) || 'empty'));
  m.tiles = tiles; m.meta.w = w; m.meta.h = h;
  m.entities = m.entities.filter(e => e.x >= 0 && e.x < w * TILE && e.y >= 0 && e.y < h * TILE);
  return m;
}
```

- [ ] **Step 4: Run to verify it passes** → PASS, FAIL 0.

- [ ] **Step 5: Commit**

```bash
git add src/editor/model.js tests/ecs-editor-model.test.js tests/index.html
git commit -m "feat(editor): kind-grid model + pure editing operations"
```

---

## Task A4: `validate.js` — `validateModel` `{ok, errors, warnings}`

**Files:** Create `src/editor/validate.js`, `tests/ecs-editor-validate.test.js`; modify `tests/index.html`.

- [ ] **Step 1: Write the failing test** — create `tests/ecs-editor-validate.test.js`:

```js
// tests/ecs-editor-validate.test.js
import { test, assert, assertEqual } from './harness.js';
import { validateModel } from '../src/editor/validate.js';

const tiles = (w,h) => Array.from({length:h}, () => Array.from({length:w}, () => 'empty'));
function model(over={}) { return { meta:{name:'m',w:4,h:2}, tiles:tiles(4,2), entities:[{type:'player',x:0,y:0}], ...over }; }

test('valid model is ok with no errors', () => {
  const r = validateModel(model({ entities:[{type:'player',x:0,y:0},{type:'finish',x:16,y:0}] }));
  assert(r.ok, 'ok true'); assertEqual(r.errors.length, 0);
});

test('hard-invalid model is not ok (errors populated)', () => {
  const r = validateModel(model({ entities:[] }));   // zero players
  assert(!r.ok, 'ok false'); assert(r.errors.length > 0, 'has errors');
});

test('no finish / no checkpoint are non-blocking warnings, not errors', () => {
  const r = validateModel(model());   // player only, no finish/checkpoint
  assert(r.ok, 'still ok (hard validity)');
  assert(r.warnings.some(w => /finish/i.test(w)), 'finish warning');
  assert(r.warnings.some(w => /checkpoint/i.test(w)), 'checkpoint warning');
});
```

- [ ] **Step 2: Register + run to verify it fails**

Add `await import('./ecs-editor-validate.test.js');` to `tests/index.html`. Run → FAIL.

- [ ] **Step 3: Implement `src/editor/validate.js`**:

```js
// src/editor/validate.js
// validateModel: ok reflects HARD validity (editor invariants + the real loader).
// no-finish / no-checkpoint are non-blocking warnings — Play/Export gate on ok only.
import { editorModelToDefinition } from './serialize.js';
import { definitionToWorld } from '../ecs/loader.js';

export function validateModel(model) {
  const errors = [], warnings = [];
  try {
    const def = editorModelToDefinition(model);   // editor invariants (throws)
    definitionToWorld(def);                        // loader authority (throws)
  } catch (e) {
    errors.push(e.message);
  }
  const types = (model && Array.isArray(model.entities)) ? model.entities.map(e => e.type) : [];
  if (!types.includes('finish')) warnings.push('no finish entity — the level cannot be completed');
  if (!types.includes('checkpoint')) warnings.push('no checkpoint entity — death restarts from spawn');
  return { ok: errors.length === 0, errors, warnings };
}
```

- [ ] **Step 4: Run to verify it passes** → PASS, FAIL 0.

- [ ] **Step 5: Commit**

```bash
git add src/editor/validate.js tests/ecs-editor-validate.test.js tests/index.html
git commit -m "feat(editor): validateModel {ok,errors,warnings} (loader authority; warnings non-blocking)"
```

**STAGE A CHECKPOINT:** full suite green; serialize/model/validate fully unit-tested. The contract seam is locked before any DOM work.

---

# STAGE B — Integration shell (router, dispose, DOM boot/render/input)

## Task B1: `createInput().dispose()`

**Files:** Modify `src/engine/input.js`, `tests/input.test.js`.

- [ ] **Step 1: Inspect the existing input test, then add a dispose test** (append to `tests/input.test.js`):

```js
test('dispose() detaches listeners; game behavior unchanged when never called', () => {
  // a fake target recording add/remove so we can assert symmetric teardown
  const handlers = [];
  const target = {
    addEventListener: (type, fn) => handlers.push({ type, fn, live: true }),
    removeEventListener: (type, fn) => { const h = handlers.find(x => x.type===type && x.fn===fn && x.live); if (h) h.live = false; },
  };
  const input = createInput();
  input.attach(target);
  assertEqual(handlers.filter(h=>h.live).length, 2, 'keydown+keyup attached');
  input.dispose();
  assertEqual(handlers.filter(h=>h.live).length, 0, 'both detached');
});
```
> `createInput` is already imported at the top of `tests/input.test.js` (verify; if not, add `import { createInput } from '../src/engine/input.js';`).

- [ ] **Step 2: Run to verify it fails** → FAIL (`dispose` undefined).

- [ ] **Step 3: Implement `dispose()`** — replace the `attach`/`return` region of `src/engine/input.js`:

```js
  let _detach = null;
  function attach(target = window) {
    const onDown = e => { if (MAP[e.code]) { e.preventDefault(); _onKey(e.code, true); } };
    const onUp   = e => { if (MAP[e.code]) { e.preventDefault(); _onKey(e.code, false); } };
    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    _detach = () => { target.removeEventListener('keydown', onDown); target.removeEventListener('keyup', onUp); _detach = null; };
  }
  function dispose() { if (_detach) _detach(); }

  function beginFrame() { frameOpen = true; }
```
And add `dispose` to the returned object:
```js
  return { attach, dispose, beginFrame, consumeIntent, setAction, _onKey };
```

- [ ] **Step 4: Run to verify it passes** — new test PASS; all existing input + game tests stay green (the game never calls `dispose`, behavior identical). FAIL 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/input.js tests/input.test.js
git commit -m "feat(input): additive dispose() to detach listeners (game unchanged if unused)"
```

## Task B2: `main.js` — `startGame()` wrap + `?editor=1` router (side-effects gated)

**Files:** Modify `src/main.js`.

- [ ] **Step 1: Wrap the game body** — In `src/main.js`, leave the import block (the `import ...` lines at the top) as-is. Wrap **everything after the imports** (from the first non-import statement — `const ECS_DEMO = ...` — through the final `loop.start();`) inside a function:
```js
function startGame() {
  // ... ALL existing main.js body, unchanged, moved here verbatim ...
}
```
This makes every side effect (DOM listeners, `createAudio`, social setup, `createRenderer`, `createLoop`, `localStorage` reads/writes, `resize()`, `loop.start()`) run only when `startGame()` is called.

- [ ] **Step 2: Add the router** at the very end of `src/main.js` (after the `startGame` function):
```js
// Dev-only level editor (hidden from players). Gated BEFORE any game side effect runs.
if (new URLSearchParams(location.search).has('editor')) {
  import('./editor/editor.js').then(m => m.boot());
} else {
  startGame();
}
```

- [ ] **Step 3: Verify parse + game unaffected**

Run: `node --check src/main.js` → parses OK.
Run: `bash tools/run-tests.sh` → still **PASS 206 / FAIL 0** (no test imports main.js; this guards syntax). The `?editor` path is browser-smoke-verified in Stage E.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat(main): wrap game boot in startGame(); ?editor=1 router gates all side effects"
```
> `./editor/editor.js` is created in B4; this commit's router import resolves once B4 lands. Do B3+B4 before any browser run of `?editor=1`.

## Task B3: editor render — pure coordinate core + `render.js`

**Files:** Create `src/editor/render.js`, `tests/ecs-editor-model.test.js` (append coord tests there to avoid a new file).

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-editor-model.test.js`):

```js
import { screenToTile, tileToScreen } from '../src/editor/render.js';

test('screenToTile and tileToScreen are inverses (pan + zoom)', () => {
  const view = { panX: 48, zoom: 20 };               // panX world-px, zoom screen-px per 16px tile
  const s = tileToScreen(view, 5, 3);                 // tile (col5,row3) -> screen px
  const t = screenToTile(view, s.sx + 1, s.sy + 1);   // +1px stays inside the same cell
  assertEqual(t.col, 5); assertEqual(t.row, 3);
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement `src/editor/render.js`**:

```js
// src/editor/render.js
// Editor canvas drawing + pure screen<->tile coordinate math. panX is a world-space
// horizontal scroll in px; zoom is screen px per 16px tile. Read-only of the model.
import { TILE } from '../engine/constants.js';

export function screenToTile(view, sx, sy) {
  const worldX = sx / view.zoom * TILE + view.panX;
  const worldY = sy / view.zoom * TILE;
  return { col: Math.floor(worldX / TILE), row: Math.floor(worldY / TILE) };
}
export function tileToScreen(view, col, row) {
  return { sx: (col * TILE - view.panX) * view.zoom / TILE, sy: row * TILE * view.zoom / TILE };
}

const TILE_SPRITE = { ground:'ground', brick:'brick', 'used-block':'usedBlock', pipe:'pipe', 'pipe-deco':'pipeDeco' };
const ENTITY_COLOR = { player:'#fff', platform:'#caa472', conveyor:'#888', spring:'#d33', checkpoint:'#3c6', finish:'#fc3', enemy:'#a52' };

// Draw the model. sprites = buildSprites(1). view = { panX, zoom, w, h }.
export function drawEditor(ctx, model, sprites, view, selection) {
  const z = view.zoom, cells = TILE; const px = (worldX) => (worldX - view.panX) * z / cells;
  ctx.fillStyle = '#0b0b16'; ctx.fillRect(0, 0, view.w, view.h);
  // tiles
  for (let r = 0; r < model.meta.h; r++) for (let c = 0; c < model.meta.w; c++) {
    const kind = model.tiles[r][c]; if (kind === 'empty') continue;
    const sx = px(c*cells), sy = r*z, key = TILE_SPRITE[kind];
    if (key && sprites[key]) ctx.drawImage(sprites[key], Math.round(sx), Math.round(sy), z, z);
    else { ctx.fillStyle = '#557'; ctx.fillRect(Math.round(sx), Math.round(sy), z, z); }   // coin/blocks fallback swatch
  }
  // entities
  for (const e of model.entities) {
    const sx = px(e.x), sy = e.y * z / cells, w = (e.transform?.w || cells) * z / cells, h = (e.transform?.h || cells) * z / cells;
    ctx.fillStyle = ENTITY_COLOR[e.type] || '#0ff';
    ctx.globalAlpha = 0.85; ctx.fillRect(Math.round(sx), Math.round(sy), Math.round(w), Math.round(h)); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000'; ctx.strokeRect(Math.round(sx)+0.5, Math.round(sy)+0.5, Math.round(w), Math.round(h));
  }
  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let c = 0; c <= model.meta.w; c++) { const x = px(c*cells); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, model.meta.h*z); ctx.stroke(); }
  for (let r = 0; r <= model.meta.h; r++) { const y = r*z; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(model.meta.w*z - view.panX*z/cells, y); ctx.stroke(); }
  // selection
  if (selection != null && model.entities[selection]) {
    const e = model.entities[selection]; const sx = px(e.x), sy = e.y*z/cells;
    const w = (e.transform?.w||cells)*z/cells, h = (e.transform?.h||cells)*z/cells;
    ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.strokeRect(Math.round(sx)-1, Math.round(sy)-1, Math.round(w)+2, Math.round(h)+2); ctx.lineWidth = 1;
  }
}
```

- [ ] **Step 4: Run to verify it passes** (the inverse test) → PASS, FAIL 0. (`drawEditor` is exercised by Stage E browser smoke.)

- [ ] **Step 5: Commit**

```bash
git add src/editor/render.js tests/ecs-editor-model.test.js
git commit -m "feat(editor): canvas draw + pure screen<->tile coordinate math"
```

## Task B4: editor input + DOM boot — `input.js`, `editor.js`

**Files:** Create `src/editor/input.js`, `src/editor/editor.js`. Append an `entityAt` test to `tests/ecs-editor-model.test.js`.

- [ ] **Step 1: Write the failing test** (append to `tests/ecs-editor-model.test.js`):

```js
import { entityAt } from '../src/editor/input.js';

test('entityAt returns the topmost entity index under a world point', () => {
  const m = blankModel(8, 4);
  const i = placeEntity(m, 'enemy', 32, 32);   // 16x16 at (32,32)
  assertEqual(entityAt(m, 36, 36), i, 'hit inside the enemy box');
  assertEqual(entityAt(m, 5, 5), -1, 'miss');
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/editor/input.js`** (pure hit-test + a pointer-dispatch helper):

```js
// src/editor/input.js
// Pure editor input helpers. entityAt does AABB hit-testing in WORLD coords (px).
import { TILE } from '../engine/constants.js';

export function entityAt(model, worldX, worldY) {
  for (let i = model.entities.length - 1; i >= 0; i--) {   // topmost first
    const e = model.entities[i];
    const w = e.transform?.w || TILE, h = e.transform?.h || TILE;
    if (worldX >= e.x && worldX < e.x + w && worldY >= e.y && worldY < e.y + h) return i;
  }
  return -1;
}

// Snap a world coord to the tile grid (entities place on tile origins).
export const snap = (v) => Math.floor(v / TILE) * TILE;
```

- [ ] **Step 4: Run to verify the `entityAt` test passes** → PASS, FAIL 0.

- [ ] **Step 5: Implement `src/editor/editor.js`** (DOM boot + loop; browser-smoke-verified in Stage E):

```js
// src/editor/editor.js
// Dev level editor boot (?editor=1). Builds DOM, owns the model + edit loop, wires
// tools/palette/property-panel/validate/play/export. Reuses the game sprite atlas.
import { buildSprites } from '../render/sprites.js';
import { blankModel, paintTile, eraseTile, floodFill, placeEntity, moveEntity, deleteEntity, setEntityProp, resize } from './model.js';
import { definitionToEditorModel, editorModelToModuleText, TILE_LEGEND } from './serialize.js';
import { validateModel } from './validate.js';
import { drawEditor, screenToTile } from './render.js';
import { entityAt, snap } from './input.js';
import { startPlaytest } from './playtest.js';
import DEMO1 from '../levels/ecs/demo-1.js';
import DEMO2 from '../levels/ecs/demo-2.js';
import { TILE } from '../engine/constants.js';

const ENTITY_TYPES = ['player','platform','spring','conveyor','checkpoint','finish','enemy'];
const PROP_SCHEMA = {   // schema-driven property panel (fixed descriptors)
  mover:    [['dist',0,512,16],['speed',0,200,5]],
  conveyor: [['pushX',-160,160,10]],
  bouncer:  [['bounceV',100,600,10]],
  walker:   [['speed',0,200,5],['dir',-1,1,2]],
  trigger:  [['spawnX',0,4096,16],['spawnY',0,512,16]],
  transform:[['w',16,256,16],['h',16,256,16]],
};

export function boot() {
  document.body.innerHTML = '';   // editor takes over (game never booted)
  document.title = 'ECS Editor';
  const sprites = buildSprites(1);
  let model = definitionToEditorModel(DEMO2);
  let tool = 'paint', tileKind = 'ground', entType = 'enemy', selection = null;
  const view = { panX: 0, zoom: 24, w: 0, h: 0 };

  // --- DOM ---
  const bar = el('div', { id:'ed-bar' }); const canvas = el('canvas', { id:'ed-canvas' });
  const status = el('div', { id:'ed-status' }); const props = el('div', { id:'ed-props' });
  document.body.append(bar, canvas, props, status);
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  function fit() { view.w = canvas.width = window.innerWidth; view.h = canvas.height = Math.max(240, model.meta.h*view.zoom); }
  window.addEventListener('resize', fit);

  // toolbar: tools, tile palette, entity palette, level picker, meta, actions
  for (const t of ['paint','erase','fill','select','place']) bar.append(btn(t, () => { tool = t; }));
  for (const ch in TILE_LEGEND) if (TILE_LEGEND[ch] !== 'empty') bar.append(btn(TILE_LEGEND[ch], () => { tool='paint'; tileKind = TILE_LEGEND[ch]; }));
  const eSel = el('select'); for (const t of ENTITY_TYPES) eSel.append(el('option', { value:t, textContent:t })); eSel.value = entType;
  eSel.onchange = () => { entType = eSel.value; }; bar.append(eSel);
  const lvl = el('select'); [['demo-1',DEMO1],['demo-2',DEMO2],['blank',null]].forEach(([n]) => lvl.append(el('option',{value:n,textContent:n})));
  lvl.value = 'demo-2'; lvl.onchange = () => { model = lvl.value==='demo-1'?definitionToEditorModel(DEMO1):lvl.value==='blank'?blankModel():definitionToEditorModel(DEMO2); selection=null; fit(); }; bar.append(lvl);
  bar.append(btn('Validate', refreshStatus));
  bar.append(btn('Play', play));
  bar.append(btn('Copy', () => { const r = validateModel(model); if (!r.ok) return refreshStatus(); navigator.clipboard?.writeText(editorModelToModuleText(model)); status.textContent = 'Copied module to clipboard.'; }));
  bar.append(btn('Download', () => { const r = validateModel(model); if (!r.ok) return refreshStatus(); download(`${model.meta.name||'level'}.js`, editorModelToModuleText(model)); }));

  // --- interaction ---
  let dragging = -1;
  canvas.addEventListener('pointerdown', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const worldX = (ev.clientX-rect.left)/view.zoom*TILE + view.panX, worldY = (ev.clientY-rect.top)/view.zoom*TILE;
    const { col, row } = screenToTile(view, ev.clientX-rect.left, ev.clientY-rect.top);
    if (tool === 'paint') paintTile(model, col, row, tileKind);
    else if (tool === 'erase') eraseTile(model, col, row);
    else if (tool === 'fill') floodFill(model, col, row, tileKind);
    else if (tool === 'place') { selection = placeEntity(model, entType, snap(worldX), snap(worldY)); renderProps(); }
    else if (tool === 'select') { selection = entityAt(model, worldX, worldY); dragging = selection; renderProps(); }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (dragging < 0) return; const rect = canvas.getBoundingClientRect();
    moveEntity(model, dragging, snap((ev.clientX-rect.left)/view.zoom*TILE + view.panX), snap((ev.clientY-rect.top)/view.zoom*TILE));
  });
  window.addEventListener('pointerup', () => { dragging = -1; });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Delete' && selection != null) { deleteEntity(model, selection); selection = null; renderProps(); }
    else if (ev.key === 'ArrowRight') view.panX += TILE; else if (ev.key === 'ArrowLeft') view.panX = Math.max(0, view.panX - TILE);
  });

  function renderProps() {
    props.innerHTML = '';
    if (selection == null || !model.entities[selection]) return;
    const e = model.entities[selection];
    props.append(el('div', { textContent: `${e.type} @ ${e.x},${e.y}` }));
    for (const comp in PROP_SCHEMA) {
      if (!(comp in e) && !defaultHas(e.type, comp)) continue;
      for (const [field, min, max, step] of PROP_SCHEMA[comp]) {
        const cur = (e[comp] && e[comp][field]) ?? '';
        const inp = el('input', { type:'number', min, max, step, value: cur });
        inp.onchange = () => setEntityProp(model, selection, `${comp}.${field}`, Number(inp.value));
        props.append(el('label', { textContent: `${comp}.${field}` }), inp);
      }
    }
  }
  function refreshStatus() { const r = validateModel(model); status.textContent = (r.ok ? 'VALID' : 'INVALID: ' + r.errors.join('; ')) + (r.warnings.length ? '  ⚠ ' + r.warnings.join('; ') : ''); }
  function play() { const r = validateModel(model); if (!r.ok) return refreshStatus(); startPlaytest(model, () => { document.body.style.display=''; }); }

  fit(); refreshStatus(); renderProps();
  (function loop() { drawEditor(ctx, model, sprites, view, selection); requestAnimationFrame(loop); })();
}

// tiny DOM helpers
function el(tag, props={}) { const n = document.createElement(tag); Object.assign(n, props); return n; }
function btn(label, onclick) { const b = el('button', { textContent: label }); b.onclick = onclick; return b; }
function download(name, text) { const a = el('a', { href: URL.createObjectURL(new Blob([text], {type:'text/javascript'})), download: name }); a.click(); }
function defaultHas() { return false; }   // only show props for components actually present on the entity
```

- [ ] **Step 6: Run the suite** (the `entityAt` test green; DOM glue is Stage E smoke). Run: `bash tools/run-tests.sh` → FAIL 0. `node --check src/editor/editor.js` and `node --check src/editor/render.js` parse OK.

- [ ] **Step 7: Commit**

```bash
git add src/editor/input.js src/editor/editor.js tests/ecs-editor-model.test.js
git commit -m "feat(editor): pointer hit-testing + DOM boot/toolbar/property-panel/export"
```
> `./playtest.js` is created in Stage C; `editor.js`'s import resolves once C1/C2 land. Do not browser-run `?editor=1` until Stage C is done.

**STAGE B CHECKPOINT:** router gates side effects; dispose added; editor model/serialize/validate/render-coords/hit-test tested; DOM boot in place (smoke pending playtest).

---

# STAGE C — Playtest (disposable fixed-step, snapshot isolation, lives-free)

## Task C1: playtest core — `runScript` (headless, testable)

**Files:** Create `src/editor/playtest.js` (core only here; live loop in C2), `tests/ecs-editor-playtest.test.js`; modify `tests/index.html`.

- [ ] **Step 1: Write the failing test** — create `tests/ecs-editor-playtest.test.js`:

```js
// tests/ecs-editor-playtest.test.js
import { test, assert, assertEqual } from './harness.js';
import { runScript } from '../src/editor/playtest.js';
import { definitionToEditorModel } from '../src/editor/serialize.js';

const eRow = (w) => Array.from({length:w}, () => ({ tile:'empty' }));
const gRow = (w) => Array.from({length:w}, () => ({ tile:'ground' }));
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

// player starts ON the finish trigger -> a no-op script reaches levelClear immediately.
function modelWithFinishUnderPlayer() {
  return definitionToEditorModel({
    engine:'ecs', meta:{name:'p',w:8,h:4}, tiles:[eRow(8),eRow(8),eRow(8),gRow(8)],
    entities:[{type:'player',x:32,y:32},{type:'finish',x:32,y:32}],
  });
}

test('runScript reports levelClear when the player reaches finish (snapshot isolation)', () => {
  const model = modelWithFinishUnderPlayer();
  const before = JSON.stringify(model);
  const r = runScript(model, Array.from({length:10}, () => ({ ...NONE })));
  assertEqual(r.outcome, 'levelClear');
  assertEqual(JSON.stringify(model), before, 'editor model untouched by playtest');
});

test('runScript is deterministic and uses a fresh sim per call', () => {
  const model = modelWithFinishUnderPlayer();
  const a = runScript(model, [ {...NONE} ]); const b = runScript(model, [ {...NONE} ]);
  assertEqual(a.outcome, b.outcome);
});
```

- [ ] **Step 2: Register + run to verify it fails**

Add `await import('./ecs-editor-playtest.test.js');` to `tests/index.html`. Run → FAIL.

- [ ] **Step 3: Implement the core in `src/editor/playtest.js`**:

```js
// src/editor/playtest.js
// Playtest the editor model in the REAL ECS sim. Builds the sim via definitionToWorld()
// directly (never makeSim -> never src/game/*). runScript is the headless, testable core;
// startPlaytest (C2) is the live disposable RAF loop reusing it.
import { definitionToWorld } from '../ecs/loader.js';
import { editorModelToDefinition } from './serialize.js';
import { FIXED_DT } from '../engine/constants.js';

// Build a fresh sim from a SNAPSHOT of the model (editing state never leaks in).
export function simFromModel(model) { return definitionToWorld(editorModelToDefinition(model)); }

// Step a scripted intent list; return the first terminal outcome (lives-free).
export function runScript(model, script) {
  const sim = simFromModel(model);
  for (const intent of script) {
    sim.update(FIXED_DT, intent);
    const s = sim.getStatus();
    if (s.levelClear) return { outcome: 'levelClear', sim };
    if (s.playerDied || s.fell) {
      if (sim.canRespawnInPlace()) sim.respawn();           // lives-free: respawn and continue
      else return { outcome: 'died', sim };
    }
  }
  return { outcome: 'running', sim };
}
```

- [ ] **Step 4: Run to verify it passes** → PASS, FAIL 0.

- [ ] **Step 5: Commit**

```bash
git add src/editor/playtest.js tests/ecs-editor-playtest.test.js tests/index.html
git commit -m "feat(editor): playtest core runScript (definitionToWorld snapshot; lives-free)"
```

## Task C2: playtest live loop — `startPlaytest` (disposable, fixed-step)

**Files:** Modify `src/editor/playtest.js`.

- [ ] **Step 1: Implement `startPlaytest`** — append to `src/editor/playtest.js`:

```js
import { createRenderer } from '../render/renderer.js';
import { createInput } from '../engine/input.js';
import { createCamera } from '../engine/camera.js';

// Live, disposable playtest on the 256x240 game canvas. Returns nothing; calls onStop
// when the user exits. Fixed-step accumulator (matches real play); fully tears down.
export function startPlaytest(model, onStop) {
  const snapshot = editorModelToDefinition(model);     // frozen at Play time
  let sim = definitionToWorld(snapshot);

  const overlay = document.createElement('div'); overlay.id = 'pt-overlay';
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 240; canvas.id = 'pt-canvas';
  const banner = document.createElement('div'); banner.id = 'pt-banner';
  const stopBtn = document.createElement('button'); stopBtn.textContent = 'Stop (Esc)';
  overlay.append(canvas, banner, stopBtn); document.body.append(overlay);

  const renderer = createRenderer(canvas);
  const input = createInput(); input.attach(window);
  const cam = createCamera({ viewW: 256, viewH: 240, bounds: sim.getBounds() });

  let raf = 0, acc = 0, prev = null, alive = true;
  function frame(now) {
    if (!alive) return;
    if (prev == null) prev = now;
    acc += Math.min(0.25, (now - prev) / 1000); prev = now;
    while (acc >= FIXED_DT) {
      input.beginFrame();
      sim.update(FIXED_DT, input.consumeIntent());
      const s = sim.getStatus();
      if (s.levelClear) banner.textContent = 'Level complete!';
      else if (s.playerDied || s.fell) {
        if (sim.canRespawnInPlace()) { sim.respawn(); banner.textContent = 'Respawned'; }
        else { sim = definitionToWorld(snapshot); banner.textContent = 'Restarted'; }
      }
      cam.bounds = sim.getBounds();
      acc -= FIXED_DT;
    }
    renderer.draw(sim.getRenderView(), cam, 0, { score:0, coins:0, lives:0, levelIndex:0 }, 'playing');
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function stop() {
    alive = false; cancelAnimationFrame(raf);
    input.dispose();                       // detach listeners (B1)
    window.removeEventListener('keydown', onEsc);
    overlay.remove();                      // clears banner + canvas
    onStop && onStop();
  }
  function onEsc(e) { if (e.key === 'Escape') stop(); }
  window.addEventListener('keydown', onEsc);
  stopBtn.onclick = stop;
}
```

- [ ] **Step 2: Verify parse + suite** — `node --check src/editor/playtest.js` parses; `bash tools/run-tests.sh` → FAIL 0 (runScript core still green; live loop is Stage E smoke).

- [ ] **Step 3: Commit**

```bash
git add src/editor/playtest.js
git commit -m "feat(editor): disposable fixed-step live playtest (lives-free; full teardown)"
```

**STAGE C CHECKPOINT:** editor is functionally complete; playtest core tested, live loop disposable. `?editor=1` is now browser-runnable (smoke in Stage E).

---

# STAGE D — Issue #6 bundle (respawn FX, sprites, level-1, completion)

## Task D1: respawn FX cleanup (main.js)

**Files:** Modify `src/main.js`.

- [ ] **Step 1: Locate the state-transition block** in `startGame()`'s `afterFrame` (the existing `if (gs.state !== prevState ...) effects.clear()` for intro/title). Add FX + hitstop clear when entering `playing` from `dying` via respawn. Replace:
```js
    if (gs.state !== prevState && (gs.state === STATES.intro || gs.state === STATES.title)) effects.clear();
```
with:
```js
    if (gs.state !== prevState && (gs.state === STATES.intro || gs.state === STATES.title)) effects.clear();
    if (gs.state === STATES.playing && prevState === STATES.dying) { effects.clear(); hitstop.clear(); }  // in-place respawn: drop lingering FX
```

- [ ] **Step 2: Verify `hitstop.clear()` exists** — Run: `grep -n "clear" src/engine/hitstop.js`. If `createHitstop()` has no `clear`, add one: a method that resets its internal frames counter to 0. Show it:
```js
// in src/engine/hitstop.js, add to the returned object:
clear() { frames = 0; }   // (use the actual internal counter name)
```

- [ ] **Step 3: Verify** — `node --check src/main.js`; `bash tools/run-tests.sh` → 206/0 (classic path unaffected: `dying→playing` only happens via the ECS respawn branch, which classic never takes). 

- [ ] **Step 4: Commit**

```bash
git add src/main.js src/engine/hitstop.js
git commit -m "fix(main): clear FX + hitstop on in-place respawn (dying->playing) [Issue #6]"
```

## Task D2: real sprites for spring/conveyor/checkpoint/finish

**Files:** Modify `src/render/sprites.js`, `src/render/renderer.js`, `tests/renderer-readonly.test.js`.

- [ ] **Step 1: Add four 16×16 sprites** to `src/render/sprites.js` — author them in the existing string-grid style and expose via `buildSprites`. Add these grids near the other tile grids:
```js
// --- mechanic tiles (original art) ---
const SPRING = [
  '................','................','......####......','.....#OOOO#.....',
  '......####......','.....#OOOO#.....','......####......','.....#OOOO#.....',
  '......####......','......####......','.....######.....','....########....',
  '...##########...','...#GGGGGGGG#...','...##########...','................',
].map(r => r.replace(/O/g,'Y').replace(/#/g,'R').replace(/G/g,'k'));   // red coil, dark base
const CONVEYOR = [
  '................','################','#KKKKKKKKKKKKKK#','#K##K##K##K##K#K#',
  '#KKKKKKKKKKKKKK#','################','..............','................',
  '................','................','................','................',
  '................','................','................','................',
].map(r => r.replace(/#/g,'D').replace(/K/g,'k'));   // belt
const CHECKPOINT = [
  '......G.........','......G####.....','......G#OOO#....','......G####.....',
  '......G.........','......G.........','......G.........','......G.........',
  '......G.........','......G.........','......G.........','......G.........',
  '......G.........','......G.........','......G.........','......G.........',
].map(r => r.replace(/G/g,'k').replace(/#/g,'C').replace(/O/g,'W'));   // pole + green flag
const FINISHFLAG = [
  '......G.........','......G####.....','......G#YYY#....','......G####.....',
  '......G#YYY#....','......G####.....','......G.........','......G.........',
  '......G.........','......G.........','......G.........','......G.........',
  '......G.........','......G.........','......G.........','......G.........',
].map(r => r.replace(/G/g,'k').replace(/#/g,'O').replace(/Y/g,'W'));   // pole + gold flag
```
> Use palette chars already defined in this file's `PALETTE` (e.g. `R/Y/k/D/C/W/O`); if any char is missing, pick an existing near color from the palette table at the top of `sprites.js`. Add to the `buildSprites` return:
```js
    spring: grid(SPRING, scale),
    conveyorTile: grid(CONVEYOR, scale),
    checkpointFlag: grid(CHECKPOINT, scale),
    finishFlag: grid(FINISHFLAG, scale),
```

- [ ] **Step 2: Replace the placeholder markers** in `src/render/renderer.js` — swap the colored-rect branch for sprite draws:
```js
      if (e.type === 'spring' || e.type === 'conveyor' || e.type === 'checkpoint' || e.type === 'finish') {
        const SPR = { spring:'spring', conveyor:'conveyorTile', checkpoint:'checkpointFlag', finish:'finishFlag' };
        const img = sprites[SPR[e.type]];
        if (e.type === 'conveyor') { for (let dx = 0; dx < e.w; dx += TILE) ctx.drawImage(img, Math.round(p.x + dx - cam.x), Math.round(p.y), Math.min(TILE, e.w - dx), e.h); }
        else ctx.drawImage(img, Math.round(p.x - cam.x), Math.round(p.y), TILE, e.h);
        continue;
      }
```

- [ ] **Step 3: Run to verify** — `bash tools/run-tests.sh` → the `renderer.draw mutates nothing` + new-entity-types render tests stay green; classic + both ECS golden masters unchanged (sprites are cosmetic, not sim). FAIL 0. (Extend `tests/renderer-readonly.test.js` only if a new assertion is useful; the existing "draws every new entity type without throwing" already covers these.)

- [ ] **Step 4: Commit**

```bash
git add src/render/sprites.js src/render/renderer.js tests/renderer-readonly.test.js
git commit -m "feat(render): real sprites for spring/conveyor/checkpoint/finish [Issue #6]"
```

## Task D3: `level-1.js` from the editor export path + completion test

**Files:** Create `src/levels/ecs/level-1.js`, `tests/ecs-level-1-complete.test.js`; modify `tests/index.html`.

- [ ] **Step 1: Author `level-1` via the export path.** In a browser at `?editor=1`, build (or load demo-2 and tune) a level that a simple right-walk + jumps **completes** — finish reachable on flat-ish ground, platform timing forgiving, hazard off the main path. Export (Copy) and save the emitted module as `src/levels/ecs/level-1.js`. **If hand-finishing is faster for the agent**, author it directly in the editor's export format (compact legend + rows + entities) so it still proves the contract. A known-good shape (flat ground, gentle gaps the player can jump, finish at the end):
```js
// src/levels/ecs/level-1.js  (authored via the editor export path)
const T = { ' ': 'empty', '#': 'ground', 'B': 'brick', 'U': 'upgrade-block', 'C': 'coin-block', 'o': 'coin', 'x': 'used-block', 'P': 'pipe', 'p': 'pipe-deco' };
const rows = [
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "                                        ",
  "              o      o                  ",
  "########################################",
  "########################################",
].map(r => [...r].map(ch => ({ tile: T[ch] })));
export default {
  engine: 'ecs',
  meta: { name: 'Level 1', w: 40, h: 15 },
  tiles: rows,
  entities: [
    { type: 'player', x: 32, y: 192 },
    { type: 'checkpoint', x: 320, y: 192, trigger: { spawnX: 320, spawnY: 192 } },
    { type: 'enemy', x: 256, y: 192, walker: { speed: 24, dir: -1 } },
    { type: 'finish', x: 608, y: 192 },
  ],
};
```
> This is deliberately flat so a **stable, boring** right-walk completes it (it proves the editor→content→play loop; richer mechanic gauntlets can come later). It is a valid `engine:'ecs'` module the loader accepts.

- [ ] **Step 2: Write the completion test** — create `tests/ecs-level-1-complete.test.js`:

```js
// tests/ecs-level-1-complete.test.js
import { test, assert } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import LEVEL1 from '../src/levels/ecs/level-1.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('level-1 is completable by a stable, boring walk-right-with-hops run', () => {
  const w = definitionToWorld(LEVEL1);
  let cleared = false;
  for (let i = 0; i < 1200 && !cleared; i++) {           // ~20s budget at 1/60
    const intent = { ...NONE, right: true, jumpPressed: i % 45 === 0, jumpHeld: i % 45 < 8 };
    w.update(1/60, intent);
    if (w.getStatus().levelClear) cleared = true;
    else if (w.getStatus().fell) w.respawn();             // lives-free safety net
  }
  assert(cleared, 'reached the finish (levelClear) under a boring scripted run');
});
```

- [ ] **Step 3: Register + run** — add `await import('./ecs-level-1-complete.test.js');` to `tests/index.html`. Run `bash tools/run-tests.sh`. The test must PASS (the walk reaches finish). If it does not complete, adjust `level-1`'s layout (flatten further / move finish) until a boring run completes — do NOT make the script frame-perfect. FAIL 0.

- [ ] **Step 4: Commit**

```bash
git add src/levels/ecs/level-1.js tests/ecs-level-1-complete.test.js tests/index.html
git commit -m "feat(ecs): level-1 authored via editor export path + completion coverage [Issue #6]"
```

**STAGE D CHECKPOINT:** Issue #6 fully bundled — respawn FX, real sprites, a completable editor-authored level with a stable completion test.

---

# STAGE E — Final verification

## Task E1: full suite, golden masters, browser smoke, export round-trip

**Files:** none (verification only).

- [ ] **Step 1: Full suite** — `bash tools/run-tests.sh` → `PASS n / FAIL 0`, n = 206 + the new editor/level tests.

- [ ] **Step 2: Golden masters unchanged** — `grep -n "GOLDEN =" tests/determinism.test.js tests/ecs-determinism.test.js tests/ecs-determinism-2.test.js` → classic `{"px":94,...}`, demo-1, demo-2 all unchanged.

- [ ] **Step 3: Browser smoke** (CDP driver as in prior cycles; start `:8011` + headless Chrome `--remote-debugging-port=9222`). Assert, per page, **no console exceptions**:
  - `index.html` (classic) — boots & plays.
  - `index.html?ecsdemo=1` and `?ecsdemo=2` — boot & render (regression).
  - `index.html?editor=1` — **editor boots, the game does NOT** (assert no audio/game-loop side effects: e.g. evaluate that `document.getElementById('ed-canvas')` exists and `document.getElementById('game')` was replaced/absent). Drive: click a tile palette button + canvas (paint), click Validate (status shows VALID/INVALID), click Play (a `#pt-canvas` appears and steps), press Escape (playtest tears down — `#pt-canvas` gone, editor canvas back), click Copy/Download (no throw).
  Capture an editor screenshot for visual confirmation.

- [ ] **Step 4: Export round-trip assertion** — in the smoke (or a final harness test), confirm `editorModelToModuleText(definitionToEditorModel(DEMO2))` evaluates to a definition `definitionToWorld` accepts (already covered by A2; re-assert end-to-end).

- [ ] **Step 5: Clean working tree** — `git status --porcelain` shows only the unrelated untracked `ios/`, `password/`, `tools/*.html`.

- [ ] **Step 6: Hand off** — use `superpowers:finishing-a-development-branch`. Note Issue #6 items retired (respawn FX, sprites, level-1 completion) — comment/close on Issue #6.

---

## Self-review notes (for the implementer)

- **Spec coverage:** §2 router+gating (B2) & separation-via-`definitionToWorld` (C1/C2); §3 model (A3), serialize seam incl. invariants (A1), compact export-only (A2); §3.3 validate `{ok,errors,warnings}` (A4); §4 UI/property-schema/load/export (B4), four-constraint playtest (C1 snapshot+lives-free, C2 fixed-step+disposable); `createInput().dispose()` (B1); §5 Issue #6 (D1 FX, D2 sprites, D3 level-1+completion); §7 two-tier acceptance (E1 separates MVP smoke from Issue #6 tests). All map to tasks.
- **Type consistency:** `definitionToEditorModel`/`editorModelToDefinition`/`editorModelToModuleText`, `TILE_LEGEND`/`KIND_TO_CHAR`, `validateModel`→`{ok,errors,warnings}`, `blankModel`/`paintTile`/`floodFill`/`placeEntity`/`moveEntity`/`deleteEntity`/`setEntityProp`/`resize`, `screenToTile`/`tileToScreen`/`drawEditor`, `entityAt`/`snap`, `simFromModel`/`runScript`/`startPlaytest` used identically across tasks.
- **Determinism/safety:** editor imports `definitionToWorld` not `makeSim` (no `src/game/*`); playtest steps fixed `FIXED_DT`; `dispose()` additive (game unchanged); sprites cosmetic (golden masters unaffected).
- **DOM caveat:** `editor.js`/`render.js` draw + `startPlaytest` live loop are browser-smoke-verified (E1), not unit-tested; their pure cores (`screenToTile`/`entityAt`/`runScript`/serialize/model/validate) are fully unit-tested.
