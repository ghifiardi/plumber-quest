export const STATES = {
  title: 'title', playing: 'playing', paused: 'paused',
  dying: 'dying', levelClear: 'level-clear', win: 'win', gameOver: 'game-over',
};

export function createGameState({ worldFactory, levelCount }) {
  const gs = {
    state: STATES.title,
    session: { score: 0, coins: 0, lives: 3, levelIndex: 0 },
    world: null,
    _scriptT: 0,
  };

  // worldFactory receives (levelIndex, session) so the world can mutate session counters.
  const loadLevel = () => { gs.world = worldFactory(gs.session.levelIndex, gs.session); };
  const resetSession = () => { gs.session.score = 0; gs.session.coins = 0; gs.session.lives = 3; gs.session.levelIndex = 0; };

  gs.toTitle = () => { resetSession(); gs.state = STATES.title; gs.world = null; };
  // Start a brand-new run: full session reset, then load level 0. Used from title/game-over/win.
  gs.newSession = () => { resetSession(); loadLevel(); gs.state = STATES.playing; };
  gs.startGame = gs.newSession;
  gs.pause = () => { if (gs.state === STATES.playing) gs.state = STATES.paused; };
  gs.resume = () => { if (gs.state === STATES.paused) gs.state = STATES.playing; };
  gs.togglePause = () => { if (gs.state === STATES.playing) gs.pause(); else if (gs.state === STATES.paused) gs.resume(); };

  // scripted-state helpers (real timing in Task 13; tests use finishScriptedForTest)
  const enterScripted = (state) => { gs.state = state; gs._scriptT = 0; };
  gs.finishScriptedForTest = () => { _completeScripted(); };

  function _completeScripted() {
    if (gs.state === STATES.dying) {
      gs.session.lives -= 1;
      if (gs.session.lives > 0) { loadLevel(); gs.state = STATES.playing; }
      else gs.state = STATES.gameOver;
    } else if (gs.state === STATES.levelClear) {
      gs.session.levelIndex += 1;
      if (gs.session.levelIndex >= levelCount) gs.state = STATES.win;
      else { loadLevel(); gs.state = STATES.playing; }
    }
  }

  gs.update = (dt, intent) => {
    switch (gs.state) {
      case STATES.playing: {
        gs.world.update(dt, intent);
        if (gs.world.playerDied || gs.world.fell || gs.world.timeUp) enterScripted(STATES.dying);
        else if (gs.world.flagReached) enterScripted(STATES.levelClear);
        break;
      }
      case STATES.dying:
      case STATES.levelClear: {
        gs._scriptT += dt;
        gs.world && gs.world.updateScripted && gs.world.updateScripted(dt);
        // real duration gate added in Task 13; here scripts are completed explicitly
        break;
      }
      default: break; // title/paused/win/game-over: no simulation
    }
  };

  return gs;
}
