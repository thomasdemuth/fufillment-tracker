.PHONY: dev backend frontend migrate seed demo demo-snapshot test test-backend test-frontend lint build docker-build docker-up gen-api

dev: ## run backend (8000) + frontend dev server (5173) together
	@$(MAKE) -j2 backend frontend

backend:
	cd backend && uv run alembic upgrade head && uv run uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && pnpm dev

migrate:
	cd backend && uv run alembic upgrade head

seed: ## generate demo spreadsheets into ./demo
	cd backend && uv run python scripts/seed_demo.py

demo: ## upload demo spreadsheets to a running server (http://localhost:8000) and refresh with mock carriers
	cd backend && uv run python scripts/demo_load.py

demo-snapshot: ## regenerate the bundled demo for the hosted site from FAKE seed data in a throwaway data dir (never from your real database)
	cd backend && uv run python scripts/demo_snapshot.py

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest -q

test-frontend:
	cd frontend && pnpm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && pnpm lint && pnpm typecheck

build:
	cd frontend && pnpm build

gen-api: ## regenerate frontend/src/api/schema.d.ts from the running backend
	cd frontend && pnpm gen:api

docker-build:
	docker compose build

docker-up:
	docker compose up

e2e: ## Playwright smoke test against a running server on :8000 (mock mode, fresh data dir recommended)
	cd frontend && pnpm exec playwright test
