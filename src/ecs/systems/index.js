// src/ecs/systems/index.js
// The determinism anchor: fixed, explicit order. trigger is a stub this cycle.
import { inputSystem } from './input.js';
import { movementSystem } from './movement.js';
import { physicsSystem } from './physics.js';
import { collisionSystem } from './collision.js';
import { lifetimeSystem } from './lifetime.js';

export function triggerSystem() { /* stub: checkpoints/finish land in the mechanics cycle */ }

export const SYSTEM_ORDER = [
  ['input', inputSystem],
  ['movement', movementSystem],
  ['physics', physicsSystem],
  ['collision', collisionSystem],
  ['trigger', triggerSystem],
  ['lifetime', lifetimeSystem],
];
