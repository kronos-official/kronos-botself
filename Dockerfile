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

RUN mkdir -p /data/sessions /data/media \
    && chmod 700 /data/sessions /data/media

CMD ["python", "-m", "app.bot"]
