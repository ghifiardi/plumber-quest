// src/ecs/systems/index.js
// The determinism anchor: fixed, explicit order.
import { inputSystem } from './input.js';
import { movementSystem } from './movement.js';
import { physicsSystem } from './physics.js';
import { collisionSystem } from './collision.js';
import { triggerSystem } from './trigger.js';
import { lifetimeSystem } from './lifetime.js';

export const SYSTEM_ORDER = [
  ['input', inputSystem],
  ['movement', movementSystem],
  ['physics', physicsSystem],
  ['collision', collisionSystem],
  ['trigger', triggerSystem],
  ['lifetime', lifetimeSystem],
];
