FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt ./

RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && pip install -e . --no-deps

COPY app ./app
COPY miniapp ./miniapp
COPY alembic.ini ./
COPY alembic ./alembic

RUN python - <<'PY'
from pathlib import Path

path = Path('/app/miniapp/index.html')
text = path.read_text(encoding='utf-8')

head_marker = '<script src="/miniapp/dom-guard.js?v=20260904"></script>'
runtime_marker = '<script src="/miniapp/runtime-v2.js?v=20260904"></script>'
autoclick_marker = '<script src="/miniapp/autoclick.js?v=20260904"></script>'
meowie_marker = '<script src="/miniapp/meowie.js?v=20260906"></script>'

if head_marker not in text:
    text = text.replace('</head>', f'{head_marker}</head>', 1)

if runtime_marker not in text:
    text = text.replace('</body>', f'{runtime_marker}</body>', 1)

if autoclick_marker not in text:
    text = text.replace('</body>', f'{autoclick_marker}</body>', 1)

if meowie_marker not in text:
    text = text.replace('</body>', f'{meowie_marker}</body>', 1)

path.write_text(text, encoding='utf-8')
PY

RUN mkdir -p /data/sessions /data/media \
    && chmod 700 /data/sessions /data/media

CMD ["python", "-m", "app.bot"]
