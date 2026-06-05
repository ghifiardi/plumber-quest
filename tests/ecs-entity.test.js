// tests/ecs-entity.test.js
import { test, assert, assertEqual } from './harness.js';
import { makeEntity } from '../src/ecs/entity.js';

test('makeEntity stores id, type, and component bags under c', () => {
  const e = makeEntity(3, 'player', { transform: { x: 1, y: 2 } });
  assertEqual(e.id, 3);
  assertEqual(e.type, 'player');
  assertEqual(e.c.transform.x, 1);
  assert('transform' in e.c, 'component presence check via "in e.c"');
});

test('makeEntity with no components yields empty c', () => {
  const e = makeEntity(0, 'thing');
  assertEqual(e.id, 0);
  assertEqual(Object.keys(e.c).length, 0);
});
