from app.api.main import app
from app.api.autoclick import router as autoclick_router
from app.api.meowie import router as meowie_router


app.include_router(autoclick_router)
app.include_router(meowie_router)
