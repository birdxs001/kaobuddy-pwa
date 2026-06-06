"""Root entry point for Railway / Railpack deployment.

Railpack auto-detects FastAPI via the explicit import below.
"""
import os
import sys
from fastapi import FastAPI  # noqa: F401 — Railpack FastAPI detection marker

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.main import app  # noqa: E402

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
