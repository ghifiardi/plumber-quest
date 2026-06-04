import { buildSprites } from './sprites.js';
import { TILE } from '../engine/constants.js';

const SPRITE_FOR = {
  ground:'ground', brick:'brick', 'used-block':'usedBlock',
  pipe:'pipe', 'pipe-deco':'pipeDeco',
  // animated tiles handled specially in draw(): coin, coin-block, upgrade-block
};

// Only states that overlay ON TOP of the live world. Full-screen states
// (title/intro/game-over/win) are drawn by their own functions.
const OVERLAY_TEXT = { 'paused': 'PAUSED', 'level-clear': 'LEVEL CLEAR!' };

// Pure cosmetic squash/stretch from read-only player state + a landing impulse
// (landT in 0..1, decays in the renderer). Volume-ish: sx*sy ≈ 1.
export function heroSquash(p, landT) {
  if (landT > 0) {                          // landing squash dominates
    const k = 0.18 * landT;
    return { sx: 1 + k, sy: 1 - k };
  }
  if (!p.onGround && p.vy < -80) {          // rising fast => stretch
    const k = Math.min(0.12, (-p.vy - 80) / 1600 + 0.04);
    return { sx: 1 - k, sy: 1 + k };
  }
  return { sx: 1, sy: 1 };
}

export function createRenderer(canvas) {
  // Render at the native 256x240 backbuffer (CSS scales the element to fill the screen).
  // A large pixelated backbuffer upscaled by CSS can stop recompositing on some mobile
  // GPUs (appears frozen), so we keep the backbuffer native and let CSS do the scaling.
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const begin = () => {};                                     // no-op (native backbuffer)
  const sprites = buildSprites(1);
  const isCoarse = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
    || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

  const lerp = (a, b, t) => a + (b - a) * t;
  const interp = (e, alpha) => ({ x: lerp(e.prevX ?? e.x, e.x, alpha), y: lerp(e.prevY ?? e.y, e.y, alpha), w: e.w, h: e.h });
  // Display-only blink for "press start" prompts (not part of the sim).
  const blink = () => (typeof performance !== 'undefined' ? Math.floor(performance.now() / 450) % 2 === 0 : true);

  // ----- PURE animation frame selectors (state + animClock only) -----------
  function heroPose(p, clock) {
    if (!p.onGround) return 'jump';
    if (Math.abs(p.vx) > 5) return (Math.floor(clock * 10) % 2) ? 'walkB' : 'walkA';
    return 'stand';
  }
  const coinFrame = (c) => Math.floor(c * 8) % 4;
  const shimmerFrame = (c) => Math.floor(c * 3) % 3;
  const goombaFrame = (c) => Math.floor(c * 6) % 2;
  const heroAnim = { prevOnGround: true, landT: 0 };

  function blit(src, dx, dy, dw, dh, flip) {
    if (flip) { ctx.save(); ctx.translate(dx + dw, dy); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, dw, dh); ctx.restore(); }
    else { ctx.drawImage(src, dx, dy, dw, dh); }
  }

  // ----- background (steady; not affected by screen shake) ------------------
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a7bd5'); g.addColorStop(0.55, '#6aa8f0'); g.addColorStop(1, '#bfe0ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function drawClouds(clock) {
    const positions = [ {bx:30,y:28,s:1.0}, {bx:150,y:50,s:0.8}, {bx:240,y:22,s:1.2} ];
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const c of positions) { const span = W + 80; let x = ((c.bx + clock * 8) % span); if (x < 0) x += span; x -= 40; puff(Math.round(x), c.y, c.s); }
  }
  function puff(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 8*s, 0, Math.PI*2); ctx.arc(x+10*s, y-4*s, 10*s, 0, Math.PI*2);
    ctx.arc(x+22*s, y, 8*s, 0, Math.PI*2); ctx.arc(x+11*s, y+3*s, 9*s, 0, Math.PI*2); ctx.fill();
  }
  function drawHills(camX) {
    const baseY = 200;
    ctx.fillStyle = '#4fa85a'; let off = -(camX*0.3) % 160;
    for (let x = off-160; x < W+160; x += 160) hill(x+60, baseY+8, 52);
    ctx.fillStyle = '#2f8a3c'; off = -(camX*0.5) % 130;
    for (let x = off-130; x < W+130; x += 130) hill(x+40, baseY+14, 38);
    ctx.fillStyle = '#1f6e2c'; off = -(camX*0.65) % 95;
    for (let x = off-95; x < W+95; x += 95) bush(x+20, baseY+22);
  }
  function hill(cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill(); }
  function bush(cx, cy) { ctx.beginPath(); ctx.arc(cx,cy,9,Math.PI,0); ctx.arc(cx+11,cy,12,Math.PI,0); ctx.arc(cx+24,cy,9,Math.PI,0); ctx.fill(); }

  const ENT_SPRITE = { mushroom:'mushroom', flower:'flower', fireball:'fireball' };

  // The gameplay layer (tiles, flag, entities, player, popups) — drawn inside the
  // screen-shake transform so the world jolts while the HUD/background stay put.
  function drawWorld(world, cam, alpha, clock) {
    const t = world.tiles;
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(t[0].length-1, Math.ceil((cam.x + W) / TILE));
    for (let row=0; row<t.length; row++) for (let col=c0; col<=c1; col++) {
      const kind = t[row][col].tile;
      const dx = Math.round(col*TILE - cam.x), dy = Math.round(row*TILE);
      let img;
      if (kind === 'coin') img = sprites.coinFrames[coinFrame(clock)];
      else if (kind === 'coin-block') img = sprites.coinBlockFrames[shimmerFrame(clock)];
      else if (kind === 'upgrade-block') img = sprites.upgradeBlockFrames[shimmerFrame(clock)];
      else { const key = SPRITE_FOR[kind]; if (!key) continue; img = sprites[key]; }
      ctx.drawImage(img, dx, dy, TILE, TILE);
    }

    drawFlagpole(world, cam, clock);

    for (const e of world.entities) {
      const p = interp(e, alpha);
      if (e.type === 'goomba') {
        const sz = sprites.goombaSize;
        const img = e.squashT > 0 ? sprites.goombaSquash : sprites.goombaFrames[goombaFrame(clock)];
        blit(img, Math.round(p.x + e.w/2 - sz.w/2 - cam.x), Math.round(p.y + e.h - sz.h), sz.w, sz.h, false);
        continue;
      }
      if (e.type === 'koopa') {
        const sz = sprites.koopaSize;
        const img = e.mode === 'walk' ? sprites.koopaFrames[goombaFrame(clock)] : sprites.koopaShell;
        blit(img, Math.round(p.x + e.w/2 - sz.w/2 - cam.x), Math.round(p.y + e.h - sz.h), sz.w, sz.h, e.mode === 'walk' && e.vx > 0);
        continue;
      }
      const key = ENT_SPRITE[e.type]; if (!key) continue;
      ctx.drawImage(sprites[key], Math.round(p.x - cam.x), Math.round(p.y), e.w, e.h);
    }

    const pl = world.player;
    // landing detection (display-only): onGround false->true starts a squash impulse
    if (pl.onGround && !heroAnim.prevOnGround) heroAnim.landT = 1;
    heroAnim.prevOnGround = pl.onGround;
    heroAnim.landT = Math.max(0, heroAnim.landT - 0.16);   // ~6 frames decay
    if (!(pl.invuln > 0 && Math.floor(pl.invuln * 20) % 2)) {
      const tier = (pl.power === 'small' || pl.power === 'big' || pl.power === 'fire') ? pl.power : 'big';
      const img = sprites.hero[tier][heroPose(pl, clock)];
      const sz = sprites.heroSize[tier];
      const pp = interp(pl, alpha);
      const { sx, sy } = heroSquash(pl, heroAnim.landT);
      const dw = sz.w * sx, dh = sz.h * sy;
      const dx = Math.round(pp.x + pl.w / 2 - dw / 2 - cam.x);
      const dy = Math.round(pp.y + pl.h - dh);             // keep feet planted
      blit(img, dx, dy, dw, dh, pl.facing < 0);
    }

    drawPopups(world, cam);
    drawFireworks(world, cam);
  }

  // Expanding firework bursts (read-only over world.fireworks).
  const FW_COLORS = ['#ffd23f', '#ff5a4d', '#7fdfff', '#2ecc40', '#ffffff'];
  function drawFireworks(world, cam) {
    if (!world.fireworks || !world.fireworks.length) return;
    for (const fw of world.fireworks) {
      const cx = Math.round(fw.x - cam.x), cy = Math.round(fw.y);
      const r = fw.t * 90, a = Math.max(0, 1 - fw.t / 0.8);
      ctx.globalAlpha = a; ctx.fillStyle = FW_COLORS[(Math.floor(fw.x) >> 4) % FW_COLORS.length];
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        ctx.fillRect(Math.round(cx + Math.cos(ang) * r) - 1, Math.round(cy + Math.sin(ang) * r) - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Floating "+100/+200/+1000" score text — read-only over world.popups.
  function drawPopups(world, cam) {
    if (!world.popups || !world.popups.length) return;
    ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const p of world.popups) {
      const x = Math.round(p.x + 8 - cam.x), y = Math.round(p.y);
      const a = Math.max(0, Math.min(1, p.life / 0.85));
      ctx.fillStyle = `rgba(0,0,0,${0.5 * a})`; ctx.fillText(p.text, x + 1, y + 1);
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillText(p.text, x, y);
    }
    ctx.textAlign = 'left';
  }

  function draw(world, cam, alpha, session, state) {
    begin();
    cam.follow(interp(world.player, alpha));      // mutates cam only, never world
    const clock = world.animClock || 0;

    drawSky(); drawClouds(clock); drawHills(cam.x);   // steady background

    const s = world.shake || 0;                       // screen shake (deterministic, no random)
    const sx = s > 0 ? Math.round(Math.sin(clock * 90) * s) : 0;
    const sy = s > 0 ? Math.round(Math.cos(clock * 83) * s) : 0;
    ctx.save(); ctx.translate(sx, sy);
    drawWorld(world, cam, alpha, clock);
    ctx.restore();

    // each fresh level fades in from black over its first 0.4s (animClock starts at 0)
    if (state === 'playing' && clock < 0.4) { ctx.fillStyle = `rgba(0,0,0,${1 - clock / 0.4})`; ctx.fillRect(0, 0, W, H); }

    drawHUD(session, world);
    if (state) drawOverlay(state);                    // paused / level-clear only
  }

  function drawFlagpole(world, cam, clock) {
    const fx = Math.round(world.level.finish.x - cam.x), fy = Math.round(world.level.finish.y);
    const poleBottom = world.bounds.bottom;
    ctx.fillStyle = '#b9c2cc'; ctx.fillRect(fx + 7, fy, 3, poleBottom - fy);
    ctx.fillStyle = '#e6edf3'; ctx.fillRect(fx + 7, fy, 1, poleBottom - fy);
    ctx.fillStyle = '#cfd9e2'; ctx.beginPath(); ctx.arc(fx + 8, fy - 2, 3, 0, Math.PI * 2); ctx.fill();
    // The flag rides DOWN the pole on level-clear (world.flagSlide: 0 top -> 1 bottom).
    const range = Math.max(0, (poleBottom - 32) - fy - 14);
    const flagY = fy + Math.round((world.flagSlide || 0) * range);
    const wave = Math.sin(clock * 4) * 3, tip = Math.sin(clock * 4 + 1) * 2;
    ctx.fillStyle = '#2ecc40';
    ctx.beginPath(); ctx.moveTo(fx + 7, flagY + 3); ctx.lineTo(fx - 7 + wave, flagY + 7 + tip); ctx.lineTo(fx + 7, flagY + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#27a335';
    ctx.beginPath(); ctx.moveTo(fx + 7, flagY + 8); ctx.lineTo(fx - 7 + wave, flagY + 7 + tip); ctx.lineTo(fx + 7, flagY + 12); ctx.closePath(); ctx.fill();
  }

  function drawHUD(session, world) {
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${String(session.score).padStart(6,'0')}`, 4, 2);
    ctx.fillText(`x${session.coins}`, 96, 2);
    ctx.fillText(`ZONE 1-${session.levelIndex+1}`, 150, 2);
    ctx.fillText(`TIME ${Math.ceil(world.timeRemaining)}`, 210, 2);
    ctx.fillText(`LIVES ${session.lives}`, 4, 12);
  }

  function centerText(str, y, color = '#fff', size = 10) {
    ctx.font = `${size}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0008'; ctx.fillText(str, W/2 + 1, y + 1);
    ctx.fillStyle = color; ctx.fillText(str, W/2, y); ctx.textAlign = 'left';
  }

  function drawOverlay(state) {
    const text = OVERLAY_TEXT[state]; if (!text) return;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    centerText(text, H / 2);
  }

  // Black "ZONE 1-x" card with hero + lives, shown before each level.
  function drawIntro(world, session) {
    begin();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    centerText(`ZONE 1-${session.levelIndex + 1}`, H / 2 - 24, '#fff', 12);
    const sz = sprites.heroSize.small;
    const hx = Math.round(W/2 - sz.w - 8), hy = Math.round(H/2 + 2);
    ctx.drawImage(sprites.hero.small.stand, hx, hy, sz.w, sz.h);
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`×  ${session.lives}`, Math.round(W/2), hy + sz.h / 2);
  }

  function drawGameOver(session) {
    begin();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    centerText('GAME OVER', H/2 - 16, '#ff5a4d', 12);
    centerText('SCORE ' + String(session.score).padStart(6, '0'), H/2 + 6, '#fff', 8);
    if (blink()) centerText(isCoarse ? 'TAP TO RETRY' : 'PRESS A KEY', H/2 + 26, '#ffd23f', 8);
  }

  function drawWin(session) {
    begin();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1f3f8a'); g.addColorStop(1, '#3a7bd5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const sz = sprites.heroSize.big;
    ctx.drawImage(sprites.hero.big.stand, Math.round(W/2 - sz.w/2), Math.round(H/2 - 54), sz.w, sz.h);
    centerText('YOU WIN!', H/2 - 2, '#ffd23f', 12);
    centerText('SCORE ' + String(session.score).padStart(6, '0'), H/2 + 18, '#fff', 8);
    if (blink()) centerText(isCoarse ? 'TAP TO PLAY AGAIN' : 'PRESS A KEY', H/2 + 38, '#fff', 8);
  }

  const DIFF_LABELS = ['EASY', 'NORMAL', 'HARD'];
  function drawDifficultySelect(gs) {
    begin();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1f3f8a'); g.addColorStop(1, '#3a7bd5');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    centerText('SELECT DIFFICULTY', H/2 - 52, '#fff', 10);
    for (let i = 0; i < DIFF_LABELS.length; i++) {
      const sel = i === gs.selIndex;
      centerText((sel ? '▸ ' : '  ') + DIFF_LABELS[i] + (sel ? ' ◂' : ''), H/2 - 20 + i * 18, sel ? '#ffd23f' : '#9fb0c8', 10);
    }
    centerText(isCoarse ? '◀ ▶ choose    A start' : '← → choose    ENTER start', H/2 + 50, '#bcd', 7);
  }

  // ===== TITLE-SCREEN KEY ART ================================================
  // A composed splash echoing the promo poster, drawn entirely in-engine so it
  // stays crisp at any resolution and matches the in-game pixel art.

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function starShape(cx, cy, r, color) {
    ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 ? r * 0.44 : r;
      ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
    }
    ctx.closePath(); ctx.fill();
  }

  // Small plumber's wrench glyph (used as a feature-pill icon).
  function wrenchIcon(cx, cy, s, color) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.26;
    ctx.beginPath(); ctx.moveTo(0, s * 0.55); ctx.lineTo(0, -s * 0.12); ctx.stroke();
    ctx.lineWidth = s * 0.2;
    ctx.beginPath(); ctx.arc(0, -s * 0.36, s * 0.32, Math.PI * 0.18, Math.PI * 1.82); ctx.stroke();
    ctx.restore();
  }

  // Chunky extruded logo word: dark outline + coloured face + lighter top half + side depth.
  function logoWord(str, cx, baseY, size, face, top, side) {
    ctx.save();
    ctx.font = `900 ${size}px "Arial Black", Impact, "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const depth = Math.max(2, Math.round(size * 0.13));
    for (let i = depth; i >= 1; i--) { ctx.fillStyle = side; ctx.fillText(str, cx + i, baseY + i); }
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.13); ctx.strokeStyle = '#16122b';
    ctx.strokeText(str, cx, baseY);
    ctx.fillStyle = face; ctx.fillText(str, cx, baseY);
    ctx.save();                                            // lighter top band for a 2-tone bevel
    ctx.beginPath(); ctx.rect(0, baseY - size, W, size * 0.46); ctx.clip();
    ctx.fillStyle = top; ctx.fillText(str, cx, baseY);
    ctx.restore();
    ctx.restore();
  }

  function ribbon(text, cy, halfW) {
    const h = 16, x0 = Math.round(W / 2 - halfW), x1 = Math.round(W / 2 + halfW);
    ctx.fillStyle = '#7a1f24';                             // folded tails behind the band
    ctx.beginPath(); ctx.moveTo(x0 - 14, cy - h / 2 - 3); ctx.lineTo(x0, cy - h / 2); ctx.lineTo(x0, cy + h / 2); ctx.lineTo(x0 - 14, cy + h / 2 + 3); ctx.lineTo(x0 - 8, cy); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x1 + 14, cy - h / 2 - 3); ctx.lineTo(x1, cy - h / 2); ctx.lineTo(x1, cy + h / 2); ctx.lineTo(x1 + 14, cy + h / 2 + 3); ctx.lineTo(x1 + 8, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x0, cy - h / 2, halfW * 2, h);
    ctx.fillStyle = '#9c2b22'; ctx.fillRect(x0, cy + h / 2 - 3, halfW * 2, 3);
    ctx.strokeStyle = '#7a1f24'; ctx.lineWidth = 2; ctx.strokeRect(x0, cy - h / 2, halfW * 2, h);
    starShape(x0 + 12, cy, 4, '#ffd23f'); starShape(x1 - 12, cy, 4, '#ffd23f');
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, W / 2, cy + 1);
  }

  function titleGround(gy) {
    ctx.fillStyle = '#4fa85a'; ctx.fillRect(0, gy, W, 7);
    ctx.fillStyle = '#3c8c46'; ctx.fillRect(0, gy + 7, W, 3);
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(0, gy + 10, W, H - (gy + 10));
    ctx.fillStyle = '#5a3d24'; for (let x = 6; x < W; x += 20) ctx.fillRect(x, gy + 16, 9, 4);
    ctx.fillStyle = '#5fbf6a'; for (let x = 2; x < W; x += 9) ctx.fillRect(x, gy - 2, 2, 3);
  }

  function titleStars(clock) {
    const pts = [[20,16],[60,30],[110,12],[150,26],[196,14],[236,30],[88,40],[170,42],[40,48],[214,46]];
    for (let i = 0; i < pts.length; i++) {
      const a = 0.45 + 0.45 * Math.sin(clock * 2 + i);
      ctx.globalAlpha = Math.max(0.15, a); ctx.fillStyle = '#eaf4ff';
      ctx.fillRect(pts[i][0], pts[i][1], 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function featurePills(y) {
    const items = [
      { l1: 'EXPLORE', l2: 'NEW WORLDS', ic: 'star' },
      { l1: 'POWER UP', l2: 'YOUR TOOLS', ic: 'wrench' },
      { l1: 'COLLECT', l2: '& UPGRADE', ic: 'coin' },
    ];
    const m = 6, gap = 4, pw = (W - 2 * m - 2 * gap) / 3, ph = 34;
    for (let i = 0; i < 3; i++) {
      const px = m + i * (pw + gap), cx = px + pw / 2, it = items[i];
      ctx.fillStyle = 'rgba(15,21,40,0.92)'; roundRectPath(px, y, pw, ph, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(122,152,205,0.5)'; ctx.lineWidth = 1; roundRectPath(px + 0.5, y + 0.5, pw - 1, ph - 1, 6); ctx.stroke();
      if (it.ic === 'star') starShape(cx, y + 9, 6, '#ffd23f');
      else if (it.ic === 'wrench') wrenchIcon(cx, y + 9, 13, '#cfd9e2');
      else ctx.drawImage(sprites.coinFrames[0], Math.round(cx - 6), y + 3, 11, 12);
      ctx.fillStyle = '#dfe8f5'; ctx.font = 'bold 7px "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(it.l1, cx, y + 18); ctx.fillText(it.l2, cx, y + 26);
    }
  }

  // Twinkling 4-point sparkle (excitement accents around the hero).
  function sparkle(cx, cy, r, clock, phase) {
    const k = 0.55 + 0.45 * Math.sin(clock * 5 + phase);
    const rr = r * k;
    ctx.save(); ctx.globalAlpha = 0.4 + 0.6 * k; ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - rr); ctx.lineTo(cx + rr * 0.28, cy - rr * 0.28);
    ctx.lineTo(cx + rr, cy); ctx.lineTo(cx + rr * 0.28, cy + rr * 0.28);
    ctx.lineTo(cx, cy + rr); ctx.lineTo(cx - rr * 0.28, cy + rr * 0.28);
    ctx.lineTo(cx - rr, cy); ctx.lineTo(cx - rr * 0.28, cy - rr * 0.28);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // Dust puffs kicked up behind a runner's feet (drift back-and-up, then fade).
  function runDust(hx, gy, clock) {
    for (const ph of [0, 0.5]) {
      const t = (clock * 1.7 + ph) % 1;
      const px = hx - 2 - t * 16, py = gy - 1 - t * 5, r = 1.5 + t * 4;
      ctx.save(); ctx.globalAlpha = 0.5 * (1 - t); ctx.fillStyle = '#d6c8b4';
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }

  // Bold, pulsing call-to-action button — the primary "play me" hook.
  function drawPlayButton(cx, cy, clock, label) {
    const pulse = 1 + 0.045 * Math.sin(clock * 4.2);
    const w = 138 * pulse, h = 30 * pulse, x = cx - w / 2, y = cy - h / 2;
    ctx.save();                                            // soft pulsing glow
    ctx.globalAlpha = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(clock * 4.2));
    ctx.fillStyle = '#ffe46b'; roundRectPath(x - 7, y - 7, w + 14, h + 14, 14); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRectPath(x + 2, y + 3, w, h, 10); ctx.fill();   // drop shadow
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ffe572'); g.addColorStop(1, '#f0a81e');
    ctx.fillStyle = g; roundRectPath(x, y, w, h, 10); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#7a4a06'; roundRectPath(x, y, w, h, 10); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; roundRectPath(x + 5, y + 3, w - 10, h * 0.36, 7); ctx.fill();
    // play triangle + label
    const fs = Math.round(13 * pulse);
    ctx.fillStyle = '#5a2e00'; ctx.font = `bold ${fs}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width, triW = 9, gap = 6, total = triW + gap + tw;
    const tx = cx - total / 2;
    ctx.beginPath(); ctx.moveTo(tx, cy - 6); ctx.lineTo(tx + triW, cy); ctx.lineTo(tx, cy + 6); ctx.closePath(); ctx.fill();
    ctx.fillText(label, tx + triW + gap, cy + 1);
    ctx.textAlign = 'left';
  }

  function drawTitle() {
    begin();
    const clock = (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
    const gy = 164;                                        // grass line the scene stands on

    // --- background: sky, twinkling stars, drifting clouds, parallax hills, ground ---
    drawSky(); titleStars(clock); drawClouds(clock); drawHills(0);
    titleGround(gy);

    // --- supporting props (kept light so the hero is the focal point) ---
    ctx.drawImage(sprites.coinFrames[0], 68, 116, 13, 15);                         // floating coin (left)
    ctx.drawImage(sprites.coinBlockFrames[shimmerFrame(clock)], 162, 108, 18, 18); // ? block (right)
    ctx.drawImage(sprites.flower, 28, gy - 18, 16, 18);                            // flower (far left)
    ctx.drawImage(sprites.pipe, 216, gy - 44, 22, 22); ctx.drawImage(sprites.pipeDeco, 216, gy - 22, 22, 22); // pipe (far right)
    const bz = sprites.goombaSize;                                                 // blob foe (right of hero)
    ctx.drawImage(sprites.goombaFrames[goombaFrame(clock)], 178, gy - bz.h * 0.9, bz.w * 0.9, bz.h * 0.9);

    // --- HERO: big, centred, running in place toward the adventure ---
    const pose = (Math.floor(clock * 9) % 2) ? 'walkB' : 'walkA';   // ~9 strides/sec
    const bounce = Math.round(Math.abs(Math.sin(clock * 9)) * 2);   // small stride bob
    const hs = 2.8, hw = 16 * hs, hh = 24 * hs;
    const hx = Math.round(W / 2 - hw / 2), hy = Math.round(gy - hh - bounce);
    ctx.save(); ctx.globalAlpha = 0.26; ctx.fillStyle = '#163a12';  // steady ground shadow
    ctx.beginPath(); ctx.ellipse(W / 2, gy + 1, hw * 0.34, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    runDust(hx, gy, clock);                                          // dust kicked up behind the feet
    ctx.drawImage(sprites.hero.big[pose], hx, hy, hw, hh);
    sparkle(hx + 2, hy + 16, 4, clock, 0); sparkle(hx + hw - 2, hy + 10, 5, clock, 2.1);   // excitement sparkles

    // --- logo + ribbon ---
    logoWord('PLUMBER', W / 2, 40, 26, '#f4a72b', '#ffd84d', '#9c5a12');
    logoWord('QUEST', W / 2, 66, 27, '#d7e4f1', '#ffffff', '#5a7290');
    ribbon('A RETRO ADVENTURE', 82, 78);

    // --- primary call-to-action + feature pills ---
    drawPlayButton(W / 2, 186, clock, isCoarse ? 'TAP TO PLAY' : 'PRESS START');
    featurePills(205);
  }

  return { draw, drawTitle, drawDifficultySelect, drawIntro, drawGameOver, drawWin };
}
