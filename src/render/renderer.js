import { buildSprites } from './sprites.js';
import { TILE } from '../engine/constants.js';

const SPRITE_FOR = {
  ground:'ground', brick:'brick', 'used-block':'usedBlock',
  pipe:'pipe', 'pipe-deco':'pipeDeco',
  // animated tiles are handled specially in draw(): coin, coin-block, upgrade-block
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

  // ----- PURE animation frame selectors (state + animClock only) -----------

  // Hero pose: airborne -> jump; moving -> alternate walk; else stand.
  function heroPose(p, clock) {
    if (!p.onGround) return 'jump';
    if (Math.abs(p.vx) > 5) return (Math.floor(clock * 10) % 2) ? 'walkB' : 'walkA';
    return 'stand';
  }
  function coinFrame(clock) { return Math.floor(clock * 8) % 4; }
  function shimmerFrame(clock) { return Math.floor(clock * 3) % 3; }
  function goombaFrame(clock) { return Math.floor(clock * 6) % 2; }

  // Draw a source canvas at an integer dest rect, optionally horizontally
  // flipped. Never mutates anything outside the 2d context transform.
  function blit(src, dx, dy, dw, dh, flip) {
    if (flip) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(src, dx, dy, dw, dh);
    }
  }

  // ----- background ---------------------------------------------------------

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#3a7bd5');
    g.addColorStop(0.55, '#6aa8f0');
    g.addColorStop(1, '#bfe0ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Soft clouds drift slowly using animClock (no cam parallax).
  function drawClouds(clock) {
    const W = canvas.width;
    const positions = [ {bx: 30, y: 28, s: 1.0}, {bx: 150, y: 50, s: 0.8}, {bx: 240, y: 22, s: 1.2} ];
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const c of positions) {
      const span = W + 80;
      let x = ((c.bx + clock * 8) % span);
      if (x < 0) x += span;
      x -= 40;
      puff(Math.round(x), c.y, c.s);
    }
  }
  function puff(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 8 * s, 0, Math.PI * 2);
    ctx.arc(x + 10 * s, y - 4 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(x + 22 * s, y, 8 * s, 0, Math.PI * 2);
    ctx.arc(x + 11 * s, y + 3 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Layered rounded hills + bushes, parallaxed purely by cam.x.
  function drawHills(camX) {
    const baseY = 200;
    // far hills (lighter, slower)
    ctx.fillStyle = '#4fa85a';
    let off = -(camX * 0.3) % 160;
    for (let x = off - 160; x < canvas.width + 160; x += 160) {
      hill(x + 60, baseY + 8, 52);
    }
    // near hills (darker, faster)
    ctx.fillStyle = '#2f8a3c';
    off = -(camX * 0.5) % 130;
    for (let x = off - 130; x < canvas.width + 130; x += 130) {
      hill(x + 40, baseY + 14, 38);
    }
    // small bushes near the front
    ctx.fillStyle = '#1f6e2c';
    off = -(camX * 0.65) % 95;
    for (let x = off - 95; x < canvas.width + 95; x += 95) {
      bush(x + 20, baseY + 22);
    }
  }
  function hill(cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.fill();
  }
  function bush(cx, cy) {
    ctx.beginPath();
    ctx.arc(cx, cy, 9, Math.PI, 0);
    ctx.arc(cx + 11, cy, 12, Math.PI, 0);
    ctx.arc(cx + 24, cy, 9, Math.PI, 0);
    ctx.fill();
  }

  const ENT_SPRITE = { mushroom:'mushroom', flower:'flower', fireball:'fireball' };

  function draw(world, cam, alpha, session, state) {
    cam.follow(interp(world.player, alpha));      // mutates cam only, never world
    const clock = world.animClock;                // READ-ONLY animation clock

    drawSky();
    drawClouds(clock);
    drawHills(cam.x);

    // tiles — each sprite scaled to a full TILE×TILE cell
    const t = world.tiles;
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(t[0].length-1, Math.ceil((cam.x + canvas.width) / TILE));
    for (let row=0; row<t.length; row++) for (let col=c0; col<=c1; col++) {
      const kind = t[row][col].tile;
      const dx = Math.round(col*TILE - cam.x), dy = Math.round(row*TILE);
      let img;
      if (kind === 'coin')             img = sprites.coinFrames[coinFrame(clock)];
      else if (kind === 'coin-block')  img = sprites.coinBlockFrames[shimmerFrame(clock)];
      else if (kind === 'upgrade-block') img = sprites.upgradeBlockFrames[shimmerFrame(clock)];
      else { const key = SPRITE_FOR[kind]; if (!key) continue; img = sprites[key]; }
      ctx.drawImage(img, dx, dy, TILE, TILE);
    }

    drawFlagpole(world, cam, clock);

    // entities — goomba uses decoupled visual size + waddle/squash; others 1:1
    for (const e of world.entities) {
      const p = interp(e, alpha);
      if (e.type === 'goomba') {
        const sz = sprites.goombaSize;
        const img = e.squashT > 0 ? sprites.goombaSquash : sprites.goombaFrames[goombaFrame(clock)];
        const dx = Math.round(p.x + e.w/2 - sz.w/2 - cam.x);
        const dy = Math.round(p.y + e.h - sz.h);
        blit(img, dx, dy, sz.w, sz.h, false);
        continue;
      }
      const key = ENT_SPRITE[e.type]; if (!key) continue;
      ctx.drawImage(sprites[key], Math.round(p.x - cam.x), Math.round(p.y), e.w, e.h);
    }

    // player — decoupled visual size, centered horizontally + bottom-aligned,
    // pose chosen purely from state + animClock; flipped when facing < 0.
    const pl = world.player;
    if (!(pl.invuln > 0 && Math.floor(pl.invuln * 20) % 2)) {
      const tier = (pl.power === 'small' || pl.power === 'big' || pl.power === 'fire') ? pl.power : 'big';
      const pose = heroPose(pl, clock);
      const img = sprites.hero[tier][pose];
      const sz = sprites.heroSize[tier];
      const pp = interp(pl, alpha);
      const dx = Math.round(pp.x + pl.w/2 - sz.w/2 - cam.x);
      const dy = Math.round(pp.y + pl.h - sz.h);
      blit(img, dx, dy, sz.w, sz.h, pl.facing < 0);
    }

    drawHUD(session, world);
    if (state) drawOverlay(state);                // paused / level-clear / game-over / win
  }

  function interp(e, alpha){ return { x: lerp(e.prevX ?? e.x, e.x, alpha), y: lerp(e.prevY ?? e.y, e.y, alpha), w:e.w, h:e.h }; }

  // Procedural flagpole with a gently waving flag (animClock-driven, read-only).
  function drawFlagpole(world, cam, clock) {
    const fx = Math.round(world.level.finish.x - cam.x), fy = Math.round(world.level.finish.y);
    // pole with a metallic edge + ball on top
    ctx.fillStyle = '#b9c2cc'; ctx.fillRect(fx + 7, fy, 3, world.bounds.bottom - fy);
    ctx.fillStyle = '#e6edf3'; ctx.fillRect(fx + 7, fy, 1, world.bounds.bottom - fy);
    ctx.fillStyle = '#cfd9e2'; ctx.beginPath(); ctx.arc(fx + 8, fy - 2, 3, 0, Math.PI * 2); ctx.fill();
    // triangular flag that waves: the tip and trailing edge sway with animClock
    const wave = Math.sin(clock * 4) * 3;
    const tip = Math.sin(clock * 4 + 1) * 2;
    ctx.fillStyle = '#2ecc40';
    ctx.beginPath();
    ctx.moveTo(fx + 7, fy + 3);
    ctx.lineTo(fx - 7 + wave, fy + 7 + tip);
    ctx.lineTo(fx + 7, fy + 12);
    ctx.closePath();
    ctx.fill();
    // darker underside for depth
    ctx.fillStyle = '#27a335';
    ctx.beginPath();
    ctx.moveTo(fx + 7, fy + 8);
    ctx.lineTo(fx - 7 + wave, fy + 7 + tip);
    ctx.lineTo(fx + 7, fy + 12);
    ctx.closePath();
    ctx.fill();
  }

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
    // gradient sky backdrop for the title screen
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#1f3f8a'); g.addColorStop(1, '#3a7bd5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // hero standing big in the middle as a logo accent
    const sz = sprites.heroSize.big;
    ctx.drawImage(sprites.hero.big.stand, Math.round(canvas.width/2 - sz.w), Math.round(canvas.height/2 - 60), sz.w*2, sz.h*2);
    centerText('PLUMBER QUEST', canvas.height / 2 + 18, '#fff');
    centerText('PRESS ANY KEY', canvas.height / 2 + 38, '#ffd23f');
  }

  return { draw, drawTitle };
}
