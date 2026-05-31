import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { spawnGoomba } from '../src/game/enemies.js';

const ROWS = ['P--?--G----F', 'XXXXXXXXXXXX'];
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

function script() {
  const s = [];
  for (let i=0;i<40;i++) s.push({ ...NONE, right:true });
  s.push({ ...NONE, right:true, jumpPressed:true });
  for (let i=0;i<30;i++) s.push({ ...NONE, right:true, jumpHeld:true });
  return s;
}

function fingerprint(w) {
  return JSON.stringify({
    px: Math.round(w.player.x), py: Math.round(w.player.y),
    pv: Math.round(w.player.vx), ents: w.entities.map(e=>[e.type, Math.round(e.x), Math.round(e.y), e.alive]),
  });
}

function play(intents) {
  const lvl = parseLevel(ROWS, { tile: 16 });
  const w = createWorld(lvl);
  for (const sp of lvl.entitySpawns) if (sp.type==='goomba') w.entities.push(spawnGoomba(sp.x, sp.y));
  for (const it of intents) w.update(1/60, it);
  return fingerprint(w);
}

test('same intent script yields identical fingerprint across 3 runs', () => {
  const a = play(script()), b = play(script()), c = play(script());
  assertEqual(a, b);
  assertEqual(b, c);
});

test('a different intent script yields a different fingerprint (not a constant)', () => {
  const moving = play(script());
  const idle = play(Array(71).fill(NONE));   // never move
  assert(moving !== idle, 'fingerprint must actually reflect the intent stream');
});

// GOLDEN MASTER — locks the exact end-state, catching any future change to physics or
// ordering (not just run-to-run drift). Recorded via the capture step below.
const GOLDEN = "{\"px\":94,\"py\":-3,\"pv\":140,\"ents\":[[\"goomba\",64,2,true]]}";

test('determinism: fingerprint matches the recorded golden master', () => {
  const fp = play(script());
  if (GOLDEN === '__RECORD_ON_FIRST_RUN__') {
    throw new Error('GOLDEN not set — set: const GOLDEN = ' + JSON.stringify(fp) + ';');
  }
  assertEqual(fp, GOLDEN);
});
