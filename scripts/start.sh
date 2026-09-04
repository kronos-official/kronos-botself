#!/usr/bin/env bash
set -euo pipefail

test -f .env || { echo '.env not found. Run: cp .env.example .env'; exit 1; }
docker compose up -d --build
docker compose ps
