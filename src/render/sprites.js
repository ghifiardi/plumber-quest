const PALETTE = { R:'#d33', r:'#a22', S:'#fc9', s:'#e96', B:'#852', b:'#621',
  G:'#3a3', g:'#283', Y:'#fd3', y:'#ca2', W:'#fff', K:'#000', O:'#e80', C:'#fc4', M:'#c0392b' };

function grid(rows, scale = 1) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas'); cv.width = w*scale; cv.height = h*scale;
  const ctx = cv.getContext('2d');
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const c = rows[y][x]; if (c===' '||c==='.') continue;
    ctx.fillStyle = PALETTE[c] || '#f0f'; ctx.fillRect(x*scale,y*scale,scale,scale);
  }
  return cv;
}

export function buildSprites(scale = 1) {
  return {
    playerSmall: grid([
      '..RRR...','.RRRRR..','.SSKS...','SSKSSK..','SSSKKK..','.SSSS...','.RRBR...','RR.BRR..',
    ], scale),
    playerBig: grid([
      '..RRR...','.RRRRR..','.SSKS...','SSKSSK..','SSSKKK..','.RRRR...','RRBRRR..','RRBBRR..',
      '.RR.RR..','.BB.BB..',
    ], scale),
    goomba: grid([
      '..BBBB..','.BBBBBB.','BBWBWBBB','BBKBKBBB','BBBBBBBB','.bb..bb.',
    ], scale),
    coin: grid(['.YYY.','YyYyY','YyYyY','YyYyY','.YYY.'], scale),
    coinBlock: grid(['OOOOOO','OYYYYO','OYKKYO','OYKYYO','OYYYYO','OOOOOO'], scale),
    upgradeBlock: grid(['OOOOOO','OCKKCO','OKCCKO','OKCCKO','OCKKCO','OOOOOO'], scale),
    usedBlock: grid(['bbbbbb','bBBBBb','bBBBBb','bBBBBb','bBBBBb','bbbbbb'], scale),
    brick: grid(['BBBBBB','BbBBbB','BBBBBB','bBBbBB','BBBBBB','BbBBbB'], scale),
    ground: grid(['BBBBBB','BbbbbB','bbbbbb','bbbbbb','bbbbbb','bbbbbb'], scale),
    pipe: grid(['GGGGGG','GggggG','GGGGGG','.GggG.','.GggG.','.GggG.'], scale),
    pipeDeco: grid(['.GggG.','.GggG.','.GggG.','.GggG.','.GggG.','.GggG.'], scale),
    mushroom: grid(['.RRRR.','RWRWRR','RRRRRR','.SSSS.','.SSSS.'], scale),
    flower: grid(['.OYO.','OYOYO','.OOO.','..G..','..G..'], scale),
    fireball: grid(['.OO.','OYYO','OYYO','.OO.'], scale),
  };
}
// NOTE: sprites are authored as tiny pixel grids (6–10px). The renderer draws each one
// scaled to its destination size (tiles → 16×16, entities → their w/h), so on-screen
// sprites align to the 16px tile grid. The flagpole is drawn procedurally (no sprite).
