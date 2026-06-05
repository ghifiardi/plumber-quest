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
