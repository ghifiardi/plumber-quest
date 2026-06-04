// tests/camera.test.js
import { test, assert, assertEqual } from './harness.js';
import { createCamera } from '../src/engine/camera.js';

const wide = { left: 0, top: 0, right: 4000, bottom: 240 };

test('one follow() eases partway toward the target (does not snap)', () => {
  const cam = createCamera({ viewW: 256, viewH: 240, bounds: wide });
  cam.follow({ x: 1000, y: 0, w: 12, h: 16, facing: 1 });
  assert(cam.x > 0, 'moved toward player');
  assert(cam.x < 1000, 'did not snap all the way in one frame');
});

test('look-ahead biases the camera in the facing direction', () => {
  const a = createCamera({ viewW: 256, viewH: 240, bounds: wide });
  const b = createCamera({ viewW: 256, viewH: 240, bounds: wide });
  for (let i = 0; i < 200; i++) { a.follow({ x: 1000, y: 0, w: 12, h: 16, facing: 1 }); b.follow({ x: 1000, y: 0, w: 12, h: 16, facing: -1 }); }
  assert(a.x > b.x, 'facing right looks further right than facing left');
});
