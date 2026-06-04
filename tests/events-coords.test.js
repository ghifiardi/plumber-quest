// tests/events-coords.test.js
import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnGoomba } from '../src/game/enemies.js';

const COORD_EVENTS = new Set(['coin-collected', 'enemy-stomped', 'brick-broken', 'powerup-collected', 'jump', 'player-hit']);

test('every coord-event emitted during play carries numeric x,y', () => {
  const lvl = parseLevel(['----o-----', 'P--------F', 'XXXXXXXXXX'], { tile: 16 });
  const w = createWorld(lvl);
  w.entities.push(spawnGoomba(80, 16, 30));
  const seen = [];
  for (let i = 0; i < 600; i++) {
    w.update(1 / 60, { right: true, run: true, jumpPressed: i % 40 === 0, jumpHeld: i % 40 < 8 });
    for (const ev of w.drainEvents()) {
      if (COORD_EVENTS.has(ev.type)) seen.push(ev);
    }
    if (w.flagReached || w.playerDied) break;
  }
  assert(seen.length > 0, 'some coord-events fired');
  for (const ev of seen) {
    assert(Number.isFinite(ev.x) && Number.isFinite(ev.y), `${ev.type} has numeric x,y (got ${ev.x},${ev.y})`);
  }
});
