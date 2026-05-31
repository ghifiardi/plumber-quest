import { buildSprites } from './sprites.js';
import { TILE } from '../engine/constants.js';

const SPRITE_FOR = {
  ground:'ground', brick:'brick', 'coin-block':'coinBlock', 'upgrade-block':'upgradeBlock',
  'used-block':'usedBlock', pipe:'pipe', 'pipe-deco':'pipeDeco', coin:'coin',
};

const OVERLAY_TEXT = {
  'paused': 'PAUSED', 'level-clear': 'LEVEL CLEAR!', 'game-over': 'GAME OVER',
  'win': 'YOU WIN!  PRESS A KEY',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sprites = buildSprites(1);

  function lerp(a, b, t){ return a + (b - a) * t; }

  const ENT_SPRITE = { goomba:'goomba', mushroom:'mushroom', flower:'flower', 'coin-pickup':'coin', fireball:'fireball' };

  function draw(world, cam, alpha, session, state) {
    cam.follow(interp(world.player, alpha));      // mutates cam only, never world
    // sky
    ctx.fillStyle = '#5c94fc'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // parallax hills (derived purely from cam.x — no renderer-owned animation state)
    ctx.fillStyle = '#3a3';
    const off = -(cam.x * 0.5) % 80;
    for (let x = off - 80; x < canvas.width + 80; x += 80) {
      ctx.beginPath(); ctx.arc(x+40, 200, 30, Math.PI, 0); ctx.fill();
    }
    // tiles — each sprite scaled to a full TILE×TILE cell
    const t = world.tiles;
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(t[0].length-1, Math.ceil((cam.x + canvas.width) / TILE));
    for (let row=0; row<t.length; row++) for (let col=c0; col<=c1; col++) {
      const key = SPRITE_FOR[t[row][col].tile]; if (!key) continue;
      ctx.drawImage(sprites[key], Math.round(col*TILE - cam.x), Math.round(row*TILE), TILE, TILE);
    }
    // flagpole — drawn procedurally from the single finish point down to the ground
    const fx = Math.round(world.level.finish.x - cam.x), fy = Math.round(world.level.finish.y);
    ctx.fillStyle = '#dcdcdc'; ctx.fillRect(fx + 7, fy, 2, world.bounds.bottom - fy);
    ctx.fillStyle = '#2ecc40'; ctx.beginPath();
    ctx.moveTo(fx + 7, fy + 2); ctx.lineTo(fx - 5, fy + 6); ctx.lineTo(fx + 7, fy + 10); ctx.fill();
    // entities — scaled to each entity's own w/h
    for (const e of world.entities) {
      const key = ENT_SPRITE[e.type]; if (!key) continue;
      const p = interp(e, alpha);
      ctx.drawImage(sprites[key], Math.round(p.x - cam.x), Math.round(p.y), e.w, e.h);
    }
    // player — scaled to player w/h; blink during invulnerability
    const pk = world.player.power === 'small' ? 'playerSmall' : 'playerBig';
    if (!(world.player.invuln > 0 && Math.floor(world.player.invuln * 20) % 2)) {
      const pp = interp(world.player, alpha);
      ctx.drawImage(sprites[pk], Math.round(pp.x - cam.x), Math.round(pp.y), world.player.w, world.player.h);
    }
    drawHUD(session, world);
    if (state) drawOverlay(state);                // paused / level-clear / game-over / win
  }

  function interp(e, alpha){ return { x: lerp(e.prevX ?? e.x, e.x, alpha), y: lerp(e.prevY ?? e.y, e.y, alpha), w:e.w, h:e.h }; }

  function drawHUD(session, world) {
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${String(session.score).padStart(6,'0')}`, 4, 2);
    ctx.fillText(`x${session.coins}`, 96, 2);
    ctx.fillText(`WORLD 1-${session.levelIndex+1}`, 150, 2);
    ctx.fillText(`TIME ${Math.ceil(world.timeRemaining)}`, 210, 2);
    ctx.fillText(`LIVES ${session.lives}`, 4, 12);
  }

  function centerText(text, y, color = '#fff') {
    ctx.fillStyle = color; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, y); ctx.textAlign = 'left';
  }

  function drawOverlay(state) {
    const text = OVERLAY_TEXT[state]; if (!text) return;   // 'dying' shows the death animation, no overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    centerText(text, canvas.height / 2);
  }

  function drawTitle() {
    ctx.fillStyle = '#5c94fc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    centerText('PLUMBER QUEST', canvas.height / 2 - 12, '#fff');
    centerText('PRESS ANY KEY', canvas.height / 2 + 8, '#ffd23f');
  }

  return { draw, drawTitle };
}
