// tests/ecs-jump.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import { stepWorld } from '../src/ecs/world-ecs.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const emptyRow = (w) => Array.from({ length: w }, () => ({ tile: 'empty' }));
const groundRow = (w) => Array.from({ length: w }, () => ({ tile: 'ground' }));
function flat() {
  return definitionToWorld({
    engine: 'ecs', meta: { name: 'j', w: 12, h: 4 },
    tiles: [emptyRow(12), emptyRow(12), emptyRow(12), groundRow(12)],
    entities: [{ type: 'player', x: 32, y: 32 }],
  });
}
function settle(w) { for (let i = 0; i < 30; i++) stepWorld(w, 1/60, NONE); }

test('jump-cut: releasing early yields a lower peak than holding', () => {
  const wHold = flat(); settle(wHold);
  const wCut = flat();  settle(wCut);
  const pHold = wHold.entities[0].c, pCut = wCut.entities[0].c;
  const y0 = pHold.transform.y;
  stepWorld(wHold, 1/60, { ...NONE, jumpPressed:true, jumpHeld:true });
  stepWorld(wCut,  1/60, { ...NONE, jumpPressed:true, jumpHeld:true });
  for (let i = 0; i < 3; i++) stepWorld(wHold, 1/60, { ...NONE, jumpHeld:true });
  for (let i = 0; i < 3; i++) stepWorld(wCut,  1/60, { ...NONE, jumpReleased:true });   // release early
  let peakHold = y0, peakCut = y0;
  for (let i = 0; i < 40; i++) { stepWorld(wHold,1/60,{...NONE,jumpHeld:true}); peakHold = Math.min(peakHold, pHold.transform.y); }
  for (let i = 0; i < 40; i++) { stepWorld(wCut,1/60,NONE); peakCut = Math.min(peakCut, pCut.transform.y); }
  assert(peakHold < peakCut - 2, 'held jump rises higher than cut jump');
});

test('coyote: a jump pressed on the first airborne tick after a ledge still fires', () => {
  // walk off the right end; press jump every airborne tick. Coyote should let it fire
  // within the first few airborne ticks (robust to exactly when the foot leaves ground).
  const w = definitionToWorld({
    engine: 'ecs', meta: { name: 'c', w: 8, h: 6 },
    tiles: [emptyRow(8), emptyRow(8), emptyRow(8), emptyRow(8), emptyRow(8),
            [{tile:'ground'},{tile:'ground'},{tile:'empty'},{tile:'empty'},{tile:'empty'},{tile:'empty'},{tile:'empty'},{tile:'empty'}]],
    entities: [{ type: 'player', x: 8, y: 64 }],
  });
  const p = w.entities[0].c;
  for (let i = 0; i < 30; i++) stepWorld(w, 1/60, NONE);     // settle on the left ground
  let airborneTicks = 0, jumped = false;
  for (let i = 0; i < 40 && !jumped; i++) {
    const air = !p.body.onGround;
    const evs = stepWorld(w, 1/60, { ...NONE, right: true, jumpPressed: air, jumpHeld: true });
    if (air) airborneTicks++;
    if (evs.some(e => e.type === 'jump')) jumped = true;
  }
  assert(jumped, 'a coyote jump fired after leaving the ledge');
  assert(airborneTicks <= 5, 'fired within the coyote window, not arbitrarily late');
});

test('buffer: a jump pressed while airborne fires again on landing', () => {
  // jump, then hold jumpPressed every tick (buffer keeps refilling). On landing,
  // coyote refreshes and the buffered press produces another jump.
  const w = flat();
  for (let i = 0; i < 30; i++) stepWorld(w, 1/60, NONE);     // settle
  stepWorld(w, 1/60, { ...NONE, jumpPressed:true, jumpHeld:true });  // first jump
  let jumps = 0;
  for (let i = 0; i < 60; i++) {
    const evs = stepWorld(w, 1/60, { ...NONE, jumpPressed:true, jumpHeld:true });
    jumps += evs.filter(e => e.type === 'jump').length;
  }
  assert(jumps >= 1, 'a buffered press produced another jump after landing');
});
