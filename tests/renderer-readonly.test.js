import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { createRenderer } from '../src/render/renderer.js';
import { createCamera } from '../src/engine/camera.js';
import { spawnGoomba } from '../src/game/enemies.js';
import { makeMushroom } from '../src/game/pickups.js';

const LVL = parseLevel(['P--o-F', 'XXXXXX'], { tile: 16 });

// Full-world snapshot: player, all entities, the entire tilemap, flags, and session.
function snapshot(w){
  return JSON.stringify({
    player: { x:w.player.x, y:w.player.y, vx:w.player.vx, vy:w.player.vy, power:w.player.power, prevX:w.player.prevX, prevY:w.player.prevY, invuln:w.player.invuln },
    time: w.timeRemaining,
    flags: [w.timeUp, w.fell, w.flagReached, w.playerDied],
    session: { ...w.session },
    tiles: w.tiles.map(row => row.map(c => c.tile)),
    ents: w.entities.map(e => [e.type, e.x, e.y, e.vx, e.vy, e.alive]),
  });
}

test('renderer.draw mutates nothing in the full world (§10.12)', () => {
  const w = createWorld(LVL);
  w.entities.push(spawnGoomba(48, 2));    // exercise entity-render path
  w.entities.push(makeMushroom(32, 2));
  const canvas = document.createElement('canvas'); canvas.width=256; canvas.height=240;
  const renderer = createRenderer(canvas);
  const cam = createCamera({ viewW:256, viewH:240, bounds:w.bounds });
  const before = snapshot(w);
  renderer.draw(w, cam, 0.5, { score:0, coins:0, lives:3, levelIndex:0 }, 'playing');
  renderer.draw(w, cam, 0.0, { score:1, coins:2, lives:3, levelIndex:0 }, 'paused');  // overlay path
  renderer.draw(w, cam, 0.0, { score:1, coins:2, lives:3, levelIndex:0 }, 'win');     // overlay path
  renderer.drawTitle();                                                               // title path
  assertEqual(snapshot(w), before, 'player, entities, tilemap, flags, session unchanged after draws/overlays/title');
});

test('camera eases toward the player and clamps to bounds', () => {
  const cam = createCamera({ viewW:64, viewH:240, bounds:{left:0,top:0,right:1000,bottom:240} });
  for (let i=0;i<120;i++) cam.follow({ x:500, y:0, w:12, h:16, facing:1 });
  assert(cam.x > 0 && cam.x < 1000, 'follows toward player');
  for (let i=0;i<120;i++) cam.follow({ x:-100, y:0, w:12, h:16, facing:-1 });
  assertEqual(Math.round(cam.x), 0, 'eases to clamped left');
});

test('reassigning cam.bounds affects clamping (live bounds, not captured)', () => {
  const cam = createCamera({ viewW:64, viewH:240, bounds:{left:0,top:0,right:100,bottom:240} });
  for (let i=0;i<120;i++) cam.follow({ x:1000, y:0, w:12, h:16, facing:1 });
  assertEqual(Math.round(cam.x), Math.max(0, 100 - 64), 'eases to original right edge');
  cam.bounds = { left:0, top:0, right:2000, bottom:240 };
  for (let i=0;i<120;i++) cam.follow({ x:1000, y:0, w:12, h:16, facing:1 });
  assert(cam.x > 100, 'new wider bounds allow scrolling further');
});
