import { test, assert, assertEqual } from './harness.js';
import { createGameState, STATES } from '../src/game/game-state.js';

function worldFactory(start = 5) {
  return (levelIndex, session) => ({
    levelIndex, timeRemaining: start, timeUp:false, fell:false, playerDied:false, flagReached:false,
    update(){}, updateScripted(){ /* frozen */ }, beginDeathAnim(){}, beginClearAnim(){},
  });
}

const NONE = { };
const CLEAR = { dying:0.5, levelClear:1.5 };

test('flag -> level-clear: drains timer into score, EXACT total, then advances', () => {
  const gs = createGameState({ worldFactory: worldFactory(5), levelCount: 2, scriptTimes: CLEAR });
  gs.startGame();
  const base = gs.session.score;
  gs.world.flagReached = true;
  gs.update(1/60, NONE);
  assertEqual(gs.state, STATES.levelClear);
  const clearedWorld = gs.world;   // capture: _completeScripted() swaps in a fresh world on advance
  for (let i=0;i<200 && gs.state===STATES.levelClear;i++) gs.update(1/60, NONE);
  assertEqual(gs.session.score, base + Math.round(5 * 10), 'exact timer→score total (5*10=50), no rounding drift');
  assertEqual(clearedWorld.timeRemaining, 0, 'the CLEARED level timer fully drained (new world is separate)');
  assertEqual(gs.session.levelIndex, 1, 'advanced to next level');
  assertEqual(gs.state, STATES.playing);
});

test('level-clear lasts ~its configured duration, NOT timer-rate', () => {
  // A 300s timer must still convert in ~1.5s (≈90 steps), not 3s+ — magnitude-independent.
  const gs = createGameState({ worldFactory: worldFactory(300), levelCount: 2, scriptTimes: CLEAR });
  gs.startGame(); gs.world.flagReached = true; gs.update(1/60, NONE);
  let steps = 0;
  while (gs.state === STATES.levelClear && steps < 600) { gs.update(1/60, NONE); steps++; }
  assert(steps >= 85 && steps <= 95, `clear finished in ~1.5s (${steps} steps), not at timer rate`);
  assertEqual(gs.session.score, Math.round(300 * 10), 'full timer converted exactly (3000)');
});

test('dying script runs its duration then reloads', () => {
  const gs = createGameState({ worldFactory: worldFactory(5), levelCount: 2, scriptTimes: CLEAR });
  gs.startGame(); gs.session.lives = 2;
  gs.world.playerDied = true; gs.update(1/60, NONE);
  assertEqual(gs.state, STATES.dying);
  for (let i=0;i<40 && gs.state===STATES.dying;i++) gs.update(1/60, NONE);
  assertEqual(gs.session.lives, 1);
  assertEqual(gs.state, STATES.playing);
});
