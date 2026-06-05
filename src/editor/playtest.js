// src/editor/playtest.js
// Playtest the editor model in the REAL ECS sim. Builds the sim via definitionToWorld()
// directly (never makeSim -> never src/game/*). runScript is the headless, testable core;
// startPlaytest (next task) is the live disposable RAF loop reusing it.
import { definitionToWorld } from '../ecs/loader.js';
import { editorModelToDefinition } from './serialize.js';
import { FIXED_DT } from '../engine/constants.js';

// Build a fresh sim from a SNAPSHOT of the model (editing state never leaks in).
export function simFromModel(model) { return definitionToWorld(editorModelToDefinition(model)); }

// Step a scripted intent list; return the first terminal outcome (lives-free).
export function runScript(model, script) {
  const sim = simFromModel(model);
  for (const intent of script) {
    sim.update(FIXED_DT, intent);
    const s = sim.getStatus();
    if (s.levelClear) return { outcome: 'levelClear', sim };
    if (s.playerDied || s.fell) {
      if (sim.canRespawnInPlace()) sim.respawn();           // lives-free: respawn and continue
      else return { outcome: 'died', sim };
    }
  }
  return { outcome: 'running', sim };
}
