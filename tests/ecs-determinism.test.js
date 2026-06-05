// tests/ecs-determinism.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import DEMO1 from '../src/levels/ecs/demo-1.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

function script() {
  const s = [];
  for (let i = 0; i < 20; i++) s.push({ ...NONE });                 // settle
  s.push({ ...NONE, jumpPressed: true, jumpHeld: true });           // hop
  for (let i = 0; i < 60; i++) s.push({ ...NONE, right: true });    // run right
  return s;
}

function fingerprint(w) {
  const p = w.entities.find(e => e.type === 'player').c;
  const plat = w.entities.find(e => e.type === 'platform').c;
  return JSON.stringify({
    px: Math.round(p.transform.x), py: Math.round(p.transform.y),
    pvx: Math.round(p.body.vx), pvy: Math.round(p.body.vy),
    mx: Math.round(plat.transform.x),
  });
}

function play() {
  const w = definitionToWorld(DEMO1);
  const events = [];
  for (const it of script()) { w.update(1/60, it); for (const e of w.drainEvents()) events.push(e.type); }
  return { fp: fingerprint(w), jumps: events.filter(t => t === 'jump').length };
}

test('ECS determinism: identical fingerprint across 3 runs', () => {
  const a = play(), b = play(), c = play();
  assertEqual(a.fp, b.fp);
  assertEqual(b.fp, c.fp);
  assert(a.jumps >= 1, 'at least one jump event fired');
});

// GOLDEN MASTER — record on first green run (see below), then lock.
const GOLDEN = "{\"px\":165,\"py\":192,\"pvx\":140,\"pvy\":0,\"mx\":310}";

test('ECS determinism: fingerprint matches the recorded golden master', () => {
  const { fp } = play();
  if (GOLDEN === '__RECORD_ON_FIRST_RUN__') {
    throw new Error('GOLDEN not set — set: const GOLDEN = ' + JSON.stringify(fp) + ';');
  }
  assertEqual(fp, GOLDEN);
});
