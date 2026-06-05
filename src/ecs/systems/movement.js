// src/ecs/systems/movement.js
// 1) carry riders by their platform's PREVIOUS-tick delta (cross-tick, no double-move)
// 2) advance kinematic movers, recording this tick's delta
// 3) apply control accel/friction to body.vx; resolve jump (coyote+buffer+cut) to body.vy
import { FRICTION } from '../../engine/constants.js';

export function movementSystem(world, dt) {
  // (1) apply support recorded by collision last tick (cleared by physics each tick)
  for (const e of world.entities) {
    const b = e.c.body; const s = b && b.support;
    if (!s) continue;
    if (s.kind === 'mover') { e.c.transform.x += s.deltaX; e.c.transform.y += s.deltaY; }
    // conveyor push (s.kind === 'conveyor') is added in Task 5
  }

  // (2) advance movers (ping-pong along axis), record delta
  for (const e of world.entities) {
    const m = e.c.mover; if (!m) continue;
    const t = e.c.transform;
    const before = m.pos;
    m.pos += m.dir * m.speed * dt;
    if (m.pos >= m.dist) { m.pos = m.dist; m.dir = -1; }
    else if (m.pos <= 0) { m.pos = 0; m.dir = 1; }
    const advanced = m.pos - before;
    if (m.axis === 'x') { m.delta = { x: advanced, y: 0 }; t.x = m.origin.x + m.pos; }
    else { m.delta = { x: 0, y: advanced }; t.y = m.origin.y + m.pos; }
  }

  // (3) control + jump -> body velocity
  for (const e of world.entities) {
    const { body: b, control: ctl, jump: j } = e.c;
    if (!b || !ctl) continue;
    const maxV = (j && j._run) ? ctl.maxVxRun : ctl.maxVx;
    const right = j ? j._right : false, left = j ? j._left : false;
    if (right && !left) b.vx = Math.min(maxV, b.vx + ctl.accel * dt);
    else if (left && !right) b.vx = Math.max(-maxV, b.vx - ctl.accel * dt);
    else { // friction toward 0
      const s = Math.sign(b.vx);
      b.vx -= s * FRICTION * dt;
      if (Math.sign(b.vx) !== s) b.vx = 0;
    }

    if (j) {
      // coyote: refreshed while grounded, decays in the air
      if (b.onGround) j.coyote = j.coyoteMax; else j.coyote = Math.max(0, j.coyote - dt);
      j.jumped = false;
      if (j.buffer > 0 && j.coyote > 0) {
        b.vy = j.jumpV; b.onGround = false; j.coyote = 0; j.buffer = 0; j.jumped = true;
        world.emit({ type: 'jump', x: e.c.transform.x + e.c.transform.w / 2, y: e.c.transform.y + e.c.transform.h });
      }
      // jump cut: releasing early shortens the hop
      if (j._released && b.vy < 0) b.vy *= j.jumpCut;
      j.heldPrev = j._heldNow;
    }
  }
}
