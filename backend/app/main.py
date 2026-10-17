import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth import router as auth_router
from app.users import router as users_router
from app.cameras import router as cameras_router
from app.events import router as events_router
from app.maintenance import router as maintenance_router
from app.notifications import router as notifications_router
from app.dashboard import router as dashboard_router
from app.audit import router as audit_router

from app.config import UPLOAD_FOLDER
import asyncio

from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.websocket import router as ws_router, heartbeat_loop


@asynccontextmanager
async def lifespan(app: FastAPI):

    print("Starting heartbeat service...")

    heartbeat_task = asyncio.create_task(
        heartbeat_loop()
    )

    yield

    print("Stopping heartbeat service...")

    heartbeat_task.cancel()

    try:
        await heartbeat_task
    except asyncio.CancelledError:
        pass





# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    lifespan=lifespan,
    title="SentinelAI API",
    version="1.0.0",
    description=(
        "Camera Health Monitoring System REST API.\n\n"
        "All protected endpoints require a **Bearer JWT** obtained from `POST /auth/login`.\n"
        "The ESP32 telemetry endpoint (`POST /cameras/telemetry`) uses an **X-Api-Key** header instead."
    ),
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Tighten for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Static files (uploaded camera images)
# ---------------------------------------------------------------------------

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_FOLDER), name="uploads")

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth_router)           # /auth
app.include_router(users_router)          # /users
app.include_router(cameras_router)        # /cameras
app.include_router(events_router)         # /events
app.include_router(maintenance_router)    # /maintenance
app.include_router(notifications_router)  # /notifications
app.include_router(dashboard_router)      # /dashboard
app.include_router(audit_router)          # /audit
app.include_router(ws_router)             # /ws/alerts  (WebSocket)


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------

@app.get("/", tags=["Health"])
def root():
    return {
        "message": "SentinelAI Running",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
    }