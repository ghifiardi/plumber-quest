// tests/helpers/ecs-autoplay.js
// TEST-ONLY greedy auto-player. Reads EcsWorld internals (.entities/.tiles) to prove a
// level is completable with boring, deterministic heuristics — not product code.
import { makeSolid } from '../../src/engine/tile-collision.js';
import { TILE } from '../../src/engine/constants.js';

const NONE = { right:false,left:false,run:false,jumpHeld:false,jumpPressed:false,jumpReleased:false,firePressed:false };

export function autoPlay(world, budget = 3000) {
  const solid = makeSolid(world.tiles);
  let jumpHold = 0, jumpCooldown = 0, stall = 0;
  for (let t = 0; t < budget; t++) {
    const player = world.entities.find(en => en.type === 'player');
    const pt = player.c.transform, pb = player.c.body;
    let wantJump = false;
    if (pb.onGround && jumpCooldown <= 0) {
      if (Math.abs(pb.vx) < 10) stall++; else stall = 0;
      const wall = stall >= 3;
      const footRow = Math.floor((pt.y + pt.h + 2) / TILE);
      const aheadCol = Math.floor((pt.x + pt.w + 1) / TILE);
      const edge = !solid(aheadCol, footRow) && !solid(aheadCol + 1, footRow);
      const enemy = world.entities.some(en => en.c.tags
        && (en.c.tags.includes('hazard') || en.c.tags.includes('stompable'))
        && en.c.transform.x > pt.x && en.c.transform.x - pt.x < TILE * 2
        && Math.abs(en.c.transform.y - pt.y) < TILE);
      wantJump = wall || edge || enemy;
    }
    const intent = { ...NONE, right: true };
    if (wantJump) { intent.jumpPressed = true; intent.jumpHeld = true; jumpHold = 6; jumpCooldown = 12; stall = 0; }
    else if (jumpHold > 0) { intent.jumpHeld = true; jumpHold--; }
    if (jumpCooldown > 0) jumpCooldown--;
    world.update(1 / 60, intent);
    const s = world.getStatus();
    if (s.levelClear) return { cleared: true, ticks: t + 1 };
    if (s.playerDied || s.fell) { world.respawn(); jumpHold = 0; jumpCooldown = 0; stall = 0; }
  }
  return { cleared: false, ticks: budget };
}
