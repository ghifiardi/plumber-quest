const TILE_CHARS = {
  'X': 'ground', '#': 'brick', '?': 'coin-block', 'U': 'upgrade-block',
  'o': 'coin', 'T': 'pipe', '|': 'pipe-deco',
  '-': 'empty', ' ': 'empty',
};
const SPAWN_CHARS = { 'G': 'goomba' };
const SOLID = new Set(['ground', 'brick', 'coin-block', 'upgrade-block', 'pipe', 'used-block']);

export function isSolidTile(kind) { return SOLID.has(kind); }

export function parseLevel(rows, { tile = 16 } = {}) {
  if (!rows.length) throw new Error('empty level');
  const width = rows[0].length;
  for (const r of rows) if (r.length !== width) throw new Error(`ragged rows: expected width ${width}`);
  const height = rows.length;

  const tiles = [];
  const entitySpawns = [];
  let playerSpawn = null, finish = null;

  for (let row = 0; row < height; row++) {
    tiles[row] = [];
    for (let col = 0; col < width; col++) {
      const ch = rows[row][col];
      const x = col * tile, y = row * tile;
      if (ch === 'P') {
        if (playerSpawn) throw new Error('more than one player spawn (P)');
        playerSpawn = { x, y }; tiles[row][col] = { tile: 'empty' }; continue;
      }
      if (ch === 'F') {
        if (finish) throw new Error('more than one finish trigger (F)');
        finish = { x, y }; tiles[row][col] = { tile: 'empty' }; continue;
      }
      if (SPAWN_CHARS[ch]) {
        entitySpawns.push({ type: SPAWN_CHARS[ch], x, y });
        tiles[row][col] = { tile: 'empty' }; continue;
      }
      const kind = TILE_CHARS[ch];
      if (!kind) throw new Error(`unknown character '${ch}' at row ${row} col ${col}`);
      tiles[row][col] = { tile: kind };
    }
  }
  if (!playerSpawn) throw new Error('no player spawn (P)');
  if (!finish) throw new Error('no finish trigger (F)');

  return {
    width, height, tile, tiles, entitySpawns, playerSpawn, finish,
    bounds: { left: 0, top: 0, right: width * tile, bottom: height * tile },
  };
}
