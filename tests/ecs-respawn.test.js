// tests/ecs-respawn.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';

const eRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const gRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
function world() {
  return definitionToWorld({
    engine: 'ecs', meta: { name: 'rs', w: 12, h: 4 },
    tiles: [eRow(12), eRow(12), eRow(12), gRow(12)],
    entities: [{ type: 'player', x: 32, y: 0 }],
  });
}

test('EcsWorld canRespawnInPlace is true', () => {
  assertEqual(world().canRespawnInPlace(), true);
});

test('respawn resets player to checkpoint and clears transient state', () => {
  const w = world();
  const p = w.entities[0].c;
  w.checkpoint = { x: 80, y: 16 };
  w.playerDied = true;
  p.body.vx = 99; p.body.vy = 99; p.body.onGround = true;
  p.body.support = { entityId: 5, kind: 'mover', deltaX: 1, deltaY: 0, pushX: 0, bounceV: 0 };
  p.jump.buffer = 1; p.jump.coyote = 1; p.jump.jumped = true;
  w.respawn();
  assertEqual(p.transform.x, 80); assertEqual(p.transform.y, 16);
  assertEqual(p.body.vx, 0); assertEqual(p.body.vy, 0);
  assertEqual(p.body.support, null); assertEqual(p.body.onGround, false);
  assertEqual(p.jump.buffer, 0); assertEqual(p.jump.coyote, 0); assertEqual(p.jump.jumped, false);
  assert(p.body.invuln > 0, 'invuln window set');
  assertEqual(w.playerDied, false, 'death flag cleared');
});

test('respawn without a checkpoint returns to spawn', () => {
  const w = world();
  const p = w.entities[0].c;
  p.transform.x = 200;
  w.respawn();
  assertEqual(p.transform.x, 32, 'back to spawn x');
});
