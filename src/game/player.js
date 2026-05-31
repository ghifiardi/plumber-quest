import * as C from '../engine/constants.js';

export function createPlayer(spawn) {
  return {
    type: 'player', x: spawn.x, y: spawn.y, w: 12, h: 16,
    vx: 0, vy: 0, prevX: spawn.x, prevY: spawn.y,
    onGround: false, coyote: 0, buffer: 0, power: 'small',
    invuln: 0, facing: 1, alive: true, jumped: false,
  };
}

// Apply horizontal intent + jump bookkeeping (pre-integration). dt in seconds.
export function controlPlayer(p, intent, dt) {
  const maxV = intent.run ? C.RUN_MAX_FAST : C.RUN_MAX;
  const dir = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
  if (dir !== 0) {
    p.vx += dir * C.RUN_ACCEL * dt;
    p.vx = Math.max(-maxV, Math.min(maxV, p.vx));
    p.facing = dir;
  } else {
    const f = C.FRICTION * dt;
    if (p.vx > 0) p.vx = Math.max(0, p.vx - f);
    else if (p.vx < 0) p.vx = Math.min(0, p.vx + f);
  }
  // jump buffering + coyote
  if (intent.jumpPressed) p.buffer = C.JUMP_BUFFER; else p.buffer = Math.max(0, p.buffer - dt);
  if (p.onGround) p.coyote = C.COYOTE; else p.coyote = Math.max(0, p.coyote - dt);
  if (p.buffer > 0 && p.coyote > 0) { p.vy = C.JUMP_VELOCITY; p.onGround = false; p.coyote = 0; p.buffer = 0; p.jumped = true; }
  if (intent.jumpReleased && p.vy < 0) p.vy *= C.JUMP_CUT;       // variable height
  // gravity
  p.vy = Math.min(C.MAX_FALL, p.vy + C.GRAVITY * dt);
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
}
