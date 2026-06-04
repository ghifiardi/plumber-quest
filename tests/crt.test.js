// tests/crt.test.js
import { test, assert, assertEqual } from './harness.js';
import { createCrt, CRT_KEY } from '../src/render/crt.js';

function stubCtx() {
  const noop = () => {};
  return new Proxy({ canvas: { width: 256, height: 240 } }, {
    get: (t, k) => (k === 'canvas' ? t.canvas : (k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop)),
    set: () => true,
  });
}

test('off by default; toggle persists; draw is a no-op when off', () => {
  localStorage.removeItem(CRT_KEY);
  const crt = createCrt(stubCtx());
  assertEqual(crt.isOn(), false, 'default off');
  crt.draw();
  crt.toggle();
  assertEqual(crt.isOn(), true);
  assertEqual(localStorage.getItem(CRT_KEY), '1', 'persisted on');
  crt.draw();
  assert(true);
});

test('reads persisted preference on construction', () => {
  localStorage.setItem(CRT_KEY, '1');
  assertEqual(createCrt(stubCtx()).isOn(), true);
});
