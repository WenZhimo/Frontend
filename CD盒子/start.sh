#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
PORT="${PORT:-8137}"
if command -v node >/dev/null 2>&1; then
  exec node server.js
fi
exec python3 -m http.server "$PORT" --bind 127.0.0.1
