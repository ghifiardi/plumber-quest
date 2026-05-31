import { test, assert, assertClose } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { createPlayer, controlPlayer } from '../src/game/player.js';
import { parseLevel } from '../src/levels/level-format.js';
import * as C from '../src/engine/constants.js';
import { FIXED_DT } from '../src/engine/constants.js';

// flat ground with player standing on it; F required by parser.
const LVL = parseLevel(['P------F', 'XXXXXXXX'], { tile: 16 });

function run(world, intents) { for (const it of intents) world.update(FIXED_DT, it); }
const HOLD_JUMP = { right:false,left:false,run:false,jumpHeld:true,jumpPressed:false,jumpReleased:false,firePressed:false };
const PRESS_JUMP = { ...HOLD_JUMP, jumpPressed:true };
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('player falls to rest on ground', () => {
  const w = createWorld(LVL);
  run(w, Array(30).fill(NONE));
  assertClose(w.player.y + w.player.h, 16, 1.0);  // standing on row 1 (y=16)
  assertClose(w.player.vy, 0, 1e-6);
});

test('full jump (held) rises higher than cut jump (released early)', () => {
  const settle = Array(20).fill(NONE);
  const wFull = createWorld(LVL); run(wFull, settle);
  const wCut  = createWorld(LVL); run(wCut, settle);
  const yStart = wFull.player.y;

  run(wFull, [PRESS_JUMP, ...Array(30).fill(HOLD_JUMP)]);
  // cut: press then release after 3 steps
  run(wCut, [PRESS_JUMP, HOLD_JUMP, HOLD_JUMP, { ...NONE, jumpReleased:true }, ...Array(27).fill(NONE)]);

  assert(wFull.peakRise > wCut.peakRise, `full ${wFull.peakRise} should exceed cut ${wCut.peakRise}`);
});

// --- coyote-time & jump-buffer at the player-module level (precise, no world timing noise) ---
const noIntent = { left:false,right:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };
const pressIntent = { ...noIntent, jumpPressed:true, jumpHeld:true };

test('coyote-time: jump succeeds shortly after leaving ground', () => {
  const p = createPlayer({ x:0, y:0 });
  p.onGround = true; controlPlayer(p, noIntent, FIXED_DT);   // refresh coyote
  p.onGround = false; controlPlayer(p, noIntent, FIXED_DT);  // 1 frame airborne (< COYOTE)
  controlPlayer(p, pressIntent, FIXED_DT);                   // press within coyote window
  assert(p.vy < 0, `should jump during coyote window (vy=${p.vy})`);
});

test('coyote-time: jump fails long after leaving ground', () => {
  const p = createPlayer({ x:0, y:0 });
  p.onGround = true; controlPlayer(p, noIntent, FIXED_DT);
  p.onGround = false;
  for (let i = 0; i < 10; i++) controlPlayer(p, noIntent, FIXED_DT); // > COYOTE elapsed
  controlPlayer(p, pressIntent, FIXED_DT);
  assert(p.vy > 0, `no jump after coyote expired; still falling (vy=${p.vy})`);
});

test('jump-buffer: press just before landing fires jump on landing', () => {
  const p = createPlayer({ x:0, y:0 });
  p.onGround = false;
  controlPlayer(p, pressIntent, FIXED_DT);     // buffered while airborne -> no jump yet
  assert(p.vy > 0, 'still falling, jump buffered not fired');
  p.onGround = true;                            // land within buffer window
  controlPlayer(p, { ...noIntent, jumpHeld:true }, FIXED_DT);
  assert(p.vy < 0, `buffered jump fired on landing (vy=${p.vy})`);
});
