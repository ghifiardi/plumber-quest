// src/engine/tile-collision.js
// Pure tile-solidity helper for the ECS path. The grid uses the same {tile:kind}
// cell shape as the classic sim, so isSolidTile (pure, from level-format) applies.
import { isSolidTile } from '../levels/level-format.js';

// Returns solid(col,row) -> boolean for use with resolveAgainstTiles (engine/aabb.js).
export function makeSolid(tiles) {
  return (col, row) => {
    if (row < 0 || row >= tiles.length) return false;
    if (col < 0 || col >= tiles[0].length) return false;
    return isSolidTile(tiles[row][col].tile);
  };
}
