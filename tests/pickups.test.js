import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnGoomba } from '../src/game/enemies.js';
import { makeMushroom, makeFlower, makeCoinPickup } from '../src/game/pickups.js';

const LVL = parseLevel(['P-----F', 'XXXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('mushroom grows small player to big and awards score', () => {
  const w = createWorld(LVL);
  const score0 = w.session.score;
  w.entities.push(makeMushroom(w.player.x, w.player.y));
  w.update(1/60, NONE);
  assertEqual(w.player.power, 'big');
  assertEqual(w.session.score, score0 + 1000, 'mushroom scored exactly +1000');
  assert(w.drainEvents().some(e=>e.type==='powerup-collected'));
});

test('flower upgrades big player to fire', () => {
  const w = createWorld(LVL);
  w.player.power = 'big';
  w.entities.push(makeFlower(w.player.x, w.player.y));
  w.update(1/60, NONE);
  assertEqual(w.player.power, 'fire');
});

test('coin pickup increments session.coins and score', () => {
  const w = createWorld(LVL);
  const coins0 = w.session.coins, score0 = w.session.score;
  w.entities.push(makeCoinPickup(w.player.x, w.player.y));
  w.update(1/60, NONE);
  assertEqual(w.session.coins, coins0 + 1);
  assertEqual(w.session.score, score0 + 200);
  assert(w.drainEvents().some(e=>e.type==='coin-collected'));
});

test('coin TILE the player overlaps is collected and cleared', () => {
  const lvl = parseLevel(['Po---F', 'XXXXXX'], { tile: 16 });   // coin 'o' at row0 col1
  const w = createWorld(lvl);
  w.player.x = 16; w.player.y = 0;                               // overlap the coin tile
  const coins0 = w.session.coins;
  w.update(1/60, NONE);
  assertEqual(w.session.coins, coins0 + 1, 'coin tile collected');
  assertEqual(w.tiles[0][1].tile, 'empty', 'coin tile cleared after collection');
});

test('SAME-STEP pickup before enemy: mushroom makes a lethal hit non-lethal (§10.9)', () => {
  const w = createWorld(LVL);
  // small player overlapped by BOTH a mushroom and a goomba in the same step.
  w.player.power = 'small'; w.player.invuln = 0; w.player.x = 32; w.player.y = 2; w.player.vy = 0;
  w.entities.push(spawnGoomba(32, 2));
  w.entities.push(makeMushroom(32, 2));
  w.update(1/60, NONE);
  // pickups resolve FIRST -> big; then enemy contact demotes big->small (not death).
  assert(!w.playerDied, 'pickup-before-enemy ordering prevented death');
  assertEqual(w.player.power, 'small', 'grew to big, then demoted to small by the same-step hit');
});
