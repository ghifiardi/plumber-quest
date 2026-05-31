import { test, assert, assertEqual, assertClose } from './harness.js';
import { overlap, resolveAgainstTiles } from '../src/engine/aabb.js';

test('overlap detects intersection and rejects separation', () => {
  assert(overlap({x:0,y:0,w:10,h:10}, {x:5,y:5,w:10,h:10}));
  assert(!overlap({x:0,y:0,w:10,h:10}, {x:20,y:0,w:10,h:10}));
});

// solid(col,row) -> bool. Tile size 16. A floor at row 10.
const floor = (c, r) => r === 10;

test('falling box lands on floor and reports landedOnTop', () => {
  const box = { x: 32, y: 150, w: 12, h: 16, vx: 0, vy: 40 };
  const facts = resolveAgainstTiles(box, floor, 16, 1/60);
  assertClose(box.y + box.h, 160, 0.5);     // rests on top of row 10 (y=160)
  assertEqual(box.vy, 0);
  assert(facts.landedOnTop);
});

test('upward box hits ceiling and reports hitFromBelow with tile coords', () => {
  const ceil = (c, r) => r === 5;            // tile spans y=80..96 (row*16 .. row*16+16)
  // Box top must actually cross into row 5. Start at y=98 (top in row 6), move up 3px
  // (vy=-180 * 1/60 = -3) to y=95 -> top in row 5 -> collision.
  const box = { x: 32, y: 98, w: 12, h: 16, vx: 0, vy: -180 };
  const facts = resolveAgainstTiles(box, ceil, 16, 1/60);
  assertEqual(box.y, 96, 'snapped to bottom edge of ceiling tile');
  assertEqual(box.vy, 0);
  assert(facts.hitFromBelow);
  assertEqual(facts.tilesHitBelow[0].row, 5);
});

test('horizontal move into wall reports sideBlocked', () => {
  const wall = (c, r) => c === 6;            // wall column spans x=96..112
  // vx must carry the box's right edge INTO col 6 this step without overshooting it:
  // right edge = 80 + vx/60 + 12 must land in [96,111] -> vx in [240,1140]. Use 600.
  const box = { x: 80, y: 0, w: 12, h: 12, vx: 600, vy: 0 };
  const facts = resolveAgainstTiles(box, wall, 16, 1/60);
  assertEqual(box.x, 84, 'snapped against left face of the wall (96-12)');
  assertEqual(box.vx, 0);
  assert(facts.sideBlocked);
});

test('diagonal move into a block corner does not tunnel through (corner clip)', () => {
  const block = (c, r) => c === 5 && r === 5;        // single solid tile: x80..96, y80..96
  const box = { x: 70, y: 100, w: 12, h: 12, vx: 240, vy: -480 }; // up-and-right toward its corner
  const facts = resolveAgainstTiles(box, block, 16, 1/60);
  const overlaps = box.x < 96 && box.x + box.w > 80 && box.y < 96 && box.y + box.h > 80;
  assert(!overlaps, 'box must not end up inside the solid tile');
  assert(facts.hitFromBelow || facts.sideBlocked || facts.landedOnTop, 'a collision was actually reported');
});
