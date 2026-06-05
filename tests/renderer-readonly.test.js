import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { createRenderer } from '../src/render/renderer.js';
import { createCamera } from '../src/engine/camera.js';
import { spawnGoomba } from '../src/game/enemies.js';
import { makeMushroom } from '../src/game/pickups.js';
import { definitionToWorld } from '../src/ecs/loader.js';

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

// --- ECS view rendering (additive, Task 11) ---

const ECS_NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

function ecsView() {
  const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
  const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'r', w: 16, h: 4 },
    tiles: [emptyRow(16), emptyRow(16), emptyRow(16), groundRow(16)],
    entities: [
      { type: 'player', x: 16, y: 0 },
      { type: 'platform', x: 64, y: 40, mover: { axis: 'x', dist: 16, speed: 10 } },
    ],
  });
  for (let i = 0; i < 10; i++) w.update(1/60, ECS_NONE);
  return w.getRenderView();
}

// Build a real renderer + camera + a drawImage spy on the SAME ctx the renderer uses.
function rendererWithSpy() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 240;
  const ctx = canvas.getContext('2d');                 // same instance the renderer grabs
  let count = 0;
  const orig = ctx.drawImage;
  ctx.drawImage = function (...args) { count++; return orig.apply(this, args); };
  const renderer = createRenderer(canvas);
  const cam = createCamera({ viewW: 256, viewH: 240, bounds: { left:0, top:0, right:99999, bottom:240 } });
  return { renderer, cam, drawCount: () => count };
}

test('renderer draws a finish-less ECS view without throwing (flagpole guard)', () => {
  const { renderer, cam } = rendererWithSpy();
  let threw = false;
  try { renderer.draw(ecsView(), cam, 0, { score:0, coins:0, lives:3, levelIndex:0 }, 'playing'); }
  catch (e) { threw = true; }
  assert(!threw, 'finish-less view must not throw');
});

test('renderer issues draw calls for a platform entity', () => {
  const { renderer, cam, drawCount } = rendererWithSpy();
  const before = drawCount();
  renderer.draw(ecsView(), cam, 0, { score:0, coins:0, lives:3, levelIndex:0 }, 'playing');
  assert(drawCount() > before, 'platform/tiles produced draw calls');
});

function ecsViewAll() {
  const eR = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
  const gR = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'all', w: 20, h: 4 },
    tiles: [eR(20), eR(20), eR(20), gR(20)],
    entities: [
      { type: 'player', x: 16, y: 0 },
      { type: 'platform', x: 48, y: 40, mover: { axis:'x', dist:16, speed:10 } },
      { type: 'spring', x: 80, y: 32 }, { type: 'conveyor', x: 112, y: 32 },
      { type: 'checkpoint', x: 144, y: 16 }, { type: 'finish', x: 176, y: 16 },
      { type: 'enemy', x: 96, y: 32, walker: { speed: 20, dir: 1 } },
    ],
  });
  for (let i = 0; i < 5; i++) w.update(1/60, ECS_NONE);
  return w.getRenderView();
}

test('renderer draws a view with every new entity type without throwing', () => {
  const { renderer, cam } = rendererWithSpy();
  let threw = false;
  try { renderer.draw(ecsViewAll(), cam, 0, { score:0, coins:0, lives:3, levelIndex:0 }, 'playing'); }
  catch (e) { threw = true; }
  assert(!threw, 'new entity types render without throwing');
});

test('view exposes enemy facing for sprite flip', () => {
  const v = ecsViewAll();
  const enemy = v.entities.find(e => e.type === 'enemy');
  assert(enemy && 'facing' in enemy, 'enemy carries a facing in the view');
});
