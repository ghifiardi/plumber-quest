import { test, assert, assertEqual } from './harness.js';
import { createGameState, STATES } from '../src/game/game-state.js';

function stubWorldFactory() {
  return () => ({
    update() { this.updated = (this.updated||0)+1; },
    updated: 0, timeUp: false, fell: false, flagReached: false, playerDied: false,
    timeRemaining: 0, scriptDone: true,
    // facade surface — getStatus derives from the mutable fields above so existing
    // tests that set world.playerDied / world.flagReached directly still drive transitions
    getStatus() { return { timeUp: this.timeUp, fell: this.fell, playerDied: this.playerDied, levelClear: this.flagReached }; },
    beginScripted() {}, updateScripted() {},
    getBounds() { return { left: 0, top: 0, right: 0, bottom: 240 }; },
    getCameraTarget() { return { x: 0, y: 0, w: 16, h: 16, facing: 1 }; },
    getRenderView() { return {}; },
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

test('difficulty selection sets difficulty and starting lives', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.toDifficultySelect();
  assertEqual(gs.state, STATES.difficultySelect);
  gs.moveSelection(-1);                 // normal(1) -> easy(0)
  gs.startSelected();
  assertEqual(gs.difficulty, 'easy');
  assertEqual(gs.session.lives, 5, 'easy starts with 5 lives');
  assertEqual(gs.state, STATES.intro);
});

test('moveSelection wraps and only works in the select state', () => {
  const gs = createGameState({ worldFactory: stubWorldFactory(), levelCount: 3 });
  gs.toDifficultySelect();
  gs.moveSelection(1);                   // normal(1) -> hard(2)
  assertEqual(gs.selIndex, 2);
  gs.moveSelection(1);                   // hard(2) -> wrap to easy(0)
  assertEqual(gs.selIndex, 0);
  gs.startSelected();                    // -> intro
  gs.moveSelection(1);                   // no-op outside the select state
  assert(gs.state !== STATES.difficultySelect);
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

test('game-state drives dying off facade getStatus().playerDied', () => {
  let dead = false;
  const sim = {
    update() { dead = true; },
    getStatus: () => ({ timeUp:false, fell:false, playerDied: dead, levelClear:false }),
    beginScripted() {}, updateScripted() {},
    drainEvents: () => [], getBounds: () => ({left:0,top:0,right:99,bottom:240}),
    getCameraTarget: () => ({x:0,y:0,w:16,h:16,facing:1}), getRenderView: () => ({}),
    get timeRemaining() { return 0; }, set timeRemaining(_v) {},
  };
  const gs = createGameState({ worldFactory: () => sim, levelCount: 1 });
  gs.startGame();                       // -> intro
  gs.state = STATES.playing;            // jump straight to playing for the test
  gs.update(1/60, {});                  // update sets dead=true; status -> playerDied -> dying
  gs.update(1/60, {});                  // dying script advances
  assertEqual(gs.state, STATES.dying);
});

test('in-place respawn returns straight to playing without losing the world', () => {
  let respawned = false;
  const sim = {
    update() {}, getStatus: () => ({ timeUp:false, fell:false, playerDied:false, levelClear:false }),
    beginScripted() {}, updateScripted() {},
    canRespawnInPlace: () => true, respawn() { respawned = true; },
    drainEvents: () => [], getBounds: () => ({left:0,top:0,right:99,bottom:240}),
    getCameraTarget: () => ({x:0,y:0,w:16,h:16,facing:1}), getRenderView: () => ({}),
    get timeRemaining() { return 0; }, set timeRemaining(_v) {},
  };
  const gs = createGameState({ worldFactory: () => sim, levelCount: 1 });
  gs.startGame(); gs.state = STATES.dying; gs.session.lives = 3;
  gs.finishScriptedForTest();        // dying script completes
  assert(respawned, 'sim.respawn() called');
  assertEqual(gs.state, STATES.playing, 'straight to playing, no intro card');
  assertEqual(gs.session.lives, 2, 'a life was spent');
});
