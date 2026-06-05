// tests/ecs-editor-serialize.test.js
import { test, assert, assertEqual } from './harness.js';
import { definitionToEditorModel, editorModelToDefinition } from '../src/editor/serialize.js';
import { definitionToWorld } from '../src/ecs/loader.js';
import DEMO2 from '../src/levels/ecs/demo-2.js';

function expectThrow(fn, why) { let t=false; try{fn();}catch{t=true;} assert(t, why); }
const eRow = (w) => Array.from({length:w}, () => ({ tile:'empty' }));
const gRow = (w) => Array.from({length:w}, () => ({ tile:'ground' }));
function goodModel() {
  return { meta:{name:'m',w:4,h:2}, tiles:[['empty','empty','empty','empty'],['ground','ground','ground','ground']],
    entities:[{type:'player',x:16,y:0},{type:'finish',x:32,y:0}] };
}

test('definitionToEditorModel converts {tile} cells to kind strings', () => {
  const def = { engine:'ecs', meta:{name:'d',w:4,h:2}, tiles:[eRow(4),gRow(4)], entities:[{type:'player',x:0,y:0}] };
  const m = definitionToEditorModel(def);
  assertEqual(m.tiles[1][0], 'ground');
  assertEqual(m.tiles[0][0], 'empty');
  assertEqual(m.entities[0].type, 'player');
});

test('editorModelToDefinition emits a loader-valid {tile} definition', () => {
  const def = editorModelToDefinition(goodModel());
  assertEqual(def.engine, 'ecs');
  assertEqual(def.tiles[1][0].tile, 'ground');
  definitionToWorld(def);   // must not throw
});

test('round-trip demo-2: def -> model -> def still loads, fields preserved', () => {
  const m = definitionToEditorModel(DEMO2);
  const def = editorModelToDefinition(m);
  definitionToWorld(def);
  assertEqual(def.entities.map(e=>e.type).join(','), DEMO2.entities.map(e=>e.type).join(','));
  assertEqual(JSON.stringify(def.tiles.map(r=>r.map(c=>c.tile))), JSON.stringify(DEMO2.tiles.map(r=>r.map(c=>c.tile))));
  const plat = def.entities.find(e=>e.type==='platform');
  assertEqual(plat.mover.speed, 40);
});

test('editorModelToDefinition rejects invariant violations EARLY', () => {
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:4,h:2}, tiles:[eRow(4)], entities:[{type:'player',x:0,y:0}] }), 'tiles rows != h');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:4,h:2}, tiles:[['empty'],['ground','ground','ground','ground']], entities:[{type:'player',x:0,y:0}] }), 'ragged');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:2}, tiles:[['empty','nope'],['ground','ground']], entities:[{type:'player',x:0,y:0}] }), 'unknown tile kind');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[{type:'player',x:NaN,y:0}] }), 'non-finite coord');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[] }), 'zero players');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[{type:'player',x:0,y:0},{type:'player',x:16,y:0}] }), 'two players');
  expectThrow(() => editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[{type:'player',x:0,y:0,wings:{}}] }), 'disallowed entity key');
});

test('editor/meta escape-hatch bags survive', () => {
  const def = editorModelToDefinition({ meta:{name:'x',w:2,h:1}, tiles:[['empty','empty']], entities:[{type:'player',x:0,y:0,editor:{note:'spawn'}}] });
  assertEqual(def.entities[0].editor.note, 'spawn');
});
