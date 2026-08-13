import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    """Manages active WebSocket connections and provides a broadcast helper."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict) -> None:
        """
        Send *data* as a JSON string to every connected client.
        Dead connections are silently removed.
        """
        message = json.dumps(data, default=str)
        dead: list[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for c in dead:
            self.disconnect(c)


# Singleton shared across the whole application
manager = ConnectionManager()


@router.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """
    WebSocket endpoint for real-time alert broadcasts.

    Clients connect here and receive JSON messages whenever an event or
    notification is created by the /cameras/telemetry endpoint.

    Supported client messages:
      - "ping"  → server replies "pong"  (keep-alive)
    """
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data.strip().lower() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
