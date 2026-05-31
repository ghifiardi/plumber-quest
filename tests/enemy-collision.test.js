import { test, assert } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnGoomba } from '../src/game/enemies.js';

const LVL = parseLevel(['P-----F', 'XXXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('stomping from above kills goomba, emits enemy-stomped, bounces player', () => {
  const w = createWorld(LVL);
  const g = spawnGoomba(32, 2); w.entities.push(g);
  w.player.x = 32; w.player.y = -20; w.player.vy = 200;   // falling onto goomba
  let stomped = false;
  for (let i = 0; i < 12 && g.alive; i++) {
    w.update(1/60, NONE);
    if (w.drainEvents().some(e => e.type === 'enemy-stomped')) stomped = true;
  }
  assert(!g.alive, 'goomba dead');
  assert(stomped, 'enemy-stomped event was emitted (not a vacuous assertion)');
  assert(w.player.vy < 0, 'player bounced up');
});

test('side contact while small kills the player', () => {
  const w = createWorld(LVL);
  const g = spawnGoomba(40, 2); w.entities.push(g);
  w.player.x = 24; w.player.y = 2; w.player.invuln = 0; w.player.vy = 0;
  for (let i = 0; i < 30 && !w.playerDied; i++) w.update(1/60, { ...NONE, right:true });
  assert(w.playerDied, 'small player died on side contact');
});

test('side contact while big demotes to small instead of dying', () => {
  const w = createWorld(LVL);
  const g = spawnGoomba(40, 2); w.entities.push(g);
  w.player.power = 'big'; w.player.x = 24; w.player.y = 2; w.player.invuln = 0; w.player.vy = 0;
  for (let i = 0; i < 30 && !w.playerDied; i++) w.update(1/60, { ...NONE, right:true });
  assert(!w.playerDied, 'big player survives one hit');
  assert(w.player.power === 'small', 'demoted to small');
});
