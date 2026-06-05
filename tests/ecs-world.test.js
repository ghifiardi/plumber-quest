// tests/ecs-world.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));

function world() {
  return definitionToWorld({
    engine: 'ecs', meta: { name: 'w', w: 8, h: 4 },
    tiles: [emptyRow(8), emptyRow(8), emptyRow(8), groundRow(8)],
    entities: [{ type: 'player', x: 16, y: 0 }],
  });
}

test('facade: getBounds returns {left,top,right,bottom}', () => {
  const w = world();
  const b = w.getBounds();
  assertEqual(b.left, 0); assertEqual(b.top, 0);
  assertEqual(b.right, 128); assertEqual(b.bottom, 64);
});

test('facade: getCameraTarget returns player x,y,w,h,facing', () => {
  const w = world();
  const t = w.getCameraTarget();
  assertEqual(t.x, 16); assertEqual(t.w, 16); assertEqual(t.facing, 1);
});

test('facade: getStatus reports fell when player drops below bounds', () => {
  const w = world();
  const pl = w.entities.find(e => e.type === 'player');
  pl.c.transform.y = w.bounds.bottom + 100;
  assert(w.getStatus().fell, 'fell true below bounds');
});

test('facade: update advances and drainEvents returns+clears', () => {
  const w = world();
  for (let i = 0; i < 30; i++) w.update(1/60, NONE);
  w.update(1/60, { ...NONE, jumpPressed: true, jumpHeld: true });
  const evs = w.drainEvents();
  assert(evs.some(e => e.type === 'jump'), 'jump drained');
  assertEqual(w.drainEvents().length, 0, 'cleared after drain');
});

test('facade: beginScripted/updateScripted are safe no-ops', () => {
  const w = world();
  w.beginScripted('dying'); w.updateScripted(1/60);   // must not throw
  assert(true);
});

test('getRenderView is memoized within a tick and invalidated by a step', () => {
  const w = world();
  const v1 = w.getRenderView();
  const v2 = w.getRenderView();
  assert(v1 === v2, 'same view object returned without a step (no re-alloc)');
  w.update(1/60, NONE);
  const v3 = w.getRenderView();
  assert(v3 !== v1, 'fresh view after a step');
});
