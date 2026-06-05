// tests/ecs-level-2-complete.test.js
import { test, assert } from './harness.js';
import { autoPlay } from './helpers/ecs-autoplay.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import LEVEL2 from '../src/levels/ecs/level-2.js';

test('level-2 loads and the auto-player clears it within budget', () => {
  const w = definitionToWorld(LEVEL2);          // throws if malformed
  const r = autoPlay(w, 3000);                  // loose budget (~50s); assert clears, not exact ticks
  assert(r.cleared, `auto-player should clear level-2 (stopped at tick ${r.ticks})`);
});
