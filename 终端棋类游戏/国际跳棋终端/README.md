# Braille International Draughts Terminal

Pure local/static international draughts prototype for the terminal board game collection.

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

- 10x10 international draughts board on playable dark squares
- Men move forward, capture forward/backward, and promote on the final rank
- Flying kings move and capture along diagonals
- Mandatory capture with longest capture sequence selection
- Seeded AI personas and deterministic replay
- Terminal-style canvas renderer built from Braille dot buffers

