# Plumber Quest

A small side-scrolling platformer (run, jump, stomp, coins, power-ups, flagpole)
built with vanilla HTML5 Canvas + ES modules. No build step, no dependencies.

**All art and audio are original**, generated procedurally in code.

## Run locally
```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Controls
- Move: ←/→ or A/D
- Jump: Space / ↑ / W (hold for higher jump)
- Run: Shift
- Fireball (with fire flower): J / Z
- Mute: button top-right

## Tests
Open http://localhost:8000/tests/ — runs the full suite and prints PASS/FAIL.

## Add a level
1. Create `src/levels/world-1-N.js` exporting an array of equal-length rows.
   Chars: `X` ground, `#` brick, `?` coin block, `U` upgrade block, `o` coin,
   `T` pipe, `|` pipe deco, `G` goomba, `P` player (exactly one),
   `F` finish (exactly one), `-`/space empty.
2. Import it in `src/main.js` and add to the `LEVELS` array.

## Credits
- Code & pixel art: original.
- Background music: original track made with [Suno](https://suno.com/) (`assets/theme.mp3`). The game falls back to a synthesized melody if the track can't load.

## License
MIT — see LICENSE. (The bundled music track is the project owner's own creation.)
