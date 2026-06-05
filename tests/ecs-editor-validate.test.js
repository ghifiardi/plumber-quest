// tests/ecs-editor-validate.test.js
import { test, assert, assertEqual } from './harness.js';
import { validateModel } from '../src/editor/validate.js';

const tiles = (w,h) => Array.from({length:h}, () => Array.from({length:w}, () => 'empty'));
function model(over={}) { return { meta:{name:'m',w:4,h:2}, tiles:tiles(4,2), entities:[{type:'player',x:0,y:0}], ...over }; }

test('valid model is ok with no errors', () => {
  const r = validateModel(model({ entities:[{type:'player',x:0,y:0},{type:'finish',x:16,y:0}] }));
  assert(r.ok, 'ok true'); assertEqual(r.errors.length, 0);
});

test('hard-invalid model is not ok (errors populated)', () => {
  const r = validateModel(model({ entities:[] }));   // zero players
  assert(!r.ok, 'ok false'); assert(r.errors.length > 0, 'has errors');
});

test('no finish / no checkpoint are non-blocking warnings, not errors', () => {
  const r = validateModel(model());   // player only, no finish/checkpoint
  assert(r.ok, 'still ok (hard validity)');
  assert(r.warnings.some(w => /finish/i.test(w)), 'finish warning');
  assert(r.warnings.some(w => /checkpoint/i.test(w)), 'checkpoint warning');
});
