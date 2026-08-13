# Braille Reversi Terminal

Pure local/static Reversi prototype for the terminal board game collection.

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

- Standard 8x8 Reversi/Othello rules
- Legal move generation with flips in all eight directions
- Pass when a side has no legal move
- Seeded AI personas and deterministic replay
- Terminal-style canvas renderer built from Braille dot buffers

