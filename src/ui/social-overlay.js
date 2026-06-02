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
    const onTitle = gameState === 'title' || gameState === 'difficultySelect';

    // Counter: top-centre on the title (the DOM handle sits at the left), tiny
    // corner badge in-game. Wording makes "are others here?" unmistakable.
    if (onTitle) {
      const others = state.count > 1;
      const label = others ? `${state.count} PLAYERS ONLINE` : 'JUST YOU ONLINE';
      text(label, W / 2, 4, others ? '#ffd23f' : '#7fe6c8', 8, 'center');
    } else {
      text(`▸ ${state.count} online`, W - 4, 22, '#7fe6c8', 8, 'right');
    }

    // Right-side activity feed (avoids the bottom pills / top handle entirely):
    // fading callout bubbles, then the most recent milestones as dim lines.
    let by = onTitle ? 100 : 36;
    for (const b of state.bubbles) {
      const age = nowMs - b.born, a = Math.max(0, Math.min(1, 1 - age / 4000));
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      text(`${b.handle}: ${b.code}`, W - 4, by, '#ffd23f', 7, 'right');
      ctx.globalAlpha = 1; by += 10;
    }
    if (onTitle) {
      const recent = state.ticker.slice(-3);            // newest last; show newest on top
      for (let i = recent.length - 1; i >= 0; i--) {
        text(recent[i].text, W - 4, by, '#9fb8d8', 7, 'right'); by += 10;
      }
    }
  }

  return { draw };
}
