// src/editor/playtest.js
// Playtest the editor model in the REAL ECS sim. Builds the sim via definitionToWorld()
// directly (never makeSim -> never src/game/*). runScript is the headless, testable core;
// startPlaytest (next task) is the live disposable RAF loop reusing it.
import { definitionToWorld } from '../ecs/loader.js';
import { editorModelToDefinition } from './serialize.js';
import { FIXED_DT } from '../engine/constants.js';
import { createRenderer } from '../render/renderer.js';
import { createInput } from '../engine/input.js';
import { createCamera } from '../engine/camera.js';

// Build a fresh sim from a SNAPSHOT of the model (editing state never leaks in).
export function simFromModel(model) { return definitionToWorld(editorModelToDefinition(model)); }

// Step a scripted intent list; return the first terminal outcome (lives-free).
export function runScript(model, script) {
  const sim = simFromModel(model);
  for (const intent of script) {
    sim.update(FIXED_DT, intent);
    const s = sim.getStatus();
    if (s.levelClear) return { outcome: 'levelClear', sim };
    if (s.playerDied || s.fell) {
      if (sim.canRespawnInPlace()) sim.respawn();           // lives-free: respawn and continue
      else return { outcome: 'died', sim };
    }
  }
  return { outcome: 'running', sim };
}

// Live, disposable playtest on the 256x240 game canvas. Returns nothing; calls onStop
// when the user exits. Fixed-step accumulator (matches real play); fully tears down.
export function startPlaytest(model, onStop) {
  const snapshot = editorModelToDefinition(model);     // frozen at Play time
  let sim = definitionToWorld(snapshot);

  const overlay = document.createElement('div'); overlay.id = 'pt-overlay';
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 240; canvas.id = 'pt-canvas';
  const banner = document.createElement('div'); banner.id = 'pt-banner';
  const stopBtn = document.createElement('button'); stopBtn.textContent = 'Stop (Esc)';
  overlay.append(canvas, banner, stopBtn); document.body.append(overlay);

  const renderer = createRenderer(canvas);
  const input = createInput(); input.attach(window);
  const cam = createCamera({ viewW: 256, viewH: 240, bounds: sim.getBounds() });

  let raf = 0, acc = 0, prev = null, alive = true;
  function frame(now) {
    if (!alive) return;
    if (prev == null) prev = now;
    acc += Math.min(0.25, (now - prev) / 1000); prev = now;
    while (acc >= FIXED_DT) {
      input.beginFrame();
      sim.update(FIXED_DT, input.consumeIntent());
      const s = sim.getStatus();
      if (s.levelClear) banner.textContent = 'Level complete!';
      else if (s.playerDied || s.fell) {
        if (sim.canRespawnInPlace()) { sim.respawn(); banner.textContent = 'Respawned'; }
        else { sim = definitionToWorld(snapshot); banner.textContent = 'Restarted'; }
      }
      cam.bounds = sim.getBounds();
      acc -= FIXED_DT;
    }
    renderer.draw(sim.getRenderView(), cam, 0, { score:0, coins:0, lives:0, levelIndex:0 }, 'playing');
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function stop() {
    alive = false; cancelAnimationFrame(raf);
    input.dispose();                       // detach listeners
    window.removeEventListener('keydown', onEsc);
    overlay.remove();                      // clears banner + canvas
    onStop && onStop();
  }
  function onEsc(e) { if (e.key === 'Escape') stop(); }
  window.addEventListener('keydown', onEsc);
  stopBtn.onclick = stop;
}
