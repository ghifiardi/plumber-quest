// src/levels/ecs/level-2.js  (editor compact-export format)
const T = { ' ': 'empty', '#': 'ground', 'B': 'brick', 'U': 'upgrade-block', 'C': 'coin-block', 'o': 'coin', 'x': 'used-block', 'P': 'pipe', 'p': 'pipe-deco' };
const rows = [
  "                                                  ",
  "                                                  ",
  "                                                  ",
  "                                                  ",
  "                                                  ",
  "                                                  ",
  "        o           o            o          o     ",
  "                                                  ",
  "                                                  ",
  "############ ###########  ############## #########",
  "############ ###########  ############## #########"
].map(r => [...r].map(ch => ({ tile: T[ch] })));
export default {
  engine: 'ecs',
  meta: { name: 'Level 2', w: 50, h: 11 },
  tiles: rows,
  entities: [
    { type: 'player',     x: 16,  y: 128 },
    { type: 'conveyor',   x: 80,  y: 144, transform: { w: 48 }, conveyor: { pushX: 50 } },  // ground-level assist (showcase)
    { type: 'enemy',      x: 320, y: 128, walker: { speed: 20, dir: -1 } },                 // stompable hazard on the path
    { type: 'checkpoint', x: 432, y: 128, trigger: { spawnX: 432, spawnY: 128 } },
    { type: 'spring',     x: 544, y: 144, bouncer: { bounceV: 360 } },                      // recovery/showcase, not gating
    { type: 'finish',     x: 752, y: 128 },
  ],
};
