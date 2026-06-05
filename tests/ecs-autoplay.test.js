// tests/ecs-autoplay.test.js
import { test, assert, assertEqual } from './harness.js';
import { autoPlay } from './helpers/ecs-autoplay.js';
import { definitionToWorld } from '../src/ecs/loader.js';

const e = (w) => Array.from({length:w}, () => ({ tile:'empty' }));
const g = (w) => Array.from({length:w}, () => ({ tile:'ground' }));
function lvl(tiles, meta, entities) { return definitionToWorld({ engine:'ecs', meta, tiles, entities }); }

test('autoPlay clears a flat level by walking right to the finish', () => {
  const w = lvl([e(16),e(16),g(16)], { name:'flat', w:16, h:3 },
    [{type:'player',x:16,y:16},{type:'finish',x:224,y:16}]);
  const r = autoPlay(w, 1500);
  assert(r.cleared, 'reached finish on flat ground');
});

test('autoPlay jumps a 1-tile gap (edge probe) to reach the finish', () => {
  const bottom = g(16); bottom[7] = { tile:'empty' };
  const w = lvl([e(16),e(16),bottom], { name:'gap', w:16, h:3 },
    [{type:'player',x:16,y:16},{type:'finish',x:224,y:16}]);
  const r = autoPlay(w, 2000);
  assert(r.cleared, 'jumped the gap and finished');
});

test('autoPlay respects the budget and reports not-cleared on an unwinnable level (no finish)', () => {
  const w = lvl([e(8),e(8),g(8)], { name:'nofin', w:8, h:3 }, [{type:'player',x:16,y:16}]);
  const r = autoPlay(w, 300);
  assertEqual(r.cleared, false);
  assert(r.ticks <= 300, 'stopped at budget');
});
