// src/ecs/systems/input.js
// Reads the frame intent; updates control facing + jump buffer/coyote timers.
// No velocity changes here — movement consumes the intent.
export function inputSystem(world, dt, intent) {
  for (const e of world.entities) {
    const { control, jump } = e.c;
    if (control) {
      if (intent.right && !intent.left) control.facing = 1;
      else if (intent.left && !intent.right) control.facing = -1;
    }
    if (jump) {
      // edge-detected press fills the buffer; buffer/coyote decay over time
      if (intent.jumpPressed) jump.buffer = jump.bufferMax;
      else jump.buffer = Math.max(0, jump.buffer - dt);
      jump._heldNow = !!intent.jumpHeld;
      jump._released = !!intent.jumpReleased;
      jump._right = intent.right; jump._left = intent.left; jump._run = intent.run;
    }
  }
}
