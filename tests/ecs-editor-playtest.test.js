// tests/ecs-editor-playtest.test.js
import { test, assert, assertEqual } from './harness.js';
import { runScript } from '../src/editor/playtest.js';
import { definitionToEditorModel } from '../src/editor/serialize.js';

const eRow = (w) => Array.from({length:w}, () => ({ tile:'empty' }));
const gRow = (w) => Array.from({length:w}, () => ({ tile:'ground' }));
const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

// player starts ON the finish trigger -> a no-op script reaches levelClear immediately.
function modelWithFinishUnderPlayer() {
  return definitionToEditorModel({
    engine:'ecs', meta:{name:'p',w:8,h:4}, tiles:[eRow(8),eRow(8),eRow(8),gRow(8)],
    entities:[{type:'player',x:32,y:32},{type:'finish',x:32,y:32}],
  });
}

test('runScript reports levelClear when the player reaches finish (snapshot isolation)', () => {
  const model = modelWithFinishUnderPlayer();
  const before = JSON.stringify(model);
  const r = runScript(model, Array.from({length:10}, () => ({ ...NONE })));
  assertEqual(r.outcome, 'levelClear');
  assertEqual(JSON.stringify(model), before, 'editor model untouched by playtest');
});

test('runScript is deterministic and uses a fresh sim per call', () => {
  const model = modelWithFinishUnderPlayer();
  const a = runScript(model, [ {...NONE} ]); const b = runScript(model, [ {...NONE} ]);
  assertEqual(a.outcome, b.outcome);
});
