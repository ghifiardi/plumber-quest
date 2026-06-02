const SFX = {
  jump:   { f: 660, type:'square', dur:0.12, slide:180 },
  coin:   { f: 988, type:'square', dur:0.10, slide:320 },
  stomp:  { f: 180, type:'square', dur:0.10, slide:-60 },
  powerup:{ f: 520, type:'square', dur:0.25, slide:400 },
  bump:   { f: 140, type:'square', dur:0.06, slide:0 },
  fireball:{ f: 740, type:'square', dur:0.08, slide:-200 },
  death:  { f: 400, type:'square', dur:0.5,  slide:-300 },
  flag:   { f: 523, type:'square', dur:0.4,  slide:500 },
  firework:{ f: 1200, type:'square', dur:0.12, slide:700 },   // high rising pop
  oneup:  { f: 784, type:'square', dur:0.22, slide:520 },     // cheerful 1-up
};
const EVENT_SFX = {
  'jump':'jump','coin-collected':'coin','enemy-stomped':'stomp','powerup-collected':'powerup',
  'powerup-spawned':'powerup','block-hit':'bump','brick-broken':'bump','fireball-fired':'fireball',
  'player-died':'death','player-hit':'stomp','flag-reached':'flag',
  'firework':'firework','one-up':'oneup',
};

export function createAudio({
  ctxFactory = () => new (window.AudioContext||window.webkitAudioContext)(),
  musicUrl = null,                                   // optional looping background track (mp3)
  musicVolume = 0.4,
  audioFactory = (url) => new Audio(url),            // injectable for tests
} = {}) {
  let ctx = null, muted = false, musicNodes = [], musicTimer = null;

  // Optional real music track (e.g. a Suno song). Falls back to the synth melody
  // below if no URL is given or the file fails to load.
  let track = null, trackBroken = false;
  if (musicUrl) {
    try {
      track = audioFactory(musicUrl);
      track.loop = true;
      track.volume = musicVolume;
      track.preload = 'auto';
      track.addEventListener && track.addEventListener('error', () => { trackBroken = true; });
    } catch { track = null; }
  }

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

  // Short ascending victory fanfare for clearing a level.
  function fanfare() {
    if (muted) return;
    const c = ensure(); if (c.state === 'suspended') c.resume();
    const notes = [392, 523, 659, 784, 1047, 784, 1047];   // G C E G C5 G C5
    notes.forEach((f, i) => {
      const t0 = c.currentTime + i * 0.12;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.18, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.18);
    });
  }

  // --- synthesized fallback melody (used when no track / track failed) ---
  const MELODY = [523,659,784,659,523,587,659,494];
  function startSynth() {
    const c = ensure(); if (c.state==='suspended') c.resume();
    stopSynth();
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
  function stopSynth() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    for (const n of musicNodes) { try { n.stop(); } catch {} }
    musicNodes = [];
  }

  function startMusic() {
    if (muted) return;
    if (track && !trackBroken) {
      // play() must be called from a user gesture; startMusic is invoked on the
      // playing-state transition, which always follows the start/tap interaction.
      const p = track.play();
      if (p && p.catch) p.catch(() => { trackBroken = true; startSynth(); });
      return;
    }
    startSynth();
  }
  function stopMusic() {
    stopSynth();
    if (track) { try { track.pause(); } catch {} }
  }

  function setMuted(v) { muted = v; if (v) stopMusic(); }
  function isMuted() { return muted; }

  return { unlock, play, playEvent, fanfare, startMusic, stopMusic, setMuted, isMuted };
}
