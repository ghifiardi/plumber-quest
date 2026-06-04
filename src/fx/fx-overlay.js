// src/fx/fx-overlay.js
// Draws the effects layer (particles + impact flash) over the finished world
// frame. READ-ONLY of the effects state and camera; never touches world.
export function createFxOverlay(ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  function draw(list, cam, flash) {
    for (const p of list) {
      const a = Math.max(0, Math.min(1, p.life / p.ttl));
      if (a <= 0) continue;
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      const s = Math.max(1, p.size);
      ctx.fillRect(Math.round(p.x - cam.x - s / 2), Math.round(p.y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.globalAlpha = Math.min(0.6, flash) * 0.5; ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
  }
  return { draw };
}
