# Braille Jungle Terminal

Pure local/static Dou Shou Qi / Jungle prototype for the terminal board game collection.

## Run

- Double-click `start.bat`
- Or serve this folder with any local HTTP server and open `index.html`

## Controls

- `1/2/3/4`: playback speed `0.5x / 1x / 2x / 4x`
- `Space`: pause or resume
- `R`: reroll a new seed and replay
- `P`: replay the current seed
- `RANDOM`: generate a 100-character ASCII seed
- `COPY`: copy the active seed

## Current Scope

- 7x9 Dou Shou Qi board with rivers, traps, and dens
- Rat water movement, elephant/rat capture exception, and lion/tiger river jumps
- Entering the opponent den or eliminating all opposing animals wins
- Seeded AI personas and deterministic replay
- Terminal-style canvas renderer built from Braille dot buffers
