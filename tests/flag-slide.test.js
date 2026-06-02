import { test, assert } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';

// Tall enough that the pole base (ground) is well below the finish at the top.
const LVL = parseLevel(['F-------', '--------', '--------', 'P-------', 'XXXXXXXX', 'XXXXXXXX'], { tile: 16 });

test('flag and hero ride down the pole on clear, then the hero strolls off', () => {
  const w = createWorld(LVL);
  w.beginClearAnim();
  assert(w.flagSlide === 0, 'flag starts at the top of the pole');
  assert(w.player.y === w.level.finish.y, 'hero grabs the pole at the top');

  for (let i = 0; i < 50; i++) w.updateScripted(1/60);   // > 0.7s: slide completes
  assert(w.flagSlide >= 0.99, `flag fully descended (slide=${w.flagSlide})`);
  assert(w.player.y > w.level.finish.y, 'hero slid down the pole');

  const xBefore = w.player.x;
  for (let i = 0; i < 20; i++) w.updateScripted(1/60);
  assert(w.player.x > xBefore, 'hero strolls right after landing');
});
