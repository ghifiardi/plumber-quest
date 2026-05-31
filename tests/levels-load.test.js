import { test, assert } from './harness.js';
import { parseLevel } from '../src/levels/level-format.js';
import L1 from '../src/levels/world-1-1.js';
import L2 from '../src/levels/world-1-2.js';
import L3 from '../src/levels/world-1-3.js';

for (const [name, rows] of [['1-1',L1],['1-2',L2],['1-3',L3]]) {
  test(`level ${name} parses and validates`, () => {
    const lvl = parseLevel(rows, { tile: 16 });
    assert(lvl.playerSpawn, 'has player');
    assert(lvl.finish, 'has finish');
  });
}
