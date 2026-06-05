// tests/ecs-mechanics.test.js
import { test, assert, assertEqual } from './harness.js';
import { instantiate, TYPE_REGISTRY } from '../src/ecs/components.js';
import { definitionToWorld } from '../src/ecs/loader.js';

test('registry knows the new mechanic types', () => {
  for (const t of ['spring','conveyor','checkpoint','finish','enemy']) {
    assert(t in TYPE_REGISTRY, `${t} registered`);
  }
});
test('spring/conveyor carry their effect components', () => {
  assert('bouncer' in instantiate('spring').c, 'spring has bouncer');
  assert('conveyor' in instantiate('conveyor').c, 'conveyor has conveyor');
});
test('checkpoint and finish carry a tagged trigger', () => {
  assertEqual(instantiate('checkpoint').c.trigger.tag, 'checkpoint');
  assertEqual(instantiate('finish').c.trigger.tag, 'finish');
});
test('enemy has body+walker and stompable/hazard tags', () => {
  const e = instantiate('enemy').c;
  assert('body' in e && 'walker' in e, 'enemy has body+walker');
  assert(e.tags.includes('stompable') && e.tags.includes('hazard'), 'enemy capability tags');
});
test('loader builds a world with the new types', () => {
  const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
  const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'm', w: 10, h: 4 },
    tiles: [emptyRow(10), emptyRow(10), emptyRow(10), groundRow(10)],
    entities: [
      { type: 'player', x: 16, y: 0 },
      { type: 'spring', x: 32, y: 32 }, { type: 'conveyor', x: 48, y: 32 },
      { type: 'checkpoint', x: 64, y: 16 }, { type: 'finish', x: 80, y: 16 },
      { type: 'enemy', x: 96, y: 32 },
    ],
  });
  assertEqual(w.entities.length, 6);
});

import { stepWorld } from '../src/ecs/world-ecs.js';
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const eRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const gRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));

test('conveyor pushes a standing rider horizontally, clamped', () => {
  // a WIDE belt (w:96) so the rider stays on it through the measurement window.
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'cv', w: 16, h: 6 },
    tiles: [eRow(16), eRow(16), eRow(16), eRow(16), eRow(16), gRow(16)],
    entities: [
      { type: 'player', x: 40, y: 16 },
      { type: 'conveyor', x: 24, y: 48, transform: { w: 96 }, conveyor: { pushX: 80 } },
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  for (let i = 0; i < 15; i++) stepWorld(w, 1/60, NONE);   // land on the wide belt
  const x0 = pl.c.transform.x;
  for (let i = 0; i < 20; i++) stepWorld(w, 1/60, NONE);   // carried by the belt (no input)
  assert(pl.c.transform.x > x0 + 2, 'belt pushed the rider');
  assert(Math.abs(pl.c.body.vx) <= pl.c.control.maxVx + 1e-6, 'vx never exceeds the rider cap');
});
