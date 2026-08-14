# Braille Hex Terminal

Pure local/static Hex prototype for the terminal board game collection.

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

- Standard 11x11 Hex placement and connection win rules
- Red connects west-east; blue connects north-south
- Seeded AI personas and deterministic replay
- Terminal-style canvas renderer built from Braille dot buffers
- Victory path rendered as a persistent dot-matrix electric current
