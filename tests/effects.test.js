// tests/effects.test.js
import { test, assert, assertEqual } from './harness.js';
import { createEffects, FX_COUNT } from '../src/fx/effects.js';

const rng = () => 0.5;   // deterministic spread

test('a coin-collected event spawns the sparkle particle count at the coords', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'coin-collected', x: 40, y: 24 });
  assertEqual(fx.list().length, FX_COUNT.sparkle);
  assert(fx.list().every((p) => p.life > 0 && p.ttl > 0), 'particles alive with ttl');
});

test('events without coords or unknown types spawn nothing', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'coin-collected' });
  fx.handle({ type: 'level-clear', x: 1, y: 1 });
  assertEqual(fx.list().length, 0);
});

test('tick ages particles and removes expired ones', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'enemy-stomped', x: 10, y: 10 });
  assert(fx.list().length > 0);
  for (let i = 0; i < 120; i++) fx.tick(1 / 60);
  assertEqual(fx.list().length, 0, 'all expired');
});

test('pool is capped at max (drop oldest)', () => {
  const fx = createEffects({ rng, max: 10 });
  for (let i = 0; i < 20; i++) fx.handle({ type: 'brick-broken', x: i, y: 0 });
  assert(fx.list().length <= 10, 'capped');
});

test('impact events raise the flash; it decays to 0', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'enemy-stomped', x: 0, y: 0 });
  assert(fx.flash() > 0, 'flash raised');
  for (let i = 0; i < 60; i++) fx.tick(1 / 60);
  assertEqual(fx.flash(), 0, 'flash decayed');
});

test('clear() empties particles and flash', () => {
  const fx = createEffects({ rng });
  fx.handle({ type: 'enemy-stomped', x: 0, y: 0 });
  fx.clear();
  assertEqual(fx.list().length, 0); assertEqual(fx.flash(), 0);
});
