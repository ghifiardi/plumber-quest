export const STATES = {
  title: 'title', intro: 'intro', playing: 'playing', paused: 'paused',
  dying: 'dying', levelClear: 'level-clear', win: 'win', gameOver: 'game-over',
};

export function createGameState({ worldFactory, levelCount, scriptTimes = { dying: 1.0, levelClear: 1.5 }, introTime = 1.6 }) {
  const gs = {
    state: STATES.title,
    session: { score: 0, coins: 0, lives: 3, levelIndex: 0 },
    world: null,
    _scriptT: 0,
    introT: 0, introTotal: introTime,   // exposed so the renderer can show the WORLD card
  };

  // worldFactory receives (levelIndex, session) so the world can mutate session counters.
  const loadLevel = () => { gs.world = worldFactory(gs.session.levelIndex, gs.session); };
  const resetSession = () => { gs.session.score = 0; gs.session.coins = 0; gs.session.lives = 3; gs.session.levelIndex = 0; };
  // Show the "WORLD 1-x" card, then enter play. Used at start, after death, and between levels.
  const enterIntro = () => { gs.state = STATES.intro; gs.introT = 0; };

  gs.toTitle = () => { resetSession(); gs.state = STATES.title; gs.world = null; };
  // Start a brand-new run: full session reset, then load level 0 + intro card.
  gs.newSession = () => { resetSession(); loadLevel(); enterIntro(); };
  gs.startGame = gs.newSession;
  gs.pause = () => { if (gs.state === STATES.playing) gs.state = STATES.paused; };
  gs.resume = () => { if (gs.state === STATES.paused) gs.state = STATES.playing; };
  gs.togglePause = () => { if (gs.state === STATES.playing) gs.pause(); else if (gs.state === STATES.paused) gs.resume(); };

  const enterScripted = (state) => {
    gs.state = state; gs._scriptT = 0;
    if (state === STATES.dying) {
      gs.world.beginDeathAnim && gs.world.beginDeathAnim();
    } else if (state === STATES.levelClear) {
      gs.world.beginClearAnim && gs.world.beginClearAnim();
      gs._clearStart = gs.world.timeRemaining;   // whole timer to convert
      gs._clearAwarded = 0;                       // cumulative score awarded (bias-free)
    }
  };

  function _completeScripted() {
    if (gs.state === STATES.dying) {
      gs.session.lives -= 1;
      if (gs.session.lives > 0) { loadLevel(); enterIntro(); }
      else gs.state = STATES.gameOver;
    } else if (gs.state === STATES.levelClear) {
      gs.session.levelIndex += 1;
      if (gs.session.levelIndex >= levelCount) gs.state = STATES.win;
      else { loadLevel(); enterIntro(); }
    }
  }
  gs.finishScriptedForTest = _completeScripted;   // keep Task 5 tests valid

  gs.update = (dt, intent) => {
    switch (gs.state) {
      case STATES.intro: {
        gs.introT += dt;
        if (gs.introT >= gs.introTotal) gs.state = STATES.playing;   // card shown, begin play
        break;
      }
      case STATES.playing: {
        gs.world.update(dt, intent);
        if (gs.world.playerDied || gs.world.fell || gs.world.timeUp) enterScripted(STATES.dying);
        else if (gs.world.flagReached) enterScripted(STATES.levelClear);
        break;
      }
      case STATES.dying: {
        gs._scriptT += dt;
        gs.world.updateScripted && gs.world.updateScripted(dt);
        if (gs._scriptT >= scriptTimes.dying) _completeScripted();
        break;
      }
      case STATES.levelClear: {
        gs._scriptT += dt;
        gs.world.updateScripted && gs.world.updateScripted(dt);
        // Convert the ENTIRE remaining timer into score over scriptTimes.levelClear seconds,
        // independent of the timer's magnitude. Award the delta to a rounded cumulative target
        // so there is no per-frame rounding bias and the final total is exactly round(start*10).
        const frac = Math.min(1, gs._scriptT / scriptTimes.levelClear);
        const targetScore = Math.round(gs._clearStart * 10 * frac);
        gs.session.score += (targetScore - gs._clearAwarded);
        gs._clearAwarded = targetScore;
        gs.world.timeRemaining = gs._clearStart * (1 - frac);
        if (frac >= 1) _completeScripted();
        break;
      }
      default: break; // title/paused/win/game-over: no simulation
    }
  };

  return gs;
}
