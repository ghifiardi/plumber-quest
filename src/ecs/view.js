// src/ecs/view.js
// Build a classic-world-shaped, read-only view from an EcsWorld so the existing
// renderer can draw the ECS path with only additive changes (flagpole guard + platform).
export function ecsWorldToRenderView(world) {
  const player = world.entities.find(e => e.type === 'player');
  const pt = player.c.transform, pb = player.c.body, pc = player.c.control;

  const entities = [];
  for (const e of world.entities) {
    if (e === player) continue;
    const t = e.c.transform;
    entities.push({
      type: e.type, x: t.x, y: t.y, prevX: t.prevX, prevY: t.prevY, w: t.w, h: t.h,
      facing: e.c.walker ? e.c.walker.dir : 1,   // enemy sprite flip
    });
  }

  return {
    tiles: world.tiles,
    entities,
    player: {
      x: pt.x, y: pt.y, prevX: pt.prevX, prevY: pt.prevY, w: pt.w, h: pt.h,
      vx: pb.vx, vy: pb.vy, onGround: pb.onGround, facing: pc.facing,
      power: 'big',           // hero is the 'big' sprite tier (no power tiers this cycle)
      invuln: pb.invuln,      // real post-respawn invulnerability (renderer blink)
    },
    level: { finish: null },  // no finish entity in demo-1 (renderer guards this)
    bounds: world.bounds,
    popups: [],
    fireworks: [],
    flagSlide: 0,
    shake: 0,
    animClock: world.animClock || 0,
    timeRemaining: world.timeRemaining,
  };
}
