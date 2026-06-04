// tests/renderer-extras.test.js
import { test, assert, assertEqual } from './harness.js';
import { heroSquash, wipeProgress } from '../src/render/renderer.js';

test('stretches (taller, narrower) when rising fast', () => {
  const s = heroSquash({ vy: -300, onGround: false }, 0);
  assert(s.sy > 1 && s.sx < 1, `stretch: sx=${s.sx} sy=${s.sy}`);
  assert(Math.abs(s.sx * s.sy - 1) < 0.06, 'roughly volume-preserving');
});

test('squashes (shorter, wider) right after landing', () => {
  const s = heroSquash({ vy: 0, onGround: true }, 1);
  assert(s.sy < 1 && s.sx > 1, `squash: sx=${s.sx} sy=${s.sy}`);
});

test('neutral when standing with no landing impulse', () => {
  const s = heroSquash({ vy: 0, onGround: true }, 0);
  assertEqual(s.sx, 1); assertEqual(s.sy, 1);
});

test('wipeProgress ramps 0->1 over the duration then clamps', () => {
  assertEqual(wipeProgress(0, 0.3), 0);
  assert(Math.abs(wipeProgress(0.15, 0.3) - 0.5) < 0.001, 'half way');
  assertEqual(wipeProgress(0.3, 0.3), 1);
  assertEqual(wipeProgress(5, 0.3), 1, 'clamped');
});
