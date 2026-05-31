import { test, assert, assertEqual, assertThrows, assertDeepEqual } from './harness.js';
import { parseLevel } from '../src/levels/level-format.js';

const TILE = 16;

test('parses tiles, spawns, player, single finish', () => {
  const rows = [
    '----F---',
    '--U-?---',
    'P-o-----',
    'XXXXXXXX',
  ];
  const lvl = parseLevel(rows, { tile: TILE });
  assertEqual(lvl.width, 8);
  assertEqual(lvl.height, 4);
  assertDeepEqual(lvl.playerSpawn, { x: 0, y: 2 * TILE });
  assertDeepEqual(lvl.finish, { x: 4 * TILE, y: 0 });
  assertEqual(lvl.tiles[1][2].tile, 'upgrade-block');
  assertEqual(lvl.tiles[1][4].tile, 'coin-block');
  assertEqual(lvl.tiles[2][2].tile, 'coin');     // 'o'
  assertEqual(lvl.tiles[3][0].tile, 'ground');
  // spawn/trigger chars normalize to empty
  assertEqual(lvl.tiles[2][0].tile, 'empty');    // P
  assertEqual(lvl.tiles[0][4].tile, 'empty');    // F
});

test('goomba spawn recorded and normalized to empty', () => {
  const lvl = parseLevel(['P-G-F', 'XXXXX'], { tile: TILE });
  assertEqual(lvl.entitySpawns.length, 1);
  assertEqual(lvl.entitySpawns[0].type, 'goomba');
  assertEqual(lvl.entitySpawns[0].x, 2 * TILE);
  assertEqual(lvl.tiles[0][2].tile, 'empty');
});

test('space aliases empty', () => {
  const lvl = parseLevel(['P  F', 'XXXX'], { tile: TILE });
  assertEqual(lvl.tiles[0][1].tile, 'empty');
});

test('throws when not exactly one player spawn', () => {
  assertThrows(() => parseLevel(['--F', 'XXX'], { tile: TILE }), 'no player');
  assertThrows(() => parseLevel(['PPF', 'XXX'], { tile: TILE }), 'two players');
});

test('throws when not exactly one finish', () => {
  assertThrows(() => parseLevel(['P--', 'XXX'], { tile: TILE }), 'no finish');
  assertThrows(() => parseLevel(['PFF', 'XXX'], { tile: TILE }), 'two finishes');
});

test('throws on ragged rows and unknown chars', () => {
  assertThrows(() => parseLevel(['PF', 'XXX'], { tile: TILE }), 'ragged');
  assertThrows(() => parseLevel(['P@F', 'XXX'], { tile: TILE }), 'unknown char');
});
