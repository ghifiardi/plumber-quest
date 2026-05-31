import { test, assert, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';
import { MAX_FIREBALLS } from '../src/engine/constants.js';

const LVL = parseLevel(['P----------F', 'XXXXXXXXXXXX'], { tile: 16 });
const FIRE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:true };
const NONE = { ...FIRE, firePressed:false };

test('only fire-power player shoots', () => {
  const w = createWorld(LVL);
  w.update(1/60, FIRE);
  assertEqual(w.entities.filter(e=>e.type==='fireball').length, 0, 'small player cannot shoot');
});

test('fireballs capped at MAX_FIREBALLS active', () => {
  const w = createWorld(LVL);
  w.player.power = 'fire';
  for (let i = 0; i < 6; i++) { w.update(1/60, FIRE); w.update(1/60, NONE); }
  assert(w.entities.filter(e=>e.type==='fireball').length <= MAX_FIREBALLS, 'cap enforced');
  assertEqual(w.player.fireballs, w.entities.filter(e=>e.type==='fireball').length);
});

test('active count decrements via removal path', () => {
  const w = createWorld(LVL);
  w.player.power = 'fire';
  w.update(1/60, FIRE);
  const fb = w.entities.find(e=>e.type==='fireball');
  assert(fb, 'fireball spawned');
  fb.life = 0;                       // force expiry
  w.update(1/60, NONE);              // update -> remove -> flush
  assertEqual(w.player.fireballs, 0, 'count decremented when removed');
});
