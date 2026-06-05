// tests/ecs-mechanics.test.js
import { test, assert, assertEqual } from './harness.js';
import { instantiate, TYPE_REGISTRY } from '../src/ecs/components.js';
import { definitionToWorld } from '../src/ecs/loader.js';

test('registry knows the new mechanic types', () => {
  for (const t of ['spring','conveyor','checkpoint','finish','enemy']) {
    assert(t in TYPE_REGISTRY, `${t} registered`);
  }
});
test('spring/conveyor carry their effect components', () => {
  assert('bouncer' in instantiate('spring').c, 'spring has bouncer');
  assert('conveyor' in instantiate('conveyor').c, 'conveyor has conveyor');
});
test('checkpoint and finish carry a tagged trigger', () => {
  assertEqual(instantiate('checkpoint').c.trigger.tag, 'checkpoint');
  assertEqual(instantiate('finish').c.trigger.tag, 'finish');
});
test('enemy has body+walker and stompable/hazard tags', () => {
  const e = instantiate('enemy').c;
  assert('body' in e && 'walker' in e, 'enemy has body+walker');
  assert(e.tags.includes('stompable') && e.tags.includes('hazard'), 'enemy capability tags');
});
test('loader builds a world with the new types', () => {
  const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
  const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'm', w: 10, h: 4 },
    tiles: [emptyRow(10), emptyRow(10), emptyRow(10), groundRow(10)],
    entities: [
      { type: 'player', x: 16, y: 0 },
      { type: 'spring', x: 32, y: 32 }, { type: 'conveyor', x: 48, y: 32 },
      { type: 'checkpoint', x: 64, y: 16 }, { type: 'finish', x: 80, y: 16 },
      { type: 'enemy', x: 96, y: 32 },
    ],
  });
  assertEqual(w.entities.length, 6);
});

import { stepWorld } from '../src/ecs/world-ecs.js';
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const eRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const gRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));

test('conveyor pushes a standing rider horizontally, clamped', () => {
  // a WIDE belt (w:96) so the rider stays on it through the measurement window.
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'cv', w: 16, h: 6 },
    tiles: [eRow(16), eRow(16), eRow(16), eRow(16), eRow(16), gRow(16)],
    entities: [
      { type: 'player', x: 40, y: 16 },
      { type: 'conveyor', x: 24, y: 48, transform: { w: 96 }, conveyor: { pushX: 80 } },
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  for (let i = 0; i < 15; i++) stepWorld(w, 1/60, NONE);   // land on the wide belt
  const x0 = pl.c.transform.x;
  for (let i = 0; i < 20; i++) stepWorld(w, 1/60, NONE);   // carried by the belt (no input)
  assert(pl.c.transform.x > x0 + 2, 'belt pushed the rider');
  assert(Math.abs(pl.c.body.vx) <= pl.c.control.maxVx + 1e-6, 'vx never exceeds the rider cap');
});

test('spring launches the player up, no support/onGround, emits spring-bounce', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'sp', w: 12, h: 8 },
    tiles: [eRow(12),eRow(12),eRow(12),eRow(12),eRow(12),eRow(12),eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 48, y: 16 },
      { type: 'spring', x: 40, y: 96, bouncer: { bounceV: 320 } },
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  let bounced = false;
  for (let i = 0; i < 60; i++) {
    const evs = stepWorld(w, 1/60, NONE);
    if (evs.some(e => e.type === 'spring-bounce')) {
      bounced = true;
      assert(pl.c.body.vy < 0, 'moving upward right after the bounce');
      assert(pl.c.body.support === null, 'no support recorded on a spring');
      assert(pl.c.body.onGround === false, 'not grounded on the bounce frame');
      break;
    }
  }
  assert(bounced, 'spring-bounce fired');
});

test('checkpoint records a respawn transform, one-shot, emits checkpoint', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'cp', w: 12, h: 4 },
    tiles: [eRow(12), eRow(12), eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 40, y: 32 },
      { type: 'checkpoint', x: 40, y: 32, trigger: { spawnX: 41, spawnY: 33 } },
    ],
  });
  let hits = 0;
  for (let i = 0; i < 20; i++) for (const e of (stepWorld(w,1/60,NONE)||[])) if (e.type === 'checkpoint') hits++;
  assert(w.checkpoint && w.checkpoint.x === 41 && w.checkpoint.y === 33, 'respawn transform stored');
  assertEqual(hits, 1, 'checkpoint is one-shot');
});

test('finish sets levelClear once and emits flag-reached once', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'fn', w: 12, h: 4 },
    tiles: [eRow(12), eRow(12), eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 40, y: 32 },
      { type: 'finish', x: 40, y: 32 },
    ],
  });
  let flags = 0;
  for (let i = 0; i < 20; i++) for (const e of (stepWorld(w,1/60,NONE)||[])) if (e.type === 'flag-reached') flags++;
  assert(w.levelClear === true, 'levelClear set');
  assertEqual(flags, 1, 'flag-reached emitted exactly once');
  assert(w.getStatus().levelClear === true, 'status reflects levelClear');
});

test('walker patrols and turns at a wall', () => {
  const rows = [];
  for (let r = 0; r < 5; r++) rows.push(eRow(10));
  rows.push(gRow(10));
  rows[4][8] = { tile: 'ground' }; rows[3][8] = { tile: 'ground' };   // wall near the right
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'wk', w: 10, h: 6 },
    tiles: rows,
    entities: [
      { type: 'player', x: 8, y: 16 },
      { type: 'enemy', x: 96, y: 64, walker: { speed: 40, dir: 1 } },   // walking right toward the wall
    ],
  });
  const en = w.entities.find(e => e.type === 'enemy');
  for (let i = 0; i < 120; i++) stepWorld(w, 1/60, NONE);
  assertEqual(en.c.walker.dir, -1, 'reversed after hitting the wall');
});

test('walker turns at a ledge edge instead of walking off', () => {
  const rows = [];
  for (let r = 0; r < 5; r++) rows.push(eRow(10));
  const floor = eRow(10); for (let c = 0; c <= 4; c++) floor[c] = { tile: 'ground' };
  rows.push(floor);
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'le', w: 10, h: 6 },
    tiles: rows,
    entities: [
      { type: 'player', x: 8, y: 16 },
      { type: 'enemy', x: 32, y: 64, walker: { speed: 40, dir: 1 } },
    ],
  });
  const en = w.entities.find(e => e.type === 'enemy');
  for (let i = 0; i < 120; i++) stepWorld(w, 1/60, NONE);
  assert(en.c.transform.x < 5 * 16, 'did not walk off the ledge');
  assertEqual(en.c.walker.dir, -1, 'reversed at the ledge');
});

test('stomp from above removes the enemy, bounces the player, emits enemy-stomped', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'st', w: 12, h: 8 },
    tiles: [eRow(12),eRow(12),eRow(12),eRow(12),eRow(12),eRow(12),eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 48, y: 16 },                              // falls onto the enemy
      { type: 'enemy', x: 48, y: 96, walker: { speed: 0, dir: 1 } }, // stationary under the player
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  let stomped = false;
  for (let i = 0; i < 80; i++) {
    const evs = stepWorld(w, 1/60, NONE);
    if (evs.some(e => e.type === 'enemy-stomped')) { stomped = true; break; }
  }
  assert(stomped, 'enemy-stomped fired');
  assert(pl.c.body.vy < 0, 'player bounced up');
  assert(!w.entities.some(e => e.type === 'enemy'), 'enemy removed');
});

test('side contact kills the player (player-died), suppressed while invuln', () => {
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'hz', w: 12, h: 4 },
    tiles: [eRow(12), eRow(12), eRow(12), gRow(12)],
    entities: [
      { type: 'player', x: 40, y: 32 },
      { type: 'enemy', x: 48, y: 32, walker: { speed: 0, dir: -1 } },  // beside the player
    ],
  });
  const pl = w.entities.find(e => e.type === 'player');
  pl.c.body.invuln = 1.0;                          // invulnerable first
  for (let i = 0; i < 5; i++) stepWorld(w, 1/60, NONE);
  assert(w.playerDied === false, 'no death while invulnerable');
  pl.c.body.invuln = 0;                            // drop invuln
  let died = false;
  for (let i = 0; i < 30; i++) { const evs = stepWorld(w, 1/60, { ...NONE, right:true }); if (evs.some(e => e.type === 'player-died')) died = true; }
  assert(died && w.playerDied, 'side contact killed the player once vulnerable');
});
