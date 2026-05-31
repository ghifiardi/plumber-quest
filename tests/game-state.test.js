import { test, assert, assertEqual } from './harness.js';
import { createGameState, STATES } from '../src/game/game-state.js';

function stubWorldFactory() {
  return () => ({
    update() { this.updated = (this.updated||0)+1; },
    updated: 0, timeUp: false, fell: false, flagReached: false, playerDied: false,
    scriptDone: true,
  });
}

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

test('startGame fully resets the session (score/coins/lives/level)', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.session.score = 5000; gs.session.coins = 12; gs.session.lives = 1; gs.session.levelIndex = 2;
  gs.startGame();
  assertEqual(gs.session.score, 0);
  assertEqual(gs.session.coins, 0);
  assertEqual(gs.session.lives, 3);
  assertEqual(gs.session.levelIndex, 0);
  assertEqual(gs.state, STATES.playing);
});

test('togglePause flips playing<->paused only', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.startGame();
  gs.togglePause(); assertEqual(gs.state, STATES.paused);
  gs.togglePause(); assertEqual(gs.state, STATES.playing);
});

test('world.update only runs during playing', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.startGame();                       // title -> playing, loads level 0
  assertEqual(gs.state, STATES.playing);
  gs.update(1/60, { });
  assert(gs.world.updated === 1, 'stepped while playing');
  gs.pause();
  gs.update(1/60, { });
  assertEqual(gs.world.updated, 1, 'no step while paused');
});

test('player death decrements lives and reloads, or game-over', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.startGame();
  gs.session.lives = 2;
  gs.world.playerDied = true;
  gs.update(1/60, {});                  // detects death -> dying
  assertEqual(gs.state, STATES.dying);
  gs.finishScriptedForTest();           // dying script ends
  assertEqual(gs.session.lives, 1, 'life lost');
  assertEqual(gs.state, STATES.playing, 'reloaded level');
  gs.session.lives = 1; gs.world.playerDied = true;
  gs.update(1/60, {}); gs.finishScriptedForTest();
  assertEqual(gs.session.lives, 0);
  assertEqual(gs.state, STATES.gameOver);
});

test('flag reached -> level-clear -> next level, win after last', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 2 });
  gs.startGame();
  gs.world.flagReached = true; gs.update(1/60, {});
  assertEqual(gs.state, STATES.levelClear);
  gs.finishScriptedForTest();
  assertEqual(gs.state, STATES.playing);
  assertEqual(gs.session.levelIndex, 1);
  gs.world.flagReached = true; gs.update(1/60, {}); gs.finishScriptedForTest();
  assertEqual(gs.state, STATES.win, 'win after last level');
});
