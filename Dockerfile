FROM node:22-slim AS frontend-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build


FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY main.py ./main.py
COPY --from=frontend-build /app/backend/static ./backend/static

EXPOSE 8080

CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8080}
