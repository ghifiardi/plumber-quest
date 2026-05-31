import { test, assertEqual } from './harness.js';
import { createWorld } from '../src/game/world.js';
import { parseLevel } from '../src/levels/level-format.js';

const LVL = parseLevel(['P----F', 'XXXXXX'], { tile: 16 });
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

test('spawn during update appears next step, not current', () => {
  const w = createWorld(LVL);
  const marker = { type:'mark', x:0,y:0,w:1,h:1,alive:true,
    update(world){ if(!this.done){ world.spawn({type:'child',x:0,y:0,w:1,h:1,alive:true,update(){}}); this.done=true; } } };
  w.entities.push(marker);
  const childrenAfter1 = (() => { w.update(1/60, NONE); return w.entities.filter(e=>e.type==='child').length; })();
  assertEqual(childrenAfter1, 1, 'child present after flush');
});

test('remove during update flushes before additions', () => {
  const w = createWorld(LVL);
  const a = { type:'a', x:0,y:0,w:1,h:1,alive:true, update(world){ world.remove(this); world.spawn({type:'b',x:0,y:0,w:1,h:1,alive:true,update(){}});} };
  w.entities.push(a);
  w.update(1/60, NONE);
  assertEqual(w.entities.filter(e=>e.type==='a').length, 0);
  assertEqual(w.entities.filter(e=>e.type==='b').length, 1);
});

test('spawned entity does NOT update in the step it was spawned', () => {
  const w = createWorld(LVL);
  let childUpdates = 0;
  const parent = { type:'p', x:0,y:0,w:1,h:1,alive:true, done:false,
    update(world){ if(!this.done){ world.spawn({ type:'c', x:0,y:0,w:1,h:1, alive:true, update(){ childUpdates++; } }); this.done = true; } } };
  w.entities.push(parent);
  w.update(1/60, NONE);
  assertEqual(childUpdates, 0, 'child not updated in its spawn step');
  w.update(1/60, NONE);
  assertEqual(childUpdates, 1, 'child updates on the next step');
});

test('onRemove hook fires once when an entity is removed', () => {
  const w = createWorld(LVL);
  let removed = 0;
  const e = { type:'e', x:0,y:0,w:1,h:1,alive:true, onRemove(){ removed++; }, update(world){ world.remove(this); } };
  w.entities.push(e);
  w.update(1/60, NONE);
  assertEqual(removed, 1, 'onRemove called exactly once during flush');
});
