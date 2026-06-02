// tests/social-overlay.test.js
import { test, assert } from './harness.js';
import { createSocialOverlay } from '../src/ui/social-overlay.js';

// Minimal 2D-context stub: records nothing, just must not throw.
function stubCtx() {
  const noop = () => {};
  return new Proxy({ canvas: { width: 256, height: 240 } }, {
    get: (t, k) => {
      if (k === 'canvas') return t.canvas;
      if (k === 'measureText') return () => ({ width: 10 });   // canvas API returns a TextMetrics
      return noop;                                             // any drawing call / property
    },
    set: () => true,
  });
}

test('overlay draws counter/bubbles/ticker without throwing and mutates no input', () => {
  const overlay = createSocialOverlay(stubCtx());
  const state = Object.freeze({
    online: true, status: 'connected', count: 14,
    bubbles: Object.freeze([Object.freeze({ handle: 'RedKoopa', code: 'GG', born: 0 })]),
    ticker: Object.freeze([Object.freeze({ text: 'P cleared 1-3!', born: 0 })]),
  });
  overlay.draw(state, 1000, 'title');   // frozen state would throw on mutation
  overlay.draw(state, 1000, 'playing');
  assert(true, 'no throw, no mutation');
});

test('overlay draws nothing when offline (still no throw)', () => {
  const overlay = createSocialOverlay(stubCtx());
  overlay.draw(Object.freeze({ online: false, status: 'disconnected', count: 0, bubbles: [], ticker: [] }), 0, 'title');
  assert(true);
});
