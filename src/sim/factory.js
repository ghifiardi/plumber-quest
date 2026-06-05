// src/sim/factory.js
// Single discriminant between sim paths. main.js/game-state.js never branch on sim type.
import { makeClassicSim } from './classic-adapter.js';
import { definitionToWorld } from '../ecs/loader.js';

// levelEntry: classic = array of row-strings; ECS = a definition object with engine:'ecs'.
export function makeSim(levelEntry, ctx) {
  if (levelEntry && !Array.isArray(levelEntry) && levelEntry.engine === 'ecs') {
    return definitionToWorld(levelEntry);   // EcsWorld implements the facade directly
  }
  return makeClassicSim(levelEntry, ctx);
}
