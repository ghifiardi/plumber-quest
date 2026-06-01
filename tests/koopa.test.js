import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnKoopa, spawnGoomba } from '../src/game/enemies.js';

const LVL = parseLevel(['P----------F', 'XXXXXXXXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
// Koopa is 16px tall, so it sits flush on the ground at y=0 (bottom at the row-1 boundary).

test('stomping a walking koopa turns it into an idle shell (not removed)', () => {
  const w = createWorld(LVL);
  const k = spawnKoopa(40, 0); w.entities.push(k);
  w.player.x = 40; w.player.y = -20; w.player.vy = 200;     // drop onto it
  for (let i = 0; i < 14 && k.mode === 'walk'; i++) w.update(1/60, NONE);
  assertEqual(k.mode, 'shell', 'became an idle shell');
  assert(k.alive, 'shell still present (not removed)');
  assert(w.player.vy < 0, 'player bounced off it');
});

test('touching an idle shell kicks it into a slide away from the player', () => {
  const w = createWorld(LVL);
  const k = spawnKoopa(60, 0); k.mode = 'shell'; k.vx = 0; w.entities.push(k);
  w.player.x = 52; w.player.y = 0; w.player.vy = 0;         // overlapping, player to the LEFT
  w.update(1/60, NONE);
  assertEqual(k.mode, 'sliding', 'kicked into a slide');
  assert(k.vx > 0, `slides right, away from the player on its left (vx=${k.vx})`);
});

test('a sliding shell knocks out a goomba', () => {
  const w = createWorld(LVL);
  const k = spawnKoopa(60, 0); k.mode = 'sliding'; k.vx = 168; k.kickGrace = 0; w.entities.push(k);
  const g = spawnGoomba(70, 2); w.entities.push(g);         // just ahead of the shell
  for (let i = 0; i < 8 && g.alive; i++) w.update(1/60, NONE);
  assert(!g.alive, 'goomba knocked out by the sliding shell');
});

test('a sliding shell bounces off a wall (reverses direction)', () => {
  const lvl = parseLevel(['P-----X----F', 'XXXXXXXXXXXX'], { tile: 16 });  // solid block at row0 col6 (x=96)
  const w = createWorld(lvl);
  const k = spawnKoopa(70, 0); k.mode = 'sliding'; k.vx = 168; k.kickGrace = 0; w.entities.push(k);
  for (let i = 0; i < 16 && k.vx > 0; i++) w.update(1/60, NONE);
  assert(k.vx < 0, `shell reversed after hitting the wall (vx=${k.vx})`);
});

test('a sliding shell damages a small player on side contact', () => {
  const w = createWorld(LVL);
  const k = spawnKoopa(60, 0); k.mode = 'sliding'; k.vx = -168; k.kickGrace = 0; w.entities.push(k);
  w.player.power = 'small'; w.player.x = 44; w.player.y = 0; w.player.vy = 0; w.player.invuln = 0;
  for (let i = 0; i < 10 && !w.playerDied; i++) w.update(1/60, NONE);
  assert(w.playerDied, 'small player killed by the sliding shell');
});

test('stomping a sliding shell stops it (back to idle)', () => {
  const w = createWorld(LVL);
  const k = spawnKoopa(40, 0); k.mode = 'sliding'; k.vx = 20; k.kickGrace = 0; w.entities.push(k);
  w.player.x = 40; w.player.y = -20; w.player.vy = 200;     // drop clearly from above
  for (let i = 0; i < 14 && k.mode === 'sliding'; i++) w.update(1/60, NONE);
  assertEqual(k.mode, 'shell', 'stomp stopped the shell');
  assertEqual(k.vx, 0);
});
