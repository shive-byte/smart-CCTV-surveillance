import asyncio
import json

from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect

from app.database import get_connection


router = APIRouter(tags=["WebSocket"])


HEARTBEAT_INTERVAL = 30 * 60  # 30 minutes
HEARTBEAT_TIMEOUT = 30        # wait 30 seconds for pong


class CameraConnection:

    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.pong_received = asyncio.Event()


class ConnectionManager:

    def __init__(self):
        self.active_connections: dict[int, CameraConnection] = {}
        self.dashboard_clients: set[WebSocket] = set()

    async def connect(self, camera_id: int, websocket: WebSocket):
        await websocket.accept()
        connection = CameraConnection(websocket)
        self.active_connections[camera_id] = connection
        print(f"Camera {camera_id} connected")
        return connection

    def disconnect(self, camera_id: int):
        self.active_connections.pop(camera_id, None)
        print(f"Camera {camera_id} disconnected")

    async def connect_dashboard(self, websocket: WebSocket):
        await websocket.accept()
        self.dashboard_clients.add(websocket)
        print("Dashboard client connected to /ws/alerts")

    def disconnect_dashboard(self, websocket: WebSocket):
        self.dashboard_clients.discard(websocket)
        print("Dashboard client disconnected from /ws/alerts")

    async def broadcast(self, payload: dict):
        """Broadcast a JSON payload to all connected frontend dashboard clients."""
        message = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in list(self.dashboard_clients):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.dashboard_clients.discard(ws)


manager = ConnectionManager()


# --------------------------------------------------
# DATABASE
# --------------------------------------------------

def get_camera_ids_from_db() -> list[int]:
    """
    Return every camera id registered in the database.
    Used by the heartbeat loop to know which cameras to ping.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM cameras ORDER BY id")
        return [row[0] for row in cur.fetchall()]


def update_camera_status(camera_id: int, status: str) -> None:
    """
    Persist a heartbeat result for *camera_id*.

    cameras table changes
    ─────────────────────
    • status   → always updated to the supplied value
                 ('active' | 'dead' | 'offline')
    • last_seen → set to NOW() only when the camera responded (status='active')
                  so the column always reflects the last *successful* contact

    web_notifications side-effect
    ──────────────────────────────
    When status becomes 'dead' a CRITICAL notification row is inserted so
    the existing frontend notification pipeline fires without extra wiring.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:

            if status == "active":
                # Camera replied: refresh both status and last_seen
                cur.execute(
                    """
                    UPDATE cameras
                    SET    status    = %s,
                           last_seen = NOW()
                    WHERE  id = %s
                    """,
                    (status, camera_id),
                )
            else:
                # Camera did not reply: update status only, preserve last_seen
                cur.execute(
                    """
                    UPDATE cameras
                    SET    status = %s
                    WHERE  id = %s
                    """,
                    (status, camera_id),
                )

            # Insert a CRITICAL notification whenever a camera goes dead so the
            # frontend's existing web_notifications stream picks it up.
            if status == "dead":
                cur.execute(
                    """
                    INSERT INTO web_notifications
                        (camera_id, title, message, severity)
                    VALUES
                        (%s, %s, %s, 'CRITICAL')
                    """,
                    (
                        camera_id,
                        f"[CRITICAL] Camera {camera_id} Offline",
                        f"Camera {camera_id} did not respond to the heartbeat ping.",
                    ),
                )

        conn.commit()
        print(f"DB UPDATE: camera={camera_id}, status={status}")

    except Exception as exc:
        conn.rollback()
        print(f"DB ERROR updating camera {camera_id}: {exc}")


# --------------------------------------------------
# HEARTBEAT
# --------------------------------------------------

async def check_camera(camera_id: int, connection: CameraConnection):
    try:
        # Reset previous heartbeat result
        connection.pong_received.clear()
        # Send ping
        await connection.websocket.send_text("ping")
        print(f"Heartbeat ping sent to camera {camera_id}")
        # Wait for pong
        await asyncio.wait_for(
            connection.pong_received.wait(),
            timeout=HEARTBEAT_TIMEOUT
        )
        print(f"Camera {camera_id} responded")
        # DB operation is synchronous, so run it outside the event loop
        await asyncio.to_thread(update_camera_status, camera_id, "active")
        await manager.broadcast({
            "type": "camera_status",
            "camera_id": camera_id,
            "status": "active"
        })

    except asyncio.TimeoutError:
        print(f"Camera {camera_id} did not respond")
        await asyncio.to_thread(update_camera_status, camera_id, "dead")
        await manager.broadcast({
            "type": "camera_status",
            "camera_id": camera_id,
            "status": "dead"
        })

    except Exception as e:
        print(f"Heartbeat failed for camera {camera_id}: {e}")
        await asyncio.to_thread(update_camera_status, camera_id, "dead")
        await manager.broadcast({
            "type": "camera_status",
            "camera_id": camera_id,
            "status": "dead"
        })

async def _mark_dead_and_broadcast(camera_id: int):
    await asyncio.to_thread(update_camera_status, camera_id, "dead")
    await manager.broadcast({
        "type": "camera_status",
        "camera_id": camera_id,
        "status": "dead"
    })

async def heartbeat_loop():
    while True:
        print("Starting camera heartbeat check")
        # Get ALL cameras registered in DB
        camera_ids = await asyncio.to_thread(get_camera_ids_from_db)
        tasks = []
        for camera_id in camera_ids:
            connection = manager.active_connections.get(camera_id)
            if connection is None:
                # Camera exists in DB but isn't connected to WebSocket.
                print(f"Camera {camera_id} is not connected")
                tasks.append(_mark_dead_and_broadcast(camera_id))
            else:
                # Camera is connected. Send heartbeat.
                tasks.append(check_camera(camera_id, connection))
        # Check all cameras concurrently
        if tasks:
            await asyncio.gather(*tasks)
        print("Camera heartbeat check completed")
        # Wait 30 minutes
        await asyncio.sleep(HEARTBEAT_INTERVAL)


# --------------------------------------------------
# WEBSOCKET
# --------------------------------------------------

@router.websocket("/ws/camera/{camera_id}")
async def camera_websocket(websocket: WebSocket,camera_id: int):
    connection = await manager.connect(camera_id,websocket)
    try:
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "pong":
                print(f"Pong received from camera {camera_id}")
                connection.pong_received.set()
    except WebSocketDisconnect:
        print(f"Camera {camera_id} disconnected")
    except Exception as e:
        print(f"Camera {camera_id} error: {e}")
    finally:
        manager.disconnect(camera_id)


@router.websocket("/ws/alerts")
async def alerts_websocket(websocket: WebSocket):
    """WebSocket connection for frontend clients to receive real-time notifications and alerts."""
    await manager.connect_dashboard(websocket)
    try:
        while True:
            # Keep socket open and consume incoming heartbeats/messages from dashboard
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_dashboard(websocket)
    except Exception as e:
        manager.disconnect_dashboard(websocket)