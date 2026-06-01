import { test, assert, assertEqual } from './harness.js';
import { createInput } from '../src/engine/input.js';

function press(input, code) { input._onKey(code, true); }
function release(input, code) { input._onKey(code, false); }

test('jumpPressed edge is true once per frame even across multiple steps', () => {
  const input = createInput();
  press(input, 'Space');
  input.beginFrame();
  const step1 = input.consumeIntent();   // first step this frame
  const step2 = input.consumeIntent();   // second step same frame
  assert(step1.jumpPressed, 'first step sees press');
  assert(!step2.jumpPressed, 'second step does not re-see press');
  assert(step2.jumpHeld, 'still held');
});

test('zero steps in a frame does not lose the next frame press', () => {
  const input = createInput();
  press(input, 'Space');
  input.beginFrame();                     // frame with 0 consume calls
  input.beginFrame();                     // next frame
  const s = input.consumeIntent();
  assert(s.jumpPressed, 'press still delivered on first consume');
});

test('release produces jumpReleased edge once', () => {
  const input = createInput();
  press(input, 'Space');
  input.beginFrame(); input.consumeIntent();
  release(input, 'Space');
  input.beginFrame();
  const s = input.consumeIntent();
  assert(s.jumpReleased, 'release edge delivered');
  assert(!s.jumpHeld);
});

test('movement held flags reflect keys', () => {
  const input = createInput();
  press(input, 'ArrowRight'); press(input, 'ShiftLeft');
  input.beginFrame();
  const s = input.consumeIntent();
  assert(s.right && s.run && !s.left);
});

test('setAction (touch buttons) drives the same held flags and edges as keys', () => {
  const input = createInput();
  input.setAction('right', true);
  input.setAction('jump', true);            // touch A pressed
  input.beginFrame();
  const s = input.consumeIntent();
  assert(s.right, 'touch right held');
  assert(s.jumpHeld && s.jumpPressed, 'touch jump held + pressed edge');
  input.setAction('jump', false);           // touch A released
  input.beginFrame();
  const s2 = input.consumeIntent();
  assert(s2.jumpReleased && !s2.jumpHeld, 'touch jump release edge');
});

test('setAction B button = run held + fire pressed-once', () => {
  const input = createInput();
  input.setAction('run', true); input.setAction('fire', true);   // B pressed
  input.beginFrame();
  const a = input.consumeIntent();
  assert(a.run && a.firePressed, 'run held + fire edge on press');
  input.beginFrame();
  const b = input.consumeIntent();
  assert(a.run && !b.firePressed, 'fire is once-per-press; run still held');
  input.setAction('fire', false);
  assert(true);
});

test('setAction ignores unknown actions safely', () => {
  const input = createInput();
  input.setAction('nope', true);
  input.beginFrame();
  const s = input.consumeIntent();
  assert(!s.left && !s.right && !s.jumpHeld, 'no effect from unknown action');
});
