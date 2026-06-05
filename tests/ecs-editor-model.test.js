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

import { screenToTile, tileToScreen } from '../src/editor/render.js';

test('screenToTile and tileToScreen are inverses (pan + zoom)', () => {
  const view = { panX: 48, zoom: 20 };               // panX world-px, zoom screen-px per 16px tile
  const s = tileToScreen(view, 5, 3);                 // tile (col5,row3) -> screen px
  const t = screenToTile(view, s.sx + 1, s.sy + 1);   // +1px stays inside the same cell
  assertEqual(t.col, 5); assertEqual(t.row, 3);
});
