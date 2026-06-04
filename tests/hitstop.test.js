// tests/hitstop.test.js
import { test, assert, assertEqual } from './harness.js';
import { createHitstop } from '../src/engine/hitstop.js';

test('step() returns true exactly `frames` times after trigger, then false', () => {
  const hs = createHitstop();
  assertEqual(hs.step(), false, 'idle: no freeze');
  hs.trigger(3);
  assertEqual(hs.active(), true);
  assertEqual(hs.step(), true);
  assertEqual(hs.step(), true);
  assertEqual(hs.step(), true);
  assertEqual(hs.step(), false);
  assertEqual(hs.active(), false);
});

test('trigger takes the max (does not stack)', () => {
  const hs = createHitstop();
  hs.trigger(2); hs.trigger(5); hs.trigger(1);
  let n = 0; while (hs.step()) n++;
  assertEqual(n, 5);
});
