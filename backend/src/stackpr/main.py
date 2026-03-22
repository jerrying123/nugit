"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from stackpr.config import get_settings
from stackpr.db.session import init_db, close_db
from stackpr.api import router as api_router
from stackpr.queue import get_arq_pool
from stackpr.ws_manager import ConnectionManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await init_db(settings.database_url)
    app.state.arq_pool = None
    if settings.redis_url and settings.redis_url.strip():
        try:
            app.state.arq_pool = await get_arq_pool()
        except Exception:
            app.state.arq_pool = None
    app.state.ws_manager = ConnectionManager()
    yield
    pool = getattr(app.state, "arq_pool", None)
    if pool is not None:
        await pool.close()
    await close_db()


app = FastAPI(
    title="StackPR API",
    description="Backend for stacked pull request management",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(api_router, prefix="/api", tags=["api"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}
