.PHONY: up down restart logs check test

up:
	./scripts/start.sh

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f --tail=100

check:
	python -m compileall -q app alembic tests

test:
	pytest -q
