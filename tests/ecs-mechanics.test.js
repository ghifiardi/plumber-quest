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
