// src/render/crt.js
// Optional CRT/scanline post-pass over the finished 256x240 frame. Off by
// default; preference persisted. Drawn LAST (covers world + overlays).
export const CRT_KEY = 'pq.crt';
export function createCrt(ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  let on = localStorage.getItem(CRT_KEY) === '1';
  function draw() {
    if (!on) return;
    ctx.save();
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#000';        // scanlines: darken every other row
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, 0, H);        // soft top/bottom vignette
    g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.12, 'rgba(0,0,0,0)');
    g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  return {
    draw, isOn: () => on,
    toggle: () => { on = !on; localStorage.setItem(CRT_KEY, on ? '1' : '0'); return on; },
  };
}
