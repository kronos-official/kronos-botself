from app.api.main import app
from app.api.autoclick import router as autoclick_router


if not any(route.path.startswith("/api/autoclick") for route in app.routes):
    app.include_router(autoclick_router)
