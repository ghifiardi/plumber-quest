// tests/fx-overlay.test.js
import { test, assert } from './harness.js';
import { createFxOverlay } from '../src/fx/fx-overlay.js';

function stubCtx() {
  const noop = () => {};
  return new Proxy({ canvas: { width: 256, height: 240 } }, {
    get: (t, k) => (k === 'canvas' ? t.canvas : noop), set: () => true,
  });
}

test('draw renders particles + flash without throwing and mutates no input', () => {
  const o = createFxOverlay(stubCtx());
  const list = Object.freeze([Object.freeze({ x: 10, y: 20, life: 0.3, ttl: 0.5, color: '#fff', size: 2 })]);
  o.draw(list, { x: 5 }, 0.4);
  o.draw([], { x: 0 }, 0);
  assert(true, 'no throw, no mutation');
});
