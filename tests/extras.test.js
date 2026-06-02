import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';

const FLAT = parseLevel(['P----F', 'XXXXXX'], { tile: 16 });
const POLE = parseLevel(['F------', '-------', '-------', 'P------', 'XXXXXXX', 'XXXXXXX'], { tile: 16 });

// ---- coin -> bonus life ----
test('100 coins grants a bonus life and rolls coins over', () => {
  const w = createWorld(FLAT);
  w.session.coins = 99; const lives0 = w.session.lives;
  w.addCoin();
  assertEqual(w.session.coins, 0, 'coins roll over past 100');
  assertEqual(w.session.lives, lives0 + 1, '1-up awarded');
  assert(w.events.some(e => e.type === 'one-up'), 'one-up event emitted');
});

test('coins below 100 do not grant a life', () => {
  const w = createWorld(FLAT);
  w.session.coins = 50; const lives0 = w.session.lives;
  w.addCoin();
  assertEqual(w.session.coins, 51);
  assertEqual(w.session.lives, lives0);
});

// ---- lucky-digit fireworks ----
test('clearing with a lucky time digit (…3) launches 3 fireworks', () => {
  const w = createWorld(POLE, { time: 123 });        // last digit 3 -> lucky
  w.beginClearAnim();
  assertEqual(w._fireworksLeft, 3, 'three queued');
  let launched = 0;
  for (let i = 0; i < 200 && (w._fireworksLeft > 0 || w.fireworks.length); i++) {
    const before = w.fireworks.length;
    w.updateScripted(1/60);
    if (w.fireworks.length > before) launched++;
  }
  assertEqual(w._fireworksLeft, 0, 'all three launched');
  assertEqual(launched, 3, 'exactly three bursts spawned');
});

test('a non-lucky time digit launches no fireworks', () => {
  const w = createWorld(POLE, { time: 122 });        // last digit 2 -> not lucky
  w.beginClearAnim();
  assertEqual(w._fireworksLeft || 0, 0);
  for (let i = 0; i < 90; i++) w.updateScripted(1/60);
  assertEqual(w.fireworks.length, 0, 'no fireworks');
});
