import { test, assert, assertEqual } from './harness.js';
import { createGameState, STATES } from '../src/game/game-state.js';

function stubWorldFactory() {
  return () => ({
    update() { this.updated = (this.updated||0)+1; },
    updated: 0, timeUp: false, fell: false, flagReached: false, playerDied: false,
    scriptDone: true,
  });
}
// Advance through the intro card into actual play.
function toPlay(gs) { let n = 0; while (gs.state === STATES.intro && n++ < 1000) gs.update(1/60, {}); }

test('title resets session values and starts at title', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.session.score = 999; gs.session.lives = 1; gs.session.levelIndex = 2;
  gs.toTitle();
  assertEqual(gs.state, STATES.title);
  assertEqual(gs.session.score, 0);
  assertEqual(gs.session.coins, 0);
  assertEqual(gs.session.lives, 3);
  assertEqual(gs.session.levelIndex, 0);
});

test('startGame fully resets the session and shows the intro card first', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.session.score = 5000; gs.session.coins = 12; gs.session.lives = 1; gs.session.levelIndex = 2;
  gs.startGame();
  assertEqual(gs.session.score, 0);
  assertEqual(gs.session.coins, 0);
  assertEqual(gs.session.lives, 3);
  assertEqual(gs.session.levelIndex, 0);
  assertEqual(gs.state, STATES.intro);     // intro card precedes play
});

test('intro card precedes playing and does not simulate the world', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3, introTime: 0.5 });
  gs.startGame();
  assertEqual(gs.state, STATES.intro);
  gs.update(1/60, {});                     // 1/60s < 0.5s -> still intro
  assertEqual(gs.state, STATES.intro);
  assertEqual(gs.world.updated || 0, 0, 'world not simulated during intro');
  for (let i = 0; i < 60 && gs.state === STATES.intro; i++) gs.update(1/60, {});
  assertEqual(gs.state, STATES.playing, 'enters play after introTime elapses');
});

test('togglePause flips playing<->paused only', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3, introTime: 0 });
  gs.startGame(); toPlay(gs);
  assertEqual(gs.state, STATES.playing);
  gs.togglePause(); assertEqual(gs.state, STATES.paused);
  gs.togglePause(); assertEqual(gs.state, STATES.playing);
});

test('world.update only runs during playing', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3, introTime: 0 });
  gs.startGame(); toPlay(gs);            // through the (zero-length) intro into play
  assertEqual(gs.state, STATES.playing);
  assertEqual(gs.world.updated, 0, 'intro did not step the world');
  gs.update(1/60, { });
  assertEqual(gs.world.updated, 1, 'stepped while playing');
  gs.pause();
  gs.update(1/60, { });
  assertEqual(gs.world.updated, 1, 'no step while paused');
});

test('player death decrements lives and reloads (via intro), or game-over', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3, introTime: 0 });
  gs.startGame(); toPlay(gs);
  gs.session.lives = 2;
  gs.world.playerDied = true;
  gs.update(1/60, {});                  // detects death -> dying
  assertEqual(gs.state, STATES.dying);
  gs.finishScriptedForTest();           // dying script ends
  assertEqual(gs.session.lives, 1, 'life lost');
  assertEqual(gs.state, STATES.intro, 'reloads via intro card');
  toPlay(gs);                           // through intro into play on the fresh world
  gs.session.lives = 1; gs.world.playerDied = true;
  gs.update(1/60, {}); gs.finishScriptedForTest();
  assertEqual(gs.session.lives, 0);
  assertEqual(gs.state, STATES.gameOver);
});

test('flag reached -> level-clear -> next level (via intro), win after last', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 2, introTime: 0 });
  gs.startGame(); toPlay(gs);
  gs.world.flagReached = true; gs.update(1/60, {});
  assertEqual(gs.state, STATES.levelClear);
  gs.finishScriptedForTest();
  assertEqual(gs.session.levelIndex, 1);
  assertEqual(gs.state, STATES.intro, 'next level shows intro card');
  toPlay(gs);                           // into play on level 2
  gs.world.flagReached = true; gs.update(1/60, {}); gs.finishScriptedForTest();
  assertEqual(gs.state, STATES.win, 'win after last level');
});
