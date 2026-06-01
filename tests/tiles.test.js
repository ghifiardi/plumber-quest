import { test, assert, assertEqual } from './harness.js';
import { bumpTile } from '../src/game/tiles.js';

const KIND = { '#':'brick', '?':'coin-block', 'U':'upgrade-block', 'x':'used-block', '-':'empty' };
function fakeWorld(rows, power) {
  return {
    tiles: rows.map(r => r.split('').map(ch => ({ tile: KIND[ch] || 'empty' }))),
    player: { power }, coins: 0, score: 0, spawned: [], events: [],
    addCoin(){ this.coins++; this.score += 200; },
    addScore(n){ this.score += n; },
    spawnPickup(kind, x, y){ this.spawned.push({ kind, x, y }); },
    emit(ev){ this.events.push(ev); },
    popup(){}, addShake(){},   // cosmetic juice hooks (no-ops in this unit test)
  };
}

test('coin-block: becomes used-block, +1 coin, emits coin-collected', () => {
  const w = fakeWorld(['?'], 'small'); bumpTile(w, 0, 0);
  assertEqual(w.tiles[0][0].tile, 'used-block');
  assertEqual(w.coins, 1);
  assert(w.events.some(e=>e.type==='coin-collected'));
});

test('upgrade-block while small spawns a mushroom; while big/fire spawns a flower', () => {
  const small = fakeWorld(['U'], 'small'); bumpTile(small, 0, 0);
  assertEqual(small.tiles[0][0].tile, 'used-block');
  assertEqual(small.spawned[0].kind, 'mushroom');
  const big = fakeWorld(['U'], 'big');  bumpTile(big, 0, 0);  assertEqual(big.spawned[0].kind, 'flower');
  const fire = fakeWorld(['U'], 'fire'); bumpTile(fire, 0, 0); assertEqual(fire.spawned[0].kind, 'flower');
});

test('used-block bump: inert, only emits block-hit', () => {
  const w = fakeWorld(['x'], 'big'); bumpTile(w, 0, 0);
  assertEqual(w.tiles[0][0].tile, 'used-block');
  assertEqual(w.spawned.length, 0);
  assert(w.events.some(e=>e.type==='block-hit'));
});

test('brick: small bumps without breaking; big & fire break it for score', () => {
  const small = fakeWorld(['#'], 'small'); bumpTile(small, 0, 0);
  assertEqual(small.tiles[0][0].tile, 'brick');
  assert(small.events.some(e=>e.type==='block-hit'));
  for (const power of ['big', 'fire']) {
    const w = fakeWorld(['#'], power); bumpTile(w, 0, 0);
    assertEqual(w.tiles[0][0].tile, 'empty', `${power} breaks the brick`);
    assert(w.score >= 50, `${power} brick break scored`);
    assert(w.events.some(e=>e.type==='brick-broken'));
  }
});
