// tests/ecs-view.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import { ecsWorldToRenderView } from '../src/ecs/view.js';

const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));

function world() {
  return definitionToWorld({
    engine: 'ecs', meta: { name: 'v', w: 8, h: 4 },
    tiles: [emptyRow(8), emptyRow(8), emptyRow(8), groundRow(8)],
    entities: [
      { type: 'player', x: 16, y: 0 },
      { type: 'platform', x: 48, y: 40, mover: { axis: 'x', dist: 16, speed: 10 } },
    ],
  });
}

test('view exposes tiles, player, entities, and null finish', () => {
  const v = ecsWorldToRenderView(world());
  assertEqual(v.tiles.length, 4);
  assert(v.player && v.player.w === 16, 'player present');
  assertEqual(v.player.power, 'big');
  assert(Array.isArray(v.entities), 'entities array');
  assert(v.entities.some(e => e.type === 'platform'), 'platform in entities');
  assertEqual(v.level.finish, null);
});

test('view player carries onGround/vx/vy/facing/prevX for renderer', () => {
  const v = ecsWorldToRenderView(world());
  assert('onGround' in v.player && 'vx' in v.player && 'facing' in v.player, 'fields present');
  assert('prevX' in v.player && 'prevY' in v.player, 'interp fields present');
});

test('getRenderView on the world returns the same shape', () => {
  const w = world();
  const v = w.getRenderView();
  assert(v.player && Array.isArray(v.entities), 'world.getRenderView works');
});
