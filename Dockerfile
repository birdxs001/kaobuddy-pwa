FROM python:3.11-slim

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the whole project (backend package + static files)
COPY . .

# Fly.io uses 8080 internally, forwarded to 443
# Use PORT env var for compatibility
EXPOSE 8080

CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8080}
