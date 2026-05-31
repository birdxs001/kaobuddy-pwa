#!/bin/zsh
set -e

cd "$(dirname "$0")"

if [ ! -x ".venv/bin/python" ] || ! .venv/bin/python -c "import sys" >/dev/null 2>&1; then
  rm -rf .venv
  /usr/bin/python3 -m venv .venv
fi

.venv/bin/python -m pip install -e ".[test]" >/dev/null

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [ -n "$NODE_BIN" ] && [ -f "node_modules/vite/bin/vite.js" ]; then
  "$NODE_BIN" node_modules/typescript/bin/tsc >/dev/null
  "$NODE_BIN" node_modules/vite/bin/vite.js build >/dev/null
fi

open "http://127.0.0.1:8000"
.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
