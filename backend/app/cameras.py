from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel

from app.database import get_connection
from app.utils import require_role, verify_api_key, log_audit
from app.websocket import manager

router = APIRouter(prefix="/cameras", tags=["Cameras"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateCameraRequest(BaseModel):
    device_id: str
    location: str
    ip_address: Optional[str] = None
    operator_id: str
    installed_at: Optional[datetime] = None


class UpdateCameraRequest(BaseModel):
    location: Optional[str] = None
    ip_address: Optional[str] = None
    status: Optional[str] = None
    operator_id: Optional[str] = None


class TelemetryPayload(BaseModel):
    """Payload sent by an ESP32 device."""
    device_id: str
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    voltage: Optional[float] = None
    dust: Optional[float] = None
    vibration: Optional[float] = None
    light: Optional[float] = None
    prediction: Optional[str] = None
    image_path: Optional[str] = None


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _row_to_camera(r) -> dict:
    return {
        "id": r[0],
        "device_id": r[1],
        "location": r[2],
        "ip_address": str(r[3]) if r[3] else None,
        "status": r[4],
        "health_score": float(r[5]) if r[5] is not None else None,
        "operator_id": r[6],
        "maintenance_status": r[7],
        "maintenance_date": r[8],
        "last_seen": r[9],
        "installed_at": r[10],
        "operator_name": r[11],
    }


def get_user_accessible_cameras(current_user: dict, user_id: Optional[str] = None) -> list:
    """
    Return a list of cameras accessible by current_user or assigned to user_id.
    - If user_id is provided, filter by c.operator_id = user_id.
    - If user_id is not provided:
      - Non-admin users (operators and workers) receive cameras where operator_id matches their user ID.
      - Admins receive all cameras unless user_id is passed.
    """
    conn = get_connection()
    query = """
        SELECT c.id, c.device_id, c.location, c.ip_address, c.status, c.health_score,
               c.operator_id, c.maintenance_status, c.maintenance_date, c.last_seen,
               c.installed_at, u.name AS operator_name
        FROM cameras c
        LEFT JOIN users u ON c.operator_id = u.id
    """
    params = []
    target_id = user_id or (current_user["id"] if current_user["role"] != "admin" else None)
    if target_id:
        query += " WHERE c.operator_id = %s"
        params.append(target_id)
    query += " ORDER BY c.created_at DESC"

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [_row_to_camera(r) for r in rows]



# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", summary="List all cameras")
def list_cameras(
    status: Optional[str] = Query(None, description="Filter by status: online | offline | error"),
    location: Optional[str] = Query(None, description="Partial location search"),
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    conn = get_connection()
    query = """
        SELECT c.id, c.device_id, c.location, c.ip_address, c.status, c.health_score,
               c.operator_id, c.maintenance_status, c.maintenance_date, c.last_seen,
               c.installed_at, u.name AS operator_name
        FROM cameras c
        LEFT JOIN users u ON c.operator_id = u.id
        WHERE 1=1
    """
    params = []
    if status:
        query += " AND c.status = %s"
        params.append(status)
    if location:
        query += " AND c.location ILIKE %s"
        params.append(f"%{location}%")
    query += " ORDER BY c.created_at DESC"

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [_row_to_camera(r) for r in rows]


@router.get("/accessible", summary="List cameras accessible to the current user")
def list_accessible_cameras(
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    """Return cameras the authenticated user is authorized to manage/view."""
    return get_user_accessible_cameras(current_user)


@router.post("", status_code=201, summary="Register a new camera")
def create_camera(
    body: CreateCameraRequest,
    current_user: dict = Depends(require_role("admin")),
):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cameras (device_id, location, ip_address, operator_id, installed_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, device_id, location, status
                """,
                (body.device_id, body.location, body.ip_address, body.operator_id, body.installed_at),
            )
            row = cur.fetchone()
        conn.commit()
    except Exception as e:
        conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A camera with this device_id already exists",
            )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    log_audit(current_user["id"], "CREATE_CAMERA", "cameras", row[0], {"device_id": body.device_id})
    return {"id": row[0], "device_id": row[1], "location": row[2], "status": row[3]}


@router.get("/{camera_id}", summary="Get camera details by ID")
def get_camera(
    camera_id: int,
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.id, c.device_id, c.location, c.ip_address, c.status, c.health_score,
                   c.operator_id, c.maintenance_status, c.maintenance_date, c.last_seen,
                   c.installed_at, u.name AS operator_name, c.created_at, c.updated_at
            FROM cameras c
            LEFT JOIN users u ON c.operator_id = u.id
            WHERE c.id = %s
            """,
            (camera_id,),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    return {
        "id": row[0],
        "device_id": row[1],
        "location": row[2],
        "ip_address": str(row[3]) if row[3] else None,
        "status": row[4],
        "health_score": float(row[5]) if row[5] is not None else None,
        "operator_id": row[6],
        "maintenance_status": row[7],
        "maintenance_date": row[8],
        "last_seen": row[9],
        "installed_at": row[10],
        "operator_name": row[11],
        "created_at": row[12],
        "updated_at": row[13],
    }


@router.put("/{camera_id}", summary="Update camera info")
def update_camera(
    camera_id: int,
    body: UpdateCameraRequest,
    current_user: dict = Depends(require_role("admin", "operator")),
):
    conn = get_connection()
    fields, values = [], []
    if body.location is not None:
        fields.append("location = %s")
        values.append(body.location)
    if body.ip_address is not None:
        fields.append("ip_address = %s")
        values.append(body.ip_address)
    if body.status is not None:
        fields.append("status = %s")
        values.append(body.status)
    if body.operator_id is not None:
        fields.append("operator_id = %s")
        values.append(body.operator_id)

    if not fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values.append(camera_id)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE cameras SET {', '.join(fields)} WHERE id = %s RETURNING id",
            values,
        )
        row = cur.fetchone()
    conn.commit()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    log_audit(current_user["id"], "UPDATE_CAMERA", "cameras", camera_id)
    return {"message": "Camera updated", "id": row[0]}


@router.delete("/{camera_id}", summary="Delete a camera")
def delete_camera(
    camera_id: int,
    current_user: dict = Depends(require_role("admin")),
):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM cameras WHERE id = %s RETURNING id", (camera_id,))
        row = cur.fetchone()
    conn.commit()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Camera not found")

    log_audit(current_user["id"], "DELETE_CAMERA", "cameras", camera_id)
    return {"message": "Camera deleted", "id": row[0]}


# ---------------------------------------------------------------------------
# ESP32 Telemetry endpoint — API-key authenticated, NOT JWT
# ---------------------------------------------------------------------------

_SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def _max_severity(a: str, b: str) -> str:
    return a if _SEVERITY_ORDER.index(a) >= _SEVERITY_ORDER.index(b) else b


@router.post("/telemetry", summary="ESP32: ingest sensor telemetry")
async def receive_telemetry(
    body: TelemetryPayload,
    _api_key: str = Depends(verify_api_key),
):
    """
    Called by ESP32 devices.  Authenticated via X-Api-Key header (not JWT).

    - Updates camera.last_seen, status='online', and a computed health_score.
    - Creates an event + notification when anomalies are detected or a
      ML prediction is provided.
    - Broadcasts the notification via WebSocket to all connected clients.
    """
    conn = get_connection()

    # --- Resolve camera ---
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM cameras WHERE device_id = %s", (body.device_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera with device_id '{body.device_id}' is not registered",
        )
    camera_id = row[0]

    # --- Compute health score (simple rule-based degradation) ---
    health = 100.0
    if body.dust is not None:
        health -= body.dust / 10.0          # -10 pts per 100 units dust
    if body.vibration is not None:
        health -= body.vibration * 5.0      # -5 pts per vibration unit
    health = max(0.0, min(100.0, health))

    with conn.cursor() as cur:
        cur.execute(
            "UPDATE cameras SET last_seen = NOW(), status = 'online', health_score = %s WHERE id = %s",
            (health, camera_id),
        )
    conn.commit()

    # --- Anomaly detection ---
    severity = "LOW"
    description_parts: list[str] = []

    if body.temperature is not None and body.temperature > 60:
        severity = _max_severity(severity, "HIGH")
        description_parts.append(f"High temperature: {body.temperature}°C")

    if body.humidity is not None and body.humidity > 80:
        severity = _max_severity(severity, "MEDIUM")
        description_parts.append(f"High humidity: {body.humidity}%")

    if body.voltage is not None and (body.voltage < 4.5 or body.voltage > 5.5):
        severity = _max_severity(severity, "CRITICAL")
        description_parts.append(f"Voltage out of range: {body.voltage}V")

    if health < 40:
        severity = _max_severity(severity, "HIGH")
        description_parts.append(f"Low health score: {health:.1f}")

    event_type = body.prediction or ("anomaly_detected" if description_parts else "telemetry")
    description = "; ".join(description_parts) if description_parts else None

    # --- Create event & notification only when something is noteworthy ---
    event_id = None
    if description_parts or body.prediction:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO events (
                    camera_id, event_type, severity,
                    temperature, humidity, voltage, dust, vibration, light,
                    prediction, image_path, description
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    camera_id, event_type, severity,
                    body.temperature, body.humidity, body.voltage,
                    body.dust, body.vibration, body.light,
                    body.prediction, body.image_path, description,
                ),
            )
            event_id = cur.fetchone()[0]

        notif_title = f"[{severity}] {event_type.replace('_', ' ').title()}"
        notif_msg = description or f"ML Prediction: {body.prediction}"

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO web_notifications (event_id, camera_id, title, message, severity)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, title, message, severity, created_at
                """,
                (event_id, camera_id, notif_title, notif_msg, severity),
            )
            notif = cur.fetchone()
        conn.commit()

        # Broadcast to all WebSocket subscribers
        await manager.broadcast(
            {
                "type": "notification",
                "id": notif[0],
                "title": notif[1],
                "message": notif[2],
                "severity": notif[3],
                "camera_id": camera_id,
                "event_id": event_id,
                "created_at": str(notif[4]),
            }
        )

    return {
        "status": "ok",
        "camera_id": camera_id,
        "health_score": health,
        "event_created": event_id is not None,
        "event_id": event_id,
    }
