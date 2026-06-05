// tests/ecs-determinism-2.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import DEMO2 from '../src/levels/ecs/demo-2.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
function script() {
  const s = [];
  for (let i = 0; i < 20; i++) s.push({ ...NONE });
  for (let i = 0; i < 120; i++) s.push({ ...NONE, right: true });
  for (let i = 0; i < 20; i++) s.push({ ...NONE, right: true, jumpPressed: i === 0, jumpHeld: true });
  return s;
}
function fingerprint(w) {
  const p = w.entities.find(e => e.type === 'player').c;
  return JSON.stringify({
    px: Math.round(p.transform.x), py: Math.round(p.transform.y),
    pvx: Math.round(p.body.vx), pvy: Math.round(p.body.vy),
    ents: w.entities.map(e => e.type).sort(),
  });
}
function tileGrid(w) { return JSON.stringify(w.tiles.map(row => row.map(c => c.tile))); }

function play() {
  const w = definitionToWorld(DEMO2);
  const before = tileGrid(w);
  for (const it of script()) w.update(1/60, it);
  return { fp: fingerprint(w), tilesBefore: before, tilesAfter: tileGrid(w) };
}

test('ECS demo-2 determinism: identical fingerprint across 3 runs', () => {
  const a = play(), b = play(), c = play();
  assertEqual(a.fp, b.fp); assertEqual(b.fp, c.fp);
});

test('tiles invariant: world.tiles unchanged after a scripted run (structural snapshot)', () => {
  const r = play();
  assertEqual(r.tilesAfter, r.tilesBefore, 'cycle 2 never mutates world.tiles');
});

// GOLDEN MASTER — record on first green run, then lock.
const GOLDEN = "{\"px\":352,\"py\":618,\"pvx\":140,\"pvy\":600,\"ents\":[\"checkpoint\",\"conveyor\",\"enemy\",\"finish\",\"platform\",\"player\",\"spring\"]}";
test('ECS demo-2 determinism: fingerprint matches the recorded golden master', () => {
  const { fp } = play();
  if (GOLDEN === '__RECORD_ON_FIRST_RUN__') throw new Error('GOLDEN not set — set: const GOLDEN = ' + JSON.stringify(fp) + ';');
  assertEqual(fp, GOLDEN);
});
