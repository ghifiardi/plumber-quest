// src/levels/ecs/level-1.js  (authored via the editor compact-export format)
const T = { ' ': 'empty', '#': 'ground', 'B': 'brick', 'U': 'upgrade-block', 'C': 'coin-block', 'o': 'coin', 'x': 'used-block', 'P': 'pipe', 'p': 'pipe-deco' };
const rows = [
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "                        ",
  "          o   o         ",
  "                        ",
  "########################",
  "########################",
].map(r => [...r].map(ch => ({ tile: T[ch] })));
export default {
  engine: 'ecs',
  meta: { name: 'Level 1', w: 24, h: 9 },
  tiles: rows,
  entities: [
    { type: 'player', x: 16, y: 96 },
    { type: 'checkpoint', x: 160, y: 96, trigger: { spawnX: 160, spawnY: 96 } },
    { type: 'finish', x: 352, y: 96 },
  ],
};
