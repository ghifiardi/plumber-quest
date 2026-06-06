// tests/ecs-demo-2-complete.test.js
// demo-2 IS completable: the auto-player jumps at the gap and rides the moving platform
// across (the intended route). The cycle-2 golden master's "fall in gap" was an artifact
// of its fixed simple script, not the level — so this proves completability without any
// layout change or golden re-record.
import { test, assert } from './harness.js';
import { autoPlay } from './helpers/ecs-autoplay.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import DEMO2 from '../src/levels/ecs/demo-2.js';

test('demo-2 is completable by the auto-player (rides the moving platform over the gap)', () => {
  const w = definitionToWorld(DEMO2);
  const r = autoPlay(w, 4000);   // loose budget; assert clears, not exact ticks
  assert(r.cleared, `auto-player should clear demo-2 (stopped at tick ${r.ticks})`);
});
