import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';

const LVL = parseLevel(['P------F', 'XXXXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('timer counts down and sets timeUp at zero', () => {
  const w = createWorld(LVL, { time: 1 });   // 1 game-second
  // 1 game second = LEVEL_TIME scaling 1:1 here; step ~70 frames > 1s
  for (let i = 0; i < 70 && !w.timeUp; i++) w.update(1/60, NONE);
  assert(w.timeUp, 'timeUp set');
  assert(w.timeRemaining <= 0);
});

test('falling below bounds sets fell', () => {
  const hole = parseLevel(['P-----F', 'X-----X'], { tile: 16 });
  const w = createWorld(hole);
  for (let i = 0; i < 120 && !w.fell; i++) w.update(1/60, { ...NONE, right:true });
  assert(w.fell, 'fell flagged after leaving bottom bound');
});
