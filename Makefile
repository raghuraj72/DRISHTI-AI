# DRISHTI-AI — Developer Makefile
# Usage: make <target>

.PHONY: up down logs backend dashboard ingestion train db-init clean help

help:
	@echo "DRISHTI-AI Development Commands"
	@echo "================================"
	@echo "  make up          Start all services (Docker Compose)"
	@echo "  make down        Stop all services"
	@echo "  make logs        Follow all service logs"
	@echo "  make backend     Run backend locally (hot-reload)"
	@echo "  make dashboard   Run dashboard dev server"
	@echo "  make ingestion   Run ingestion layer locally"
	@echo "  make train       Run dataset prep + YOLOv8 training"
	@echo "  make db-init     Apply DB schema to running Postgres"
	@echo "  make clean       Remove data/ and __pycache__/"

# ── Docker Compose ────────────────────────────────────────────

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

# ── Local Development ─────────────────────────────────────────

backend:
	cd backend && pip install -r requirements.txt && \
	uvicorn main:app --reload --host 0.0.0.0 --port 8000

dashboard:
	cd dashboard && npm install && npm run dev

ingestion:
	cd ingestion && pip install -r requirements.txt && \
	python stream_manager.py

# ── ML Pipeline ───────────────────────────────────────────────

train:
	cd detection && pip install -r requirements.txt && \
	python dataset_prep.py && python train_yolo.py

# ── Database ─────────────────────────────────────────────────

db-init:
	docker compose exec postgres psql -U drishti -d drishti_db -f /docker-entrypoint-initdb.d/01-init.sql

# ── Cleanup ───────────────────────────────────────────────────

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	rm -rf data/ dashboard/dist/ dashboard/node_modules/.cache/
