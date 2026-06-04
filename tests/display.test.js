// tests/display.test.js
import { test, assert, assertEqual } from './harness.js';
import { computeDisplay } from '../src/engine/display.js';

test('picks the largest integer DEVICE-pixel scale and divides back by dpr', () => {
  const d = computeDisplay(390, 800, 3, true);
  assertEqual(d.scaleDevice, 4, 'device scale = floor(min(1170/256, availDev/240))');
  assert(Math.abs(d.cssW - (256 * 4) / 3) < 0.01, 'cssW = logical*scale/dpr');
  assert(Math.abs(d.cssH - (240 * 4) / 3) < 0.01, 'cssH = logical*scale/dpr');
  assertEqual(d.band, 170, 'touch band reserved (min(170, 800*0.26))');
});

test('desktop (dpr 1, no touch) scales up with no band', () => {
  const d = computeDisplay(1440, 900, 1, false);
  assertEqual(d.band, 0);
  assertEqual(d.scaleDevice, Math.floor(Math.min(1440 / 256, 900 / 240)));
  assertEqual(d.cssW, 256 * d.scaleDevice);
});

test('never returns a sub-1 scale and caps dpr at 4', () => {
  assertEqual(computeDisplay(100, 100, 8, false).scaleDevice >= 1, true);
  const hi = computeDisplay(1000, 1000, 8, false);
  assertEqual(hi.scaleDevice, Math.floor(Math.min((1000 * 4) / 256, (1000 * 4) / 240)));
});
