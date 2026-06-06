# Plumber Quest — Story, Character & Marketing Brief

> Original IP. **Never reference "Mario"/Nintendo** anywhere.

## Character: Pip, the Pipe-Runner

- **Who:** Pip — the youngest of the Pipe-Runners; a cheerful young plumber.
- **Look (matches the in-game hero sprite):** teal cap & shirt, orange overalls, brown boots, carries a wrench.
- **Personality:** brave, kind, relentlessly optimistic. Not the strongest hero — "the one who showed up, kept running, and never let the kingdom go dark."
- **World:** the **Pipeworks**, a sprawl of golden pipes carrying water, light, and magic to the meadow kingdom above. **Magic coins** power it.
- **Conflict:** the coins scatter; **the Goo** (the game's rose-colored blob enemies) clog every junction. Pip must collect coins, clear the Goo, and reach each district's **flagpole** (a valve) to send the water roaring home.
- **In-game mapping:** coins = magic coins; ?-blocks = trapped coins/power-ups; rose blob = the Goo; purple snail = Goo guardian; pipes = the Pipeworks; flagpole = the valve; power-ups = bursts of plumber's magic.
- **Tagline:** *Run. Jump. Keep the pipes flowing.*

## Short story (English)

Beneath the meadow kingdom runs the **Pipeworks** — a sprawl of golden pipes carrying water, light, and a little magic to every village above. Keeping them flowing is the job of the Pipe-Runners, and the youngest of them all is **Pip**: a cheerful plumber in a teal cap and orange overalls, with a heart bigger than his toolbox.

One quiet morning, the pipes fall silent. The magic coins that power the Pipeworks have scattered, and squishy rose-colored blobs — **the Goo** — have oozed into every junction. Without the coins, the lights above will go dark.

So Pip laces his boots, pockets his wrench, and runs. He vaults the wide pipes, bonks blocks to free trapped coins, bops the Goo on the head, and races zone after zone toward the great **flagpole** at the heart of each district — where one turn of the valve sends the water roaring home.

He isn't the strongest hero. He's just the one who showed up, kept running, and never let the kingdom go dark.

***Run. Jump. Keep the pipes flowing.*** — **PLUMBER QUEST**

## Cerita pendek (Bahasa Indonesia)

Jauh di bawah kerajaan padang rumput mengalir **Pipeworks** — jaringan pipa emas yang mengalirkan air, cahaya, dan sedikit keajaiban ke setiap desa di atas. Menjaganya tetap mengalir adalah tugas para Pipe-Runner, dan yang termuda dari mereka adalah **Pip**: seorang tukang ledeng ceria bertopi tosca dan overall oranye, dengan hati yang lebih besar dari kotak peralatannya.

Suatu pagi yang tenang, pipa-pipa mendadak sunyi. Koin ajaib yang menyalakan Pipeworks tercerai-berai, dan gumpalan merah muda kenyal — **si Goo** — menyumbat setiap sambungan. Tanpa koin, cahaya di atas akan padam.

Maka Pip mengikat sepatunya, menyelipkan kunci inggris, dan berlari. Ia melompati pipa-pipa lebar, memukul blok untuk membebaskan koin, menginjak si Goo, dan berpacu dari zona ke zona menuju **tiang bendera** besar di jantung tiap distrik — di mana satu putaran katup mengembalikan air ke rumah.

Ia bukan pahlawan terkuat. Ia hanyalah satu-satunya yang hadir, terus berlari, dan tak pernah membiarkan kerajaan menjadi gelap.

***Lari. Lompat. Jaga pipa tetap mengalir.*** — **PLUMBER QUEST**

---

## PRODUCTION BRIEF (do in a fresh session — token-heavy)

Approved approach: render polished visuals **from the real game art** (reliable, on-brand), not AI illustration.

### 1) Polished images
Build a small generator page under `tools/` (mirror `tools/spritesheet.html`: import `src/render/sprites.js` / use a canvas, draw large with `image-rendering:pixelated`, capture via the `/shot` server on :8011, then ffmpeg/`sips` upscale). Produce:
- **Hero card** — `sprites.hero.big.stand` rendered large (~6×) on a sky-gradient + grass strip, with **"PIP — THE PIPE-RUNNER"** in the game's bevel logo style and the one-line bio. Save to `media/pip-hero-card.png`.
- **2–3 story stills** — compositions from game tiles/sprites: (a) Pip running through the Pipeworks (pipes + coins), (b) bonking a `?`-block (coin pop), (c) Pip at the flagpole. Reuse the title-screen drawing helpers in `src/render/renderer.js` for style. Save to `media/`.

### 2) Concise video (<30s, target ~18–22s, 9:16)
Extend `tools/recorder.html` (the deterministic frame recorder already used for the 9s clip; renders the REAL game frame-by-frame in headless Chrome, captures via `/shot`, ffmpeg-assembles with `assets/theme.mp3`). Story beats:
1. Animated title (~3s).
2. **"MEET PIP"** text card over the hero (~2s).
3. Gameplay highlights on the showcase level: run → hop a pipe → bonk a `?`-block (coin) → stomp a Goo (now with Track A particles/hit-stop!) → flagpole (~10–12s).
4. **End card** (~3s): `PLUMBER QUEST` + *Run. Jump. Keep the pipes flowing.* + `tinyurl.com/plumberquest` + `discord.gg/AShezFxmB`.
- Output `media/plumber-quest-story.mp4`, 1080×1920, theme music with fade-out, total < 30s.
- Tooling already proven: headless Chrome `--headless=new`, `/tmp/shotsrv.py` on :8011 (POST `/shot?name=`), `ffmpeg` 8.x, nearest-neighbour integer upscale.

### 3) Caption (reuse the established bilingual socmed format)
EN + ID, hook + `▶ Play: https://tinyurl.com/plumberquest` + `💬 https://discord.gg/AShezFxmB` + retro hashtags. Now featuring **Pip** + the story angle.
