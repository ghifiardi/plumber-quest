// tests/ecs-components.test.js
import { test, assert, assertEqual } from './harness.js';
import { TYPE_REGISTRY, instantiate } from '../src/ecs/components.js';

test('registry knows player and platform', () => {
  assert('player' in TYPE_REGISTRY, 'player registered');
  assert('platform' in TYPE_REGISTRY, 'platform registered');
});

test('instantiate clones template (no shared refs)', () => {
  const a = instantiate('player');
  const b = instantiate('player');
  a.c.transform.x = 999;
  assertEqual(b.c.transform.x, 0, 'b must not see a mutation');
  assert('body' in a.c && 'jump' in a.c, 'player has body+jump');
});

test('instantiate platform has mover, no body', () => {
  const p = instantiate('platform');
  assert('mover' in p.c, 'platform has mover');
  assert(!('body' in p.c), 'platform has no body (kinematic)');
});

test('instantiate unknown type throws', () => {
  let threw = false;
  try { instantiate('nope'); } catch { threw = true; }
  assert(threw, 'unknown type must throw');
});
