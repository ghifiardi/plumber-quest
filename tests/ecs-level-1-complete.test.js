// tests/ecs-level-1-complete.test.js
import { test, assert } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import LEVEL1 from '../src/levels/ecs/level-1.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('level-1 loads and is completable by a stable, boring walk-right run', () => {
  const w = definitionToWorld(LEVEL1);                 // throws if the module is malformed
  let cleared = false;
  for (let i = 0; i < 1200 && !cleared; i++) {         // ~20s budget at 1/60
    const intent = { ...NONE, right: true, jumpPressed: i % 45 === 0, jumpHeld: i % 45 < 8 };
    w.update(1/60, intent);
    const s = w.getStatus();
    if (s.levelClear) cleared = true;
    else if (s.playerDied || s.fell) w.respawn();      // lives-free safety net (any death)
  }
  assert(cleared, 'reached the finish (levelClear) under a boring scripted run');
});
