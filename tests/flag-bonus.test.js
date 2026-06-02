import { test, assert, assertEqual } from './harness.js';
import { createWorld, flagBonusForFrac } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
// Tall level: F at the top (row 0), ground = bottom two rows.
const ROWS = ['F-------', '--------', '--------', '--------', 'P-------', 'XXXXXXXX', 'XXXXXXXX'];

test('flag bonus rises with grab height (tiers)', () => {
  assertEqual(flagBonusForFrac(1), 5000);
  assertEqual(flagBonusForFrac(0.95), 5000);
  assertEqual(flagBonusForFrac(0.8), 2000);
  assertEqual(flagBonusForFrac(0.6), 800);
  assertEqual(flagBonusForFrac(0.3), 400);
  assertEqual(flagBonusForFrac(0.1), 100);
  assert(flagBonusForFrac(1) > flagBonusForFrac(0.3), 'higher grab = bigger bonus');
});

test('grabbing the flag near the top awards a big bonus and clears the level', () => {
  const w = createWorld(parseLevel(ROWS, { tile: 16 }));
  w.player.x = w.level.finish.x; w.player.y = w.level.finish.y;   // grab at the very top
  const score0 = w.session.score;
  w.update(1/60, NONE);
  assert(w.flagReached, 'flag reached');
  assert(w.session.score - score0 >= 2000, `top grab awards a big bonus (+${w.session.score - score0})`);
});

test('grabbing low on the pole awards only the small bonus', () => {
  const w = createWorld(parseLevel(ROWS, { tile: 16 }));
  w.player.x = w.level.finish.x;
  w.player.y = (w.bounds.bottom - 32) - w.player.h;              // grab at the base
  const score0 = w.session.score;
  w.update(1/60, NONE);
  assert(w.flagReached, 'flag reached');
  assertEqual(w.session.score - score0, 100, 'low grab = 100');
});
