// tests/sim-factory.test.js
import { test, assert, assertEqual } from './harness.js';
import { makeSim } from '../src/sim/factory.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const ctx = { levelIndex: 0, session: { score:0, coins:0, lives:3, levelIndex:0 }, difficulty: 'normal' };

const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
const ECS_DEF = {
  engine: 'ecs', meta: { name: 'f', w: 8, h: 4 },
  tiles: [emptyRow(8), emptyRow(8), emptyRow(8), groundRow(8)],
  entities: [{ type: 'player', x: 16, y: 0 }],
};

test('factory returns a classic sim for row-array levels', () => {
  const sim = makeSim(['P------F', 'XXXXXXXX'], ctx);
  assertEqual(typeof sim.update, 'function');
  assert('left' in sim.getBounds(), 'classic bounds');
});

test('factory returns an ECS sim for engine:ecs defs', () => {
  const sim = makeSim(ECS_DEF, ctx);
  for (let i = 0; i < 5; i++) sim.update(1/60, NONE);
  const v = sim.getRenderView();
  assert(v.player && Array.isArray(v.entities), 'ECS render view');
});
