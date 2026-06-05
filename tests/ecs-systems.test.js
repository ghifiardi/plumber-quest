// tests/ecs-systems.test.js
import { test, assert, assertEqual } from './harness.js';
import { makeSolid } from '../src/engine/tile-collision.js';

const cell = (k) => ({ tile: k });
// 3 cols x 2 rows: top row empty, bottom row ground
const TILES = [
  [cell('empty'), cell('empty'), cell('empty')],
  [cell('ground'), cell('ground'), cell('ground')],
];

test('makeSolid: ground row is solid, empty row is not', () => {
  const solid = makeSolid(TILES);
  assertEqual(solid(0, 1), true);
  assertEqual(solid(1, 0), false);
});

test('makeSolid: out-of-bounds is not solid', () => {
  const solid = makeSolid(TILES);
  assertEqual(solid(-1, 0), false);
  assertEqual(solid(0, 99), false);
});

import { definitionToWorld } from '../src/ecs/loader.js';
import { stepWorld } from '../src/ecs/world-ecs.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
const emptyRow  = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));

// 12 wide, 4 tall: rows 0-2 empty, row 3 ground. Player at (16,32). Platform at (64,32).
function demoWorld() {
  return definitionToWorld({
    engine: 'ecs',
    meta: { name: 'd', w: 12, h: 4 },
    tiles: [emptyRow(12), emptyRow(12), emptyRow(12), groundRow(12)],
    entities: [
      { type: 'player', x: 16, y: 32 },
      { type: 'platform', x: 64, y: 40, mover: { axis: 'x', dist: 32, speed: 30 } },
    ],
  });
}

test('physics: player falls and lands on the ground row', () => {
  const w = demoWorld();
  const pl = w.entities.find(e => e.type === 'player');
  for (let i = 0; i < 60; i++) stepWorld(w, 1/60, NONE);
  // ground top is row 3 => y=48; player h=16 => rests at y=32
  assert(Math.abs((pl.c.transform.y + pl.c.transform.h) - 48) < 1.0, 'feet at ground top');
  assert(pl.c.body.onGround, 'onGround true');
  assert(Math.abs(pl.c.body.vy) < 1e-3, 'vy settled');
});

test('movement: holding right moves the player right', () => {
  const w = demoWorld();
  const pl = w.entities.find(e => e.type === 'player');
  for (let i = 0; i < 20; i++) stepWorld(w, 1/60, NONE);     // settle
  const x0 = pl.c.transform.x;
  for (let i = 0; i < 20; i++) stepWorld(w, 1/60, { ...NONE, right: true });
  assert(pl.c.transform.x > x0 + 4, 'moved right');
  assertEqual(pl.c.control.facing, 1);
});

test('jump: pressing jump while grounded emits a jump event and lifts the player', () => {
  const w = demoWorld();
  const pl = w.entities.find(e => e.type === 'player');
  for (let i = 0; i < 30; i++) stepWorld(w, 1/60, NONE);     // settle on ground
  const evs = stepWorld(w, 1/60, { ...NONE, jumpPressed: true, jumpHeld: true });
  assert(evs.some(e => e.type === 'jump'), 'jump event emitted');
  assert(pl.c.body.vy < 0, 'moving upward after jump');
});

test('carry: player standing on an x-moving platform rides it', () => {
  // Player spawns directly above the platform so it lands on it, away from any wall.
  const w = definitionToWorld({
    engine: 'ecs',
    meta: { name: 'c', w: 12, h: 6 },
    tiles: [emptyRow(12), emptyRow(12), emptyRow(12), emptyRow(12), emptyRow(12), groundRow(12)],
    entities: [
      { type: 'player', x: 64, y: 16 },
      { type: 'platform', x: 64, y: 48, mover: { axis: 'x', dist: 40, speed: 40 } },
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  const plat = w.entities.find(e => e.type === 'platform');
  for (let i = 0; i < 40; i++) stepWorld(w, 1/60, NONE);   // land on platform, ride a while
  assert(pl.c.body.standingOn === plat.id || pl.c.body.onGround, 'resting on platform');
  // player x should track the platform x (within a tile)
  assert(Math.abs(pl.c.transform.x - plat.c.transform.x) < 16, 'rides with platform');
});
