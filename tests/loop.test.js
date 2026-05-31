import { test, assertEqual, assertClose, assertDeepEqual } from './harness.js';
import { createLoop } from '../src/engine/loop.js';
import { FIXED_DT } from '../src/engine/constants.js';

test('advance runs the right number of fixed steps with real alpha', () => {
  let steps = 0, renders = 0, lastAlpha = -1;
  const loop = createLoop({ step: () => steps++, render: a => { renders++; lastAlpha = a; } });
  loop.advance(FIXED_DT * 2.5);
  assertEqual(steps, 2, 'two whole steps');
  assertEqual(renders, 1, 'one render');
  assertClose(lastAlpha, 0.5, 1e-6);          // leftover 0.5 step -> real interpolation alpha
});

test('beforeFrame runs once before steps; afterFrame once after, with step count', () => {
  const order = []; let afterN = -1;
  const loop = createLoop({
    beforeFrame: () => order.push('before'),
    step: () => order.push('step'),
    afterFrame: (n) => { order.push('after'); afterN = n; },
    render: () => order.push('render'),
  });
  loop.advance(FIXED_DT * 2);
  assertDeepEqual(order, ['before','step','step','after','render']);
  assertEqual(afterN, 2, 'afterFrame receives step count');
});

test('beforeFrame/afterFrame still fire on a zero-step frame', () => {
  let before = 0, after = 0, steps = 0;
  const loop = createLoop({ beforeFrame:()=>before++, step:()=>steps++, afterFrame:()=>after++, render:()=>{} });
  loop.advance(FIXED_DT * 0.3);                // not enough to step
  assertEqual(steps, 0); assertEqual(before, 1); assertEqual(after, 1);
});

test('frame-time clamp prevents spiral of death', () => {
  let steps = 0;
  const loop = createLoop({ step: () => steps++, render: () => {}, maxSteps: 5 });
  loop.advance(10);                            // huge stall
  assertEqual(steps, 5, 'capped at maxSteps');
});
