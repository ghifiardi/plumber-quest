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
