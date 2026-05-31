const SFX = {
  jump:   { f: 660, type:'square', dur:0.12, slide:180 },
  coin:   { f: 988, type:'square', dur:0.10, slide:320 },
  stomp:  { f: 180, type:'square', dur:0.10, slide:-60 },
  powerup:{ f: 520, type:'square', dur:0.25, slide:400 },
  bump:   { f: 140, type:'square', dur:0.06, slide:0 },
  fireball:{ f: 740, type:'square', dur:0.08, slide:-200 },
  death:  { f: 400, type:'square', dur:0.5,  slide:-300 },
  flag:   { f: 523, type:'square', dur:0.4,  slide:500 },
};
const EVENT_SFX = {
  'jump':'jump','coin-collected':'coin','enemy-stomped':'stomp','powerup-collected':'powerup',
  'powerup-spawned':'powerup','block-hit':'bump','brick-broken':'bump','fireball-fired':'fireball',
  'player-died':'death','player-hit':'stomp','flag-reached':'flag',
};

export function createAudio({ ctxFactory = () => new (window.AudioContext||window.webkitAudioContext)() } = {}) {
  let ctx = null, muted = false, musicNodes = [], musicTimer = null;

  function ensure() { if (!ctx) ctx = ctxFactory(); return ctx; }
  function unlock() { const c = ensure(); if (c.state === 'suspended') c.resume(); }

  function play(name) {
    if (muted) return;
    const spec = SFX[name]; if (!spec) return;
    const c = ensure(); if (c.state === 'suspended') c.resume();
    const o = c.createOscillator(), g = c.createGain();
    o.type = spec.type; o.frequency.setValueAtTime(spec.f, c.currentTime);
    if (spec.slide) o.frequency.linearRampToValueAtTime(spec.f + spec.slide, c.currentTime + spec.dur);
    g.gain.setValueAtTime(0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + spec.dur);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + spec.dur);
  }

  function playEvent(type) { const n = EVENT_SFX[type]; if (n) play(n); }

  const MELODY = [523,659,784,659,523,587,659,494]; // simple loop
  function startMusic() {
    if (muted) return;
    const c = ensure(); if (c.state==='suspended') c.resume();
    stopMusic();
    let i = 0;
    const note = () => {
      const o = c.createOscillator(), g = c.createGain();
      o.type='square'; o.frequency.setValueAtTime(MELODY[i%MELODY.length], c.currentTime);
      g.gain.setValueAtTime(0.06, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime+0.22);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+0.24);
      musicNodes.push(o); i++;
    };
    note();
    musicTimer = setInterval(note, 260);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    for (const n of musicNodes) { try { n.stop(); } catch {} }
    musicNodes = [];
  }

  function setMuted(v) { muted = v; if (v) stopMusic(); }
  function isMuted() { return muted; }

  return { unlock, play, playEvent, startMusic, stopMusic, setMuted, isMuted };
}
