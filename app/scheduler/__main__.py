import asyncio

from app.scheduler.engine import loop


if __name__ == "__main__":
    asyncio.run(loop())
