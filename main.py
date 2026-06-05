"""Root entry point for Railway / Railpack deployment.

Railpack auto-detects FastAPI from this file and starts uvicorn.
For local development, use the startup scripts instead.
"""
import os
import sys

# Ensure backend is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app.main import app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
