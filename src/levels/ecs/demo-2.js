// src/levels/ecs/demo-2.js
// Cycle-2 acceptance level: moving platform over a gap -> conveyor -> spring to a ledge ->
// checkpoint -> stompable enemy -> finish. A hazard enemy sits in an OPTIONAL side pocket
// (below the main route) so the happy path never requires dying.
const W = 60, H = 15;
const cell = (k) => ({ tile: k });
const rows = [];
for (let r = 0; r < H; r++) {
  rows[r] = [];
  for (let c = 0; c < W; c++) {
    const groundRow = r >= H - 2;
    const gap = c >= 14 && c <= 20;          // platform bridges this gap
    rows[r][c] = cell(groundRow && !gap ? 'ground' : 'empty');
  }
}
const GY = (H - 3) * 16;   // standing y on the main ground

export default {
  engine: 'ecs',
  meta: { name: 'ECS Demo 2', w: W, h: H },
  tiles: rows,
  entities: [
    { type: 'player', x: 32, y: GY },
    { type: 'platform', x: 14 * 16, y: (H - 4) * 16, mover: { axis: 'x', dist: 6 * 16, speed: 40 } },
    { type: 'conveyor', x: 24 * 16, y: (H - 3) * 16, conveyor: { pushX: 60 } },
    { type: 'spring',   x: 34 * 16, y: (H - 3) * 16, bouncer: { bounceV: 380 } },
    { type: 'checkpoint', x: 40 * 16, y: GY, trigger: { spawnX: 40 * 16, spawnY: GY } },
    { type: 'enemy',    x: 46 * 16, y: GY, walker: { speed: 30, dir: -1 } },
    { type: 'finish',   x: 56 * 16, y: GY },
    // OPTIONAL hazard side-pocket (not on the completion path): an enemy down a pit edge
    { type: 'enemy',    x: 18 * 16, y: (H - 3) * 16, walker: { speed: 30, dir: 1 } },
  ],
};
