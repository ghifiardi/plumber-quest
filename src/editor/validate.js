// src/editor/validate.js
// validateModel: ok reflects HARD validity (editor invariants + the real loader).
// no-finish / no-checkpoint are non-blocking warnings — Play/Export gate on ok only.
import { editorModelToDefinition } from './serialize.js';
import { definitionToWorld } from '../ecs/loader.js';

export function validateModel(model) {
  const errors = [], warnings = [];
  try {
    const def = editorModelToDefinition(model);   // editor invariants (throws)
    definitionToWorld(def);                        // loader authority (throws)
  } catch (e) {
    errors.push(e.message);
  }
  const types = (model && Array.isArray(model.entities)) ? model.entities.map(e => e.type) : [];
  if (!types.includes('finish')) warnings.push('no finish entity — the level cannot be completed');
  if (!types.includes('checkpoint')) warnings.push('no checkpoint entity — death restarts from spawn');
  return { ok: errors.length === 0, errors, warnings };
}
