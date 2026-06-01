import { isSolidTile } from '../levels/level-format.js';

export function solidAt(tiles, col, row) {
  if (row < 0 || row >= tiles.length) return false;
  if (col < 0 || col >= tiles[0].length) return false;
  return isSolidTile(tiles[row][col].tile);
}

// Apply the consequence when the player bumps a tile from below.
// Mutates tiles + session counters FIRST (via world.addCoin/addScore/spawnPickup),
// THEN emits a semantic event for external side effects (spec §6 ordering).
export function bumpTile(world, col, row) {
  const cell = world.tiles[row][col];
  const power = world.player.power;
  switch (cell.tile) {
    case 'coin-block':
      cell.tile = 'used-block';
      world.addCoin();                                   // consequence first
      world.emit({ type: 'coin-collected', fromBlock: true });
      world.popup('200', col * 16, row * 16 - 14);
      break;
    case 'upgrade-block': {
      cell.tile = 'used-block';
      const kind = power === 'small' ? 'mushroom' : 'flower';
      world.spawnPickup(kind, col * 16, row * 16 - 16);  // real entity via injected factory
      world.emit({ type: 'powerup-spawned', kind });
      break;
    }
    case 'brick':
      if (power === 'small') { world.emit({ type: 'block-hit' }); }      // bounce, no break
      else { cell.tile = 'empty'; world.addScore(50); world.emit({ type: 'brick-broken' }); world.addShake(4); }
      break;
    default:
      world.emit({ type: 'block-hit' });
  }
}
