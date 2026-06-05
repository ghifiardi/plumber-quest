// tests/ecs-loader.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';

const ground = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
function baseDef(over = {}) {
  return {
    engine: 'ecs',
    meta: { name: 'T', w: 4, h: 2 },
    tiles: [Array.from({ length: 4 }, () => ({ tile: 'empty' })), ground(4)],
    entities: [
      { type: 'player', x: 16, y: 0 },
      { type: 'platform', x: 32, y: 16, mover: { axis: 'x', dist: 16, speed: 20 } },
    ],
    ...over,
  };
}

test('loader builds a world with entities and a tile layer', () => {
  const w = definitionToWorld(baseDef());
  assertEqual(w.entities.length, 2);
  assertEqual(w.tiles.length, 2);
  assertEqual(w.bounds.right, 64);   // 4 cols * 16
  const player = w.entities.find(e => e.type === 'player');
  assertEqual(player.c.transform.x, 16);
});

test('loader deep-merges inline overrides into component bags', () => {
  const w = definitionToWorld(baseDef());
  const plat = w.entities.find(e => e.type === 'platform');
  assertEqual(plat.c.mover.dist, 16);
  assertEqual(plat.c.mover.speed, 20);
  assertEqual(plat.c.mover.axis, 'x');
});

test('loader assigns ids from 0, monotonic', () => {
  const w = definitionToWorld(baseDef());
  const ids = w.entities.map(e => e.id);
  assertEqual(ids[0], 0);
  assertEqual(ids[1], 1);
});

function expectThrow(fn, why) { let t = false; try { fn(); } catch { t = true; } assert(t, why); }

test('loader rejects missing meta fields', () => {
  expectThrow(() => definitionToWorld(baseDef({ meta: { name: 'x' } })), 'missing w/h');
});
test('loader rejects unknown entity type', () => {
  expectThrow(() => definitionToWorld(baseDef({ entities: [{ type: 'dragon', x: 0, y: 0 }] })), 'unknown type');
});
test('loader rejects unknown inline component key', () => {
  expectThrow(() => definitionToWorld(baseDef({
    entities: [{ type: 'player', x: 0, y: 0, wings: { span: 9 } }],
  })), 'unknown component key');
});
test('loader allows editor/meta bags on entities', () => {
  const w = definitionToWorld(baseDef({
    entities: [{ type: 'player', x: 0, y: 0, editor: { note: 'spawn' } }],
  }));
  assertEqual(w.entities.length, 1);
});
test('loader requires exactly one player', () => {
  expectThrow(() => definitionToWorld(baseDef({ entities: [
    { type: 'platform', x: 0, y: 16 }, { type: 'platform', x: 16, y: 16 },
  ] })), 'zero players');
  expectThrow(() => definitionToWorld(baseDef({ entities: [
    { type: 'player', x: 0, y: 0 }, { type: 'player', x: 16, y: 0 },
  ] })), 'two players');
});
test('loader rejects non-rectangular tiles', () => {
  expectThrow(() => definitionToWorld(baseDef({
    tiles: [[{ tile: 'empty' }], ground(4)],   // row 0 too short
  })), 'ragged tiles');
});
