# Braille Chinese Checkers Terminal

Pure local/static Chinese Checkers prototype for the terminal board game collection.

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

- 2-player Chinese Checkers on the standard 121-hole star board
- North and South camps, 10 pieces each
- Single-step moves plus chained jumps
- Seeded AI personas and deterministic replay
- Terminal-style canvas renderer built from Braille dot buffers

