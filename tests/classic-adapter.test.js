// tests/classic-adapter.test.js
import { test, assert, assertEqual } from './harness.js';
import { makeClassicSim } from '../src/sim/classic-adapter.js';

const ROWS = ['P------F', 'XXXXXXXX'];
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const ctx = { levelIndex: 0, session: { score:0, coins:0, lives:3, levelIndex:0 }, difficulty: 'normal' };

test('classic adapter satisfies the facade surface', () => {
  const sim = makeClassicSim(ROWS, ctx);
  for (const m of ['update','drainEvents','getStatus','beginScripted','updateScripted','getCameraTarget','getBounds','getRenderView']) {
    assertEqual(typeof sim[m], 'function', `has ${m}`);
  }
  const b = sim.getBounds();
  assert('left' in b && 'right' in b, 'bounds shape');
  const t = sim.getCameraTarget();
  assert('x' in t && 'w' in t, 'camera target shape');
});

test('classic adapter getStatus maps world flags', () => {
  const sim = makeClassicSim(ROWS, ctx);
  for (let i = 0; i < 30; i++) sim.update(1/60, NONE);
  const s = sim.getStatus();
  assert('timeUp' in s && 'fell' in s && 'playerDied' in s && 'levelClear' in s, 'status keys');
});

test('classic adapter beginScripted delegates to death/clear hooks', () => {
  const sim = makeClassicSim(ROWS, ctx);
  const view = sim.getRenderView();        // raw classic world
  let death = false; const orig = view.beginDeathAnim;
  view.beginDeathAnim = () => { death = true; orig(); };
  sim.beginScripted('dying');
  assert(death, 'beginDeathAnim called via facade');
});

test('classic adapter timeRemaining is read/writable', () => {
  const sim = makeClassicSim(ROWS, ctx);
  sim.timeRemaining = 123;
  assertEqual(sim.getRenderView().timeRemaining, 123, 'set delegates to world');
  assertEqual(sim.timeRemaining, 123, 'get delegates to world');
});

test('classic adapter cannot respawn in place', () => {
  const sim = makeClassicSim(ROWS, ctx);
  assertEqual(sim.canRespawnInPlace(), false);
  sim.respawn();   // no-op, must not throw
  assert(true);
});
