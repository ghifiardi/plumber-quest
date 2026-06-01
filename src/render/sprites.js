// ============================================================================
// Original pixel-art sprite atlas (100% original art — no third-party assets).
//
// Each sprite is authored as a small ASCII grid where every character maps to a
// PALETTE colour. Grids include a black outline (K), a base colour, a darker
// shadow tone, and a lighter highlight, so on-screen sprites read as shaded,
// outlined art rather than flat blobs.
//
// Animation: the renderer selects which frame to draw as a PURE function of
// read-only entity state plus world.animClock. Nothing here stores per-frame
// state — frames are pre-rendered once at build time.
// ============================================================================

const PALETTE = {
  // red hero / mushroom
  R:'#e23b2e', r:'#a3261c', H:'#ff6a5c',
  // skin
  S:'#f7c69b', s:'#d89a6a',
  // brown / overalls / ground
  B:'#8a5a2b', b:'#5e3a17', N:'#3a6ea5', n:'#27507a', // N/n = blue overalls
  // greens (goomba is brown; pipe + scenery use greens)
  G:'#3fb24b', g:'#268a32', e:'#1c6325',
  // yellows / coins / blocks
  Y:'#ffd23f', y:'#caa01e', O:'#e8a020', o:'#b97a13',
  // cyan / fire accents
  C:'#7fdfff', c:'#34a9d6',
  // white / black / shadow grey
  W:'#ffffff', K:'#101014', D:'#2a2a33',
  // legacy browns (kept for any earth-toned art)
  T:'#9c6a3c', t:'#6f4824', M:'#3a2410',
  // fire hero (white outfit + accents)
  F:'#ffffff', f:'#d8d8e0',
  // --- original-character palette (hero/enemies/props are NOT third-party art) ---
  P:'#1fa39a', p:'#147068',           // hero cap & shirt (teal)
  V:'#ef8b2c', v:'#c46a14',           // hero overalls (orange)
  Q:'#9a55c8', q:'#6e3a93',           // shell / power mushroom (purple)
  I:'#3f78b0', i:'#285382', L:'#86b4e0', // steel-blue pipe (base / shade / highlight)
  J:'#e0556a', j:'#a83248',           // blob critter (rose)
};

// Remap palette letters within a grid (used to recolor authored art at build
// time without duplicating the ASCII grids).
function remap(rows, map) {
  return rows.map(r => r.split('').map(c => map[c] || c).join(''));
}

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

// ----------------------------------------------------------------------------
// HERO — small (16x16), big (16x24), fire (16x24, white+red palette).
// Authored facing RIGHT; renderer flips horizontally for facing < 0.
// Poses: stand, walkA, walkB, jump.
// ----------------------------------------------------------------------------

// --- SMALL hero (16 wide x 16 tall) ---
const SMALL_STAND = [
  '......KKKK......',
  '.....KRRRRK.....',
  '.....KRRRRK.....',
  '....KSSSKSK.....',
  '...KSsSSKSSK....',
  '...KSSsSKSSK....',
  '...KKSSSKKK.....',
  '..KRRNRRRK......',
  '.KRRRNRRRRK.....',
  '.KRNNNNNNRK.....',
  '.KSNYNNYNSK.....',
  '.KSNNNNNNSK.....',
  '..KNNN.NNNK.....',
  '..KbbK.Kbbk.....',
  '.Kbbbk.Kbbbk....',
  '.KKKK...KKKK....',
];
const SMALL_WALKA = [
  '......KKKK......',
  '.....KRRRRK.....',
  '.....KRRRRK.....',
  '....KSSSKSK.....',
  '...KSsSSKSSK....',
  '...KSSsSKSSK....',
  '...KKSSSKKK.....',
  '..KRRNRRRKK.....',
  '.KRRRNRRRRRK....',
  'KSRNNNNNNRRK....',
  'KSSNYNNYNNK.....',
  '.KNNNNNNNK......',
  '..KNNNNNNK......',
  '...KbbKKbbK.....',
  '..Kbbbk.Kbbk....',
  '..KKKK...KKK....',
];
const SMALL_WALKB = [
  '......KKKK......',
  '.....KRRRRK.....',
  '.....KRRRRK.....',
  '....KSSSKSK.....',
  '...KSsSSKSSK....',
  '...KSSsSKSSK....',
  '...KKSSSKKK.....',
  '....KRRNRRRKK...',
  '...KRRRNRRRRK.S.',
  '...KRNNNNNNRKSSK',
  '...KSNYNNYNNSSK.',
  '....KNNNNNNK....',
  '....KNNNNNNK....',
  '....KbbKKbbK....',
  '...Kbbk.Kbbbk...',
  '...KKK...KKKK...',
];
const SMALL_JUMP = [
  '....KKKK..S.....',
  '...KRRRRK.SK....',
  '...KRRRRKKSK....',
  '..KSSSKSKSSK....',
  '.KSsSSKSSRRK....',
  '.KSSsSKSRRRK....',
  '.KKSSSKKRRK.....',
  'KRRNRRRRRK......',
  'KRRRNRRRRK......',
  'KRNNNNNNRK......',
  'KSNYNNYNNK......',
  '.KNNNNNNK.......',
  '.KNNNNNNK.......',
  '.KbbKKbbK.......',
  'Kbbbk.Kbbk......',
  'KKKK...KKK......',
];

// --- BIG hero (16 wide x 24 tall) ---
const BIG_STAND = [
  '.....KKKKK......',
  '....KRRRRRK.....',
  '...KRRRRRRRK....',
  '...KSSSKSSSK....',
  '..KSsSSKSSSK....',
  '..KSSsSKSSSK....',
  '..KSSSSSKSSK....',
  '..KKSSSSSKK.....',
  '...KSSSSSK......',
  '..KRRNRRRRK.....',
  '.KRRRNNRRRRK....',
  'KRRRNNNNRRRRK...',
  'KSRNNNNNNNRSK...',
  'KSSNNYNNYNNSSK..',
  'KSSNNNNNNNNSSK..',
  '.KNNNNNNNNNNK...',
  '..KNNNNNNNNK....',
  '..KNNNN.NNNK....',
  '..KNNNK.KNNK....',
  '..KSSK...KSSK...',
  '..KbbK...KbbK...',
  '.KbbbK...KbbbK..',
  '.KbbbK...KbbbK..',
  '.KKKKK...KKKKK..',
];
const BIG_WALKA = [
  '.....KKKKK......',
  '....KRRRRRK.....',
  '...KRRRRRRRK....',
  '...KSSSKSSSK....',
  '..KSsSSKSSSK....',
  '..KSSsSKSSSK....',
  '..KSSSSSKSSK....',
  '..KKSSSSSKK.....',
  '...KSSSSSK......',
  '..KRRNRRRRKK....',
  '.KRRRNNRRRRRK...',
  'KSRRNNNNRRRRK...',
  'KSSNNNNNNNRK....',
  '.KSNNYNNYNNK....',
  '.KNNNNNNNNNK....',
  '..KNNNNNNNNK....',
  '..KNNNNNNNK.....',
  '...KNNNKNNNK....',
  '...KSSK.KNNK....',
  '..KbbbK.KSSK....',
  '.Kbbbk..KbbK....',
  '.Kbbk...KbbbK...',
  '.KKK....KbbbK...',
  '........KKKKK...',
];
const BIG_WALKB = [
  '.....KKKKK......',
  '....KRRRRRK.....',
  '...KRRRRRRRK....',
  '...KSSSKSSSK....',
  '..KSsSSKSSSK....',
  '..KSSsSKSSSK....',
  '..KSSSSSKSSK....',
  '..KKSSSSSKK.....',
  '...KSSSSSK..S...',
  '..KRRNRRRRKSSK..',
  '.KRRRNNRRRRRSK..',
  '.KRRNNNNRRRRK...',
  '..KNNNNNNNRK....',
  '..KNNYNNYNNK....',
  '..KNNNNNNNNK....',
  '..KNNNNNNNNK....',
  '...KNNNNNNK.....',
  '...KNNKKNNK.....',
  '..KNNK.KNNK.....',
  '..KSSK.KSSK.....',
  '.KbbbK.KbbbK....',
  '.Kbbk...Kbbk....',
  '.KKK.....KKK....',
  '................',
];
const BIG_JUMP = [
  '....KKKKK...S...',
  '...KRRRRRK.SK...',
  '..KRRRRRRRKSK...',
  '..KSSSKSSSKSK...',
  '.KSsSSKSSSKK....',
  '.KSSsSKSSRRK....',
  '.KSSSSSKRRRK....',
  '.KKSSSSSRRK.....',
  'KRRSSSSSRK......',
  'KRRRNRRRRK......',
  'KRRRNNRRRRK.....',
  'KSRNNNNRRRK.....',
  'KSSNNNNNNRK.....',
  '.KNNYNNYNNK.....',
  '.KNNNNNNNNK.....',
  '..KNNNNNNK......',
  '..KNNNNNNK......',
  '.KNNNKKNNNK.....',
  '.KSSK..KSSK.....',
  'KbbbK..KbbbK....',
  'Kbbk....Kbbk....',
  'KKK......KKK....',
  '................',
  '................',
];

// --- FIRE hero (16 wide x 24 tall) — white outfit, red cap/accents ---
const FIRE_STAND = [
  '.....KKKKK......',
  '....KRRRRRK.....',
  '...KRRRRRRRK....',
  '...KSSSKSSSK....',
  '..KSsSSKSSSK....',
  '..KSSsSKSSSK....',
  '..KSSSSSKSSK....',
  '..KKSSSSSKK.....',
  '...KSSSSSK......',
  '..KRRFRRRRK.....',
  '.KRRRFFRRRRK....',
  'KRRRFFFFRRRRK...',
  'KFRFFFFFFFRFK...',
  'KFFFFRFFRFFFFK..',
  'KFFFFFFFFFFFFK..',
  '.KFFFFFFFFFFK...',
  '..KFFFFFFFFK....',
  '..KFFFF.FFFK....',
  '..KFFFK.KFFK....',
  '..KSSK...KSSK...',
  '..KffK...KffK...',
  '.KfffK...KfffK..',
  '.KfffK...KfffK..',
  '.KKKKK...KKKKK..',
];
const FIRE_WALKA = [
  '.....KKKKK......',
  '....KRRRRRK.....',
  '...KRRRRRRRK....',
  '...KSSSKSSSK....',
  '..KSsSSKSSSK....',
  '..KSSsSKSSSK....',
  '..KSSSSSKSSK....',
  '..KKSSSSSKK.....',
  '...KSSSSSK......',
  '..KRRFRRRRKK....',
  '.KRRRFFRRRRRK...',
  'KFRRFFFFRRRRK...',
  'KFFFFFFFFFRK....',
  '.KFFFRFFRFFK....',
  '.KFFFFFFFFFK....',
  '..KFFFFFFFFK....',
  '..KFFFFFFFK.....',
  '...KFFFKFFFK....',
  '...KSSK.KFFK....',
  '..KfffK.KSSK....',
  '.Kfffk..KffK....',
  '.Kffk...KfffK...',
  '.KKK....KfffK...',
  '........KKKKK...',
];
const FIRE_WALKB = [
  '.....KKKKK......',
  '....KRRRRRK.....',
  '...KRRRRRRRK....',
  '...KSSSKSSSK....',
  '..KSsSSKSSSK....',
  '..KSSsSKSSSK....',
  '..KSSSSSKSSK....',
  '..KKSSSSSKK.....',
  '...KSSSSSK..S...',
  '..KRRFRRRRKSSK..',
  '.KRRRFFRRRRRSK..',
  '.KRRFFFFRRRRK...',
  '..KFFFFFFFRK....',
  '..KFFRFFRFFK....',
  '..KFFFFFFFFK....',
  '..KFFFFFFFFK....',
  '...KFFFFFFK.....',
  '...KFFKKFFK.....',
  '..KFFK.KFFK.....',
  '..KSSK.KSSK.....',
  '.KfffK.KfffK....',
  '.Kffk...Kffk....',
  '.KKK.....KKK....',
  '................',
];
const FIRE_JUMP = [
  '....KKKKK...S...',
  '...KRRRRRK.SK...',
  '..KRRRRRRRKSK...',
  '..KSSSKSSSKSK...',
  '.KSsSSKSSSKK....',
  '.KSSsSKSSRRK....',
  '.KSSSSSKRRRK....',
  '.KKSSSSSRRK.....',
  'KFFSSSSSRK......',
  'KRRRFRRRRK......',
  'KRRRFFRRRRK.....',
  'KFRFFFFRRRK.....',
  'KFFFFFFFFRK.....',
  '.KFFRFFRFFK.....',
  '.KFFFFFFFFK.....',
  '..KFFFFFFK......',
  '..KFFFFFFK......',
  '.KFFFKKFFFK.....',
  '.KSSK..KSSK.....',
  'KfffK..KfffK....',
  'Kffk....Kffk....',
  'KKK......KKK....',
  '................',
  '................',
];

// ----------------------------------------------------------------------------
// BLOB critter (16x16) — original rose-coloured foe. Two-frame waddle + squash.
// (Exported as goombaFrames/goombaSquash to keep the engine's entity names.)
// ----------------------------------------------------------------------------
const GOOMBA_A = [
  '................',
  '................',
  '.....KKKKKK.....',
  '...KKJJJJJJKK...',
  '..KJJJJJJJJJJK..',
  '.KJJWWJJWWJJJJK.',
  '.KJJWKJJWKJJJJK.',
  'KJJJWWJJWWJJJJJK',
  'KJJJJJJJJJJJJJJK',
  'KJJJJJKKJJJJJJJK',
  'KjJJJJJJJJJJJJjK',
  '.KjjJJJJJJJJjjK.',
  '..KKjjjjjjjjKK..',
  '...KbbK..KbbK...',
  '...KKK....KKK...',
  '................',
];
const GOOMBA_B = [
  '................',
  '................',
  '.....KKKKKK.....',
  '...KKJJJJJJKK...',
  '..KJJJJJJJJJJK..',
  '.KJJWWJJWWJJJJK.',
  '.KJJWKJJWKJJJJK.',
  'KJJJWWJJWWJJJJJK',
  'KJJJJJJJJJJJJJJK',
  'KJJJJJKKJJJJJJJK',
  'KjJJJJJJJJJJJJjK',
  '.KjjJJJJJJJJjjK.',
  '..KKjjjjjjjjKK..',
  '..KbbK....KbbK..',
  '..KKK......KKK..',
  '................',
];
const GOOMBA_SQUASH = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....KKKKKK.....',
  '...KKJJJJJJKK...',
  '..KJWWJJWWJJJK..',
  '.KJWKJJWKJJJJK..',
  'KJJWWJJWWJJJJJK.',
  'KjJJJJJJJJJJJjK.',
  '.KjjjjjjjjjjjjK.',
  '..KKKKKKKKKKKK..',
];

// ----------------------------------------------------------------------------
// SNAIL (16x16) — original purple-shelled foe: two-frame crawl + kickable shell.
// (Exported as koopaFrames/koopaShell to keep the engine's entity names.)
// ----------------------------------------------------------------------------
const KOOPA_A = [
  '................',
  '......KKKKK.....',
  '....KKQQQQQKK...',
  '...KQQYYYYYQQK..',
  '..KQQYqqqqqYQK..',
  '..KQYqqQQQqqYK..',
  '..KQYqQQQQQqYK..',
  '..KQYqqQQQqqYK..',
  '.KKQQYqqqqqYQK..',
  'KGGKQQYYYYYQQK..',
  'KGWGKKQQQQQKK...',
  'KGWGGGGGGK......',
  '.KGGGGGGGGGK....',
  '..KGGKKKKGGGK...',
  '..KKK....KKK....',
  '................',
];
const KOOPA_B = [
  '................',
  '......KKKKK.....',
  '....KKQQQQQKK...',
  '...KQQYYYYYQQK..',
  '..KQQYqqqqqYQK..',
  '..KQYqqQQQqqYK..',
  '..KQYqQQQQQqYK..',
  '..KQYqqQQQqqYK..',
  '.KKQQYqqqqqYQK..',
  'KGGKQQYYYYYQQK..',
  'KGWGKKQQQQQKK...',
  'KGWGGGGGGGK.....',
  '.KGGGGGGGGGK....',
  '...KGGGKKGGK....',
  '...KKK...KKK....',
  '................',
];
const KOOPA_SHELL = [
  '................',
  '................',
  '......KKKKK.....',
  '....KKQQQQQKK...',
  '...KQQYYYYYQQK..',
  '..KQYqqQQQqqYQK.',
  '.KQYqQQQQQQQqYK.',
  '.KQYqQQQQQQQqYK.',
  '.KQYqqQQQQQqqYK.',
  '..KQQYqqqqqYQK..',
  '...KQQYYYYYQQK..',
  '....KKQQQQQKK...',
  '......KKKKK.....',
  '................',
  '................',
  '................',
];

// ----------------------------------------------------------------------------
// COIN — 4 spin frames (wide -> thin -> wide). Each 12x16, scaled to TILE.
// ----------------------------------------------------------------------------
const COIN0 = [
  '....KKKKKK..',
  '..KKYYYYYYKK',
  '.KYYYWYYYYYK',
  'KYYYWWyYYYYK',
  'KYYYWyyYyYYK',
  'KYYYWyyYyYYK',
  'KYYYyyyYyYYK',
  'KYYYyyyyyYYK',
  'KYYYyyyyyYYK',
  'KYYYyyyYyYYK',
  'KYYYyyyYyYYK',
  'KYYYWyyYyYYK',
  'KYYYWWyYYYYK',
  '.KYYYWYYYYYK',
  '..KKYYYYYYKK',
  '....KKKKKK..',
];
const COIN1 = [
  '.....KKKK...',
  '....KYYYYK..',
  '...KYWyYYK..',
  '...KYWyYYK..',
  '...KYWyyYK..',
  '...KYyyyYK..',
  '...KYyyyYK..',
  '...KYyyyYK..',
  '...KYyyyYK..',
  '...KYyyyYK..',
  '...KYyyyYK..',
  '...KYWyyYK..',
  '...KYWyYYK..',
  '...KYWyYYK..',
  '....KYYYK...',
  '.....KKKK...',
];
const COIN2 = [
  '......KK....',
  '.....KYYK...',
  '.....KWYK...',
  '.....KWyK...',
  '.....KWyK...',
  '.....KyyK...',
  '.....KyyK...',
  '.....KyyK...',
  '.....KyyK...',
  '.....KyyK...',
  '.....KyyK...',
  '.....KWyK...',
  '.....KWyK...',
  '.....KWYK...',
  '.....KYYK...',
  '......KK....',
];
const COIN3 = COIN1.map(r => r.split('').reverse().join(''));

// ----------------------------------------------------------------------------
// QUESTION / UPGRADE BLOCKS — 3 shimmer frames (glyph brightness varies).
// Authored 16x16 so they fill a tile crisply.
// ----------------------------------------------------------------------------
// A beveled orange block (16x16) with a 6-row, 10-col glyph layer in the middle.
// `glyph` rows are 10 chars; framed by 'oOO' (3) + glyph (10) + 'OO' (3) = 16.
const QB_FRAME = (glyph, hi) => ([
  'oooooooooooooooo',
  'oOOOOOOOOOOOOOOo',
  'oO'+hi+'OOOOOOOOOO'+hi+'Oo',
  'oOO'+glyph[0]+'OOo',
  'oOO'+glyph[1]+'OOo',
  'oOO'+glyph[2]+'OOo',
  'oOO'+glyph[3]+'OOo',
  'oOO'+glyph[4]+'OOo',
  'oOO'+glyph[5]+'OOo',
  'oOOOOOOOOOOOOOOo',
  'oOOO'+hi+'OOOOOO'+hi+'OOOo',
  'oOOOOOOOOOOOOOOo',
  'oOOOOOOOOOOOOOOo',
  'oOOoOOOOOOOOoOOo',
  'oOoooooooooooOOo',
  'oooooooooooooooo',
]);
// Readable '?' glyph — 6 rows x 10 cols. `c` is the glyph brightness char.
const QMARK = (c) => [
  '..'+c+c+c+c+'....',
  '.'+c+c+'..'+c+c+'...',
  '.....'+c+c+'...',
  '....'+c+c+'....',
  '..........',
  '....'+c+c+'....',
];
function buildQuestion(c, hi) { return QB_FRAME(QMARK(c), hi); }
// Upgrade block uses a small diamond glyph — 6 rows x 10 cols.
const UMARK = (c) => [
  '....'+c+c+'....',
  '...'+c+c+c+c+'...',
  '..'+c+c+c+c+c+c+'..',
  '...'+c+c+c+c+'...',
  '....'+c+c+'....',
  '..........',
];
function buildUpgrade(c, hi) { return QB_FRAME(UMARK(c), hi); }

// ----------------------------------------------------------------------------
// STATIC TILES (16x16) — ground, brick, used block, pipes.
// ----------------------------------------------------------------------------
const GROUND = [
  'BBBBBBBBBBBBBBBB',
  'BHHHHHHHHHHHHHHb',
  'BBBBBBBBBBBBBBBb',
  'BbbBbbbBbbbBbbBb',
  'BbbBbbbBbbbBbbBb',
  'BbBBBBBBBBBBBbBb',
  'BbBbbbBbbbbBbbBb',
  'BbBbbbBbbbbBbbBb',
  'BBBBBBBBBBBBBBBb',
  'BbbbBbbbBbbBbbBb',
  'BbbbBbbbBbbBbbBb',
  'BbBBBBBBBBBBBbBb',
  'BbBbbbbBbbbBbbBb',
  'BbBbbbbBbbbBbbBb',
  'BbBbbbbBbbbBbbBb',
  'BBBBBBBBBBBBBBBb',
];
const BRICK = [
  'KKKKKKKKKKKKKKKK',
  'KRRRRRRRRRRRRRrK',
  'KRRRRRRRRRRRRRrK',
  'KRRRRRRKRRRRRRrK',
  'KrrrrrrKrrrrrrrK',
  'KKKKKKKKKKKKKKKK',
  'KRRRKRRRRRRKRRRK',
  'KRRRKRRRRRRKRRRK',
  'KRRRKRRRRRRKRRRK',
  'KrrrKrrrrrrKrrrK',
  'KKKKKKKKKKKKKKKK',
  'KRRRRRRKRRRRRRrK',
  'KRRRRRRKRRRRRRrK',
  'KRRRRRRKRRRRRRrK',
  'KrrrrrrKrrrrrrrK',
  'KKKKKKKKKKKKKKKK',
];
const USED = [
  'oooooooooooooooo',
  'oBBBBBBBBBBBBBBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBbbbbbbbbbbbbBo',
  'oBBBBBBBBBBBBBBo',
  'oooooooooooooooo',
];
const PIPE_TOP = [
  'KGGGGGGGGGGGGGGK',
  'KGHHHGGGGGGGGggK',
  'KGHHHGGGGGGGGggK',
  'KGGGGGGGGGGGGGgK',
  'KKKKKKKKKKKKKKKK',
  '.KGHHGGGGGGGgK..',
  '.KGHHGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
];
const PIPE_BODY = [
  '.KGHHGGGGGGGgK..',
  '.KGHHGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
  '.KGGGGGGGGGGgK..',
];

// ----------------------------------------------------------------------------
// PICKUPS — mushroom (16x16), flower (16x16), fireball (8x8).
// ----------------------------------------------------------------------------
const MUSHROOM = [
  '....KKKKKK......',
  '..KKRRRRRRKK....',
  '.KRRWWRRWWRRK...',
  'KRRWWWRRWWWRRK..',
  'KRRWWRRRRWWRRK..',
  'KRRRRRRRRRRRRK..',
  'KRRRRRRRRRRRRK..',
  '.KKKSSSSSSKKK...',
  '..KSSSKSSSSK....',
  '..KSSKKKSSSK....',
  '..KSSKKKSSSK....',
  '..KSSSSSSSSK....',
  '..KSsSSSSsSK....',
  '...KKSSSSKK.....',
  '.....KKKK.......',
  '................',
];
const FLOWER = [
  '......KK........',
  '....KKOOKK......',
  '...KOYYYYOK.....',
  '..KOYYWWYYOK....',
  '..KOYWWWWYOK....',
  '..KOYYWWYYOK....',
  '...KOYYYYOK.....',
  '....KKOOKK......',
  '......CK........',
  '.....KCK........',
  '.....KCK........',
  '....KCCKGK......',
  '..GKKCCKKG......',
  '.KGGKCCKGGK.....',
  '..KGGKCKGGK.....',
  '....KKCKK.......',
];
const FIREBALL = [
  '.KKKK...',
  'KOYYOK..',
  'KYWWYOK.',
  'KYWWYYK.',
  'KOYWYYK.',
  'KOYYYOK.',
  '.KOOOK..',
  '..KKK...',
];

// Recolour maps applied at build time so the authored grids stay readable.
// HERO: red cap/shirt -> teal, blue overalls -> orange (an original character).
const HERO_REMAP = { R:'P', r:'p', N:'V', n:'v' };
// MUSHROOM power-up: red cap -> purple (not the red/white Super Mushroom).
const MUSH_REMAP = { R:'Q', r:'q' };
// PIPES: green warp pipe -> steel-blue plumbing pipe.
const PIPE_REMAP = { G:'I', g:'i', H:'L' };

export function buildSprites(scale = 1) {
  const hgrid = (rows) => grid(remap(rows, HERO_REMAP), scale);
  return {
    // hero pose tables, keyed by power then pose
    hero: {
      small: { stand: hgrid(SMALL_STAND), walkA: hgrid(SMALL_WALKA), walkB: hgrid(SMALL_WALKB), jump: hgrid(SMALL_JUMP) },
      big:   { stand: hgrid(BIG_STAND),   walkA: hgrid(BIG_WALKA),   walkB: hgrid(BIG_WALKB),   jump: hgrid(BIG_JUMP) },
      fire:  { stand: hgrid(FIRE_STAND),  walkA: hgrid(FIRE_WALKA),  walkB: hgrid(FIRE_WALKB),  jump: hgrid(FIRE_JUMP) },
    },
    heroSize: {
      small: { w: 16, h: 16 },
      big:   { w: 16, h: 24 },
      fire:  { w: 16, h: 24 },
    },
    goombaFrames: [ grid(GOOMBA_A, scale), grid(GOOMBA_B, scale) ],
    goombaSquash: grid(GOOMBA_SQUASH, scale),
    goombaSize: { w: 16, h: 16 },
    koopaFrames: [ grid(KOOPA_A, scale), grid(KOOPA_B, scale) ],
    koopaShell: grid(KOOPA_SHELL, scale),
    koopaSize: { w: 16, h: 16 },
    coinFrames: [ grid(COIN0, scale), grid(COIN1, scale), grid(COIN2, scale), grid(COIN3, scale) ],
    // question/upgrade shimmer frames (3 each), brightest in the middle
    coinBlockFrames: [ grid(buildQuestion('Y','O'), scale), grid(buildQuestion('W','Y'), scale), grid(buildQuestion('Y','O'), scale) ],
    upgradeBlockFrames: [ grid(buildUpgrade('C','c'), scale), grid(buildUpgrade('W','C'), scale), grid(buildUpgrade('C','c'), scale) ],
    usedBlock: grid(USED, scale),
    brick: grid(BRICK, scale),
    ground: grid(GROUND, scale),
    pipe: grid(remap(PIPE_TOP, PIPE_REMAP), scale),
    pipeDeco: grid(remap(PIPE_BODY, PIPE_REMAP), scale),
    mushroom: grid(remap(MUSHROOM, MUSH_REMAP), scale),
    flower: grid(FLOWER, scale),
    fireball: grid(FIREBALL, scale),
  };
}

// NOTE: hero/goomba sprites are authored at a richer internal resolution than
// their physics hitbox; the renderer centres them horizontally and bottom-aligns
// them so the art can look taller/detailed without changing physics. Tiles are
// authored 16×16 and drawn at exactly TILE×TILE. All animation frame selection
// happens in the renderer as a pure function of state + world.animClock.
