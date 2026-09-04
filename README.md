# Kronos Self 1.3

Private Telegram self-automation panel using Python, aiogram 3, Telethon, FastAPI, PostgreSQL, Redis and Docker Compose.

## What was upgraded

- Owner-only bot and Mini App authentication.
- Proper router registration for destinations and schedules.
- Secure, validated WebApp initData authentication.
- PostgreSQL + Redis readiness checks.
- Automatic Alembic migration service in Docker Compose.
- Automatic restart policies for all long-running services.
- Safer media-path validation so scheduled media cannot reference arbitrary filesystem paths.
- Configurable upload size and scheduler timing.
- More defensive Telethon session handling and graceful shutdown.
- Scheduler claim/lease logic to avoid duplicate processing when more than one scheduler loop is running.
- Better validation for schedules and run times.
- Clean Codespaces-friendly deployment.

## Required secrets

Set these in `.env` and never commit the file:

- `BOT_TOKEN`: BotFather token for the control bot.
- `OWNER_TELEGRAM_ID`: your numeric Telegram ID.
- `API_ID` and `API_HASH`: Telegram MTProto application credentials.
- `SECRET_KEY`: random secret, 32+ characters.
- `WEBAPP_URL`: public HTTPS origin of the FastAPI service, without `/miniapp/`.

### Important security note

A Telethon session is an account credential. Keep `storage/sessions` private and never commit it. If an old BotFather token has ever appeared in a public/shared file, revoke it in BotFather and use a new one.

## First deployment

```bash
cp .env.example .env
nano .env

docker compose up -d --build
```

The `migrate` service runs `alembic upgrade head` automatically before `bot`, `api` and `scheduler` start.

Check:

```bash
docker compose ps
docker compose logs --tail=100 bot
docker compose logs --tail=100 api
docker compose logs --tail=100 scheduler
curl http://localhost:8000/health
curl http://localhost:8000/health/ready
```

## GitHub Codespaces

1. Open port `8000` in the **PORTS** panel.
2. Make the forwarded port public for testing.
3. Copy the HTTPS forwarded URL into `WEBAPP_URL` in `.env`.
4. Recreate the app services:

```bash
docker compose up -d --build
```

The Mini App URL becomes:

```text
https://YOUR-CODESPACE-URL/miniapp/
```

The compose file uses `restart: unless-stopped`, so services are automatically restarted when the Docker daemon comes back after you reopen the Codespace. Codespaces itself is still subject to GitHub's lifecycle and usage limits.

## User Client login

Open the control bot and press `🔐 اتصال اکانت`. Complete the Telegram login flow. The resulting Telethon session is stored only under `storage/sessions`.

After that, open the Mini App and press `🔄 همگام‌سازی` to import available dialogs.

## Scheduling

Supported schedule types:

- `once`
- `daily`
- `weekly`
- `interval`

Media uploads are stored in `storage/media`, and both API and Scheduler mount the same directory.

## Development checks

```bash
python -m compileall -q app alembic
ruff check .
```

## Architecture

```text
Telegram Bot (aiogram)
        │
        ├── Mini App ── FastAPI ── PostgreSQL
        │                    │
        │                    └── Redis
        │
        └── Telethon User Client ── Telegram
                               ▲
                               │
                         Scheduler
```


### مهم: جلوگیری از صفحه ورود GitHub در Mini App

اگر `WEBAPP_URL` به آدرس forwarded port در Codespaces اشاره می‌کند، پورت `8000` باید در پنل **Ports** روی **Public** باشد. در غیر این صورت GitHub قبل از رسیدن درخواست به FastAPI صفحهٔ ورود GitHub را نشان می‌دهد. Mini App خودش احراز هویت GitHub ندارد و احراز هویت آن فقط با Telegram WebApp `initData` انجام می‌شود.

بعد از Public کردن پورت، `WEBAPP_URL` را فقط روی origin قرار دهید، بدون `/miniapp/`:

```env
WEBAPP_URL=https://YOUR-CODESPACE-8000.app.github.dev
```

سپس ربات، لینک Mini App را به‌صورت دکمهٔ Telegram باز می‌کند.


## Kronos Self Pro 2.0

This distribution is a complete restorable project based on Kronos Self v1.3, enhanced with a Telegram-native Mini App, numeric login keypad flow, professional copy, corrected Bot/PM destination classification, and a structured Support Center with tickets, replies, status and history.

## Pro 2.0 — complete distribution

This archive is a complete restorable Kronos Self project based on the v1.3 codebase, not a Mini App-only patch. It includes the bot, User Client, API, PostgreSQL/Redis stack, scheduler, Alembic migrations, tests and Mini App.

### Major improvements
- Telegram login numeric keypad with resend/delete/confirm and Persian/Arabic digit normalization.
- After successful code or 2FA, the bot returns to the full main menu.
- Telegram bots are classified as `bot` destinations instead of private chats.
- Destination cards in the Mini App are fully clickable and feed the scheduler composer.
- Dialog synchronization uses POST and the destination summary endpoint is included so a successful sync is not followed by a misleading 404.
- Professional bilingual-style Persian UI copy, loading states, animated transitions, Telegram-aware layout, responsive mobile bottom navigation and live preview.
- Support Center with ticket categories, priority, status, messages, close flow, history events, active-ticket limit and optional Telegram notification target.

### Restore from scratch
1. Copy `.env.example` to `.env` and fill your own credentials/secrets.
2. Run `bash RESTORE_CODESPACE.sh /workspaces/kronos-self`.
3. Verify `docker compose ps` and `/health/ready`.
4. Open the bot in Telegram and run `/start`.

Never put real bot tokens, API hashes, account credentials, Telegram login codes or 2FA passwords in source control.
