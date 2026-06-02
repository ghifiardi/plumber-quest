// src/ui/social-overlay.js
// Draws the social layer on top of the finished world frame. READ-ONLY of the
// social state; never touches world.js. Styling matches the retro HUD.
export function createSocialOverlay(ctx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;

  function text(str, x, y, color, size = 8, align = 'left') {
    ctx.font = `${size}px monospace`; ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.fillStyle = '#0008'; ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(str, x, y);
    ctx.textAlign = 'left';
  }

  function draw(state, nowMs, gameState) {
    if (!state.online) return;

    // Counter: top-right on the title, tiny corner badge in-game.
    const onTitle = gameState === 'title' || gameState === 'difficultySelect';
    text(`▸ ~${state.count} PLAYING`, onTitle ? W / 2 : W - 4, onTitle ? 4 : 22,
      '#7fe6c8', 8, onTitle ? 'center' : 'right');

    // Callout bubbles: stack up the right edge, fade near end of life.
    let by = 90;
    for (const b of state.bubbles) {
      const age = nowMs - b.born, a = Math.max(0, Math.min(1, 1 - age / 4000));
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      text(`${b.handle}: ${b.code}`, W - 4, by, '#ffd23f', 7, 'right');
      ctx.globalAlpha = 1; by += 11;
    }

    // Ticker: scrolling marquee along the bottom of the title screen.
    if (onTitle && state.ticker.length) {
      const line = state.ticker.map((t) => t.text).join('   •   ');
      ctx.font = '7px monospace'; ctx.textBaseline = 'bottom';
      const tw = ctx.measureText(line).width + 40;
      const x = W - ((nowMs / 30) % tw);
      ctx.fillStyle = '#0007'; ctx.fillRect(0, H - 12, W, 12);
      ctx.fillStyle = '#bcd'; ctx.textAlign = 'left';
      ctx.fillText(line, x, H - 3); ctx.fillText(line, x + tw, H - 3);
    }
  }

  return { draw };
}
