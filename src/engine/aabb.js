export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// Move `box` by velocity*dt, resolving against solid tiles one axis at a time.
// `solid(col,row)` returns true if that tile blocks. Returns geometric facts.
export function resolveAgainstTiles(box, solid, tile, dt) {
  const facts = {
    landedOnTop: false, hitFromBelow: false, sideBlocked: false,
    tilesHitBelow: [], tilesHitSide: [],
  };

  // --- Horizontal axis ---
  box.x += box.vx * dt;
  if (box.vx !== 0) {
    const dir = Math.sign(box.vx);
    const probeX = dir > 0 ? box.x + box.w : box.x;
    const col = Math.floor(probeX / tile);
    for (let row = Math.floor(box.y / tile); row <= Math.floor((box.y + box.h - 1) / tile); row++) {
      if (solid(col, row)) {
        box.x = dir > 0 ? col * tile - box.w : (col + 1) * tile;
        box.vx = 0;
        facts.sideBlocked = true;
        facts.tilesHitSide.push({ col, row });
        break;
      }
    }
  }

  // --- Vertical axis ---
  box.y += box.vy * dt;
  if (box.vy !== 0) {
    const dir = Math.sign(box.vy);
    const probeY = dir > 0 ? box.y + box.h : box.y;
    const row = Math.floor(probeY / tile);
    for (let col = Math.floor(box.x / tile); col <= Math.floor((box.x + box.w - 1) / tile); col++) {
      if (solid(col, row)) {
        if (dir > 0) { box.y = row * tile - box.h; facts.landedOnTop = true; }
        else { box.y = (row + 1) * tile; facts.hitFromBelow = true; facts.tilesHitBelow.push({ col, row }); }
        box.vy = 0;
        break;
      }
    }
  }
  return facts;
}
