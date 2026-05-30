#!/bin/zsh
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  /usr/bin/python3 -m venv .venv
fi

.venv/bin/python -m pip install -e ".[test]" >/dev/null

open "http://127.0.0.1:8000"
.venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
