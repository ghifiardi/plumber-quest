// src/levels/ecs/demo-1.js
// First data-driven ECS level: ground, a gap, and a moving platform to ride across.
// 40 cols x 15 rows (640x240). Ground on the bottom two rows with a gap in the middle.
const W = 40, H = 15;
const cell = (k) => ({ tile: k });
const rows = [];
for (let r = 0; r < H; r++) {
  rows[r] = [];
  for (let c = 0; c < W; c++) {
    const isGroundRow = r >= H - 2;
    const inGap = c >= 16 && c <= 23;          // central gap the platform bridges
    rows[r][c] = cell(isGroundRow && !inGap ? 'ground' : 'empty');
  }
}

export default {
  engine: 'ecs',
  meta: { name: 'ECS Demo 1', w: W, h: H },
  tiles: rows,
  entities: [
    { type: 'player', x: 32, y: (H - 3) * 16 },
    // platform parked at the left lip of the gap, sweeping right across it
    { type: 'platform', x: 16 * 16, y: (H - 4) * 16, mover: { axis: 'x', dist: 7 * 16, speed: 40 } },
  ],
};
