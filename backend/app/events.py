from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel

from app.database import get_connection
from app.utils import require_role, log_audit

router = APIRouter(prefix="/events", tags=["Events"])

VALID_STATUSES = {"DETECTED", "ACKNOWLEDGED", "RESOLVED"}
VALID_SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class UpdateEventStatusRequest(BaseModel):
    event_status: str  # DETECTED | ACKNOWLEDGED | RESOLVED


# ---------------------------------------------------------------------------
# Alert Ingestion Helper (Used when an alert arrives from a camera)
# ---------------------------------------------------------------------------

def record_camera_alert(
    camera_id: int,
    event_type: str,
    severity: str,
    temperature: Optional[float] = None,
    humidity: Optional[float] = None,
    voltage: Optional[float] = None,
    dust: Optional[float] = None,
    vibration: Optional[float] = None,
    light: Optional[float] = None,
    water_level: Optional[float] = None,
    current_ma: Optional[float] = None,
    power_mw: Optional[float] = None,
    tilt: Optional[float] = None,
    prediction: Optional[str] = None,
    image_path: Optional[str] = None,
    description: Optional[str] = None,
) -> int:
    """
    Called whenever an alert is received from a camera:
    - If camera_id already exists in events table: updates the status and sensor columns including updated_at.
    - If camera_id does not exist: inserts as a new row.
    - Also updates camera status in the cameras table.
    Returns the event id.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        # Check if camera_id already exists in events table
        cur.execute("SELECT id FROM events WHERE camera_id = %s ORDER BY id DESC LIMIT 1", (camera_id,))
        existing = cur.fetchone()

        if existing:
            event_id = existing[0]
            cur.execute(
                """
                UPDATE events SET
                    event_type = %s,
                    severity = %s,
                    event_status = 'DETECTED',
                    temperature = %s,
                    humidity = %s,
                    voltage = %s,
                    dust = %s,
                    vibration = %s,
                    light = %s,
                    water_level = %s,
                    current_ma = %s,
                    power_mw = %s,
                    tilt = %s,
                    prediction = %s,
                    image_path = %s,
                    description = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    event_type, severity,
                    temperature, humidity, voltage, dust, vibration, light,
                    water_level, current_ma, power_mw, tilt,
                    prediction, image_path, description,
                    event_id,
                ),
            )
        else:
            cur.execute(
                """
                INSERT INTO events (
                    camera_id, event_type, severity, event_status,
                    temperature, humidity, voltage, dust, vibration, light,
                    water_level, current_ma, power_mw, tilt,
                    prediction, image_path, description,
                    created_at, updated_at
                )
                VALUES (%s, %s, %s, 'DETECTED', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                RETURNING id
                """,
                (
                    camera_id, event_type, severity,
                    temperature, humidity, voltage, dust, vibration, light,
                    water_level, current_ma, power_mw, tilt,
                    prediction, image_path, description,
                ),
            )
            event_id = cur.fetchone()[0]

        # Update camera status in cameras table
        cam_status = "error" if severity in ("CRITICAL", "HIGH") else "online"
        cur.execute(
            "UPDATE cameras SET status = %s, updated_at = NOW() WHERE id = %s",
            (cam_status, camera_id),
        )
    conn.commit()
    return event_id


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", summary="List events with optional filters")
def list_events(
    camera_id: Optional[int] = Query(None),
    severity: Optional[str] = Query(None),
    event_status: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, description="ISO date: 2024-01-01"),
    to_date: Optional[str] = Query(None, description="ISO date: 2024-12-31"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    conn = get_connection()
    query = """
        SELECT
            e.id, e.camera_id, e.event_type, e.severity,
            e.temperature, e.humidity, e.voltage, e.dust, e.vibration, e.light,
            e.prediction, e.image_path, e.description, e.created_at, e.updated_at,
            c.device_id, c.location,
            e.water_level, e.current_ma, e.power_mw, e.tilt,
            e.event_status
        FROM events e
        JOIN cameras c ON e.camera_id = c.id
        WHERE 1=1
    """
    params: list = []

    if camera_id is not None:
        query += " AND e.camera_id = %s"
        params.append(camera_id)
    if severity:
        query += " AND e.severity = %s"
        params.append(severity.upper())
    if event_status:
        query += " AND e.event_status = %s"
        params.append(event_status.upper())
    if from_date:
        query += " AND e.created_at >= %s"
        params.append(from_date)
    if to_date:
        query += " AND e.created_at <= %s"
        params.append(to_date)

    query += " ORDER BY e.created_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "camera_id": r[1],
            "event_type": r[2],
            "severity": r[3],
            "temperature": r[4],
            "humidity": r[5],
            "voltage": r[6],
            "dust": r[7],
            "vibration": r[8],
            "light": r[9],
            "prediction": r[10],
            "image_path": r[11],
            "description": r[12],
            "created_at": r[13],
            "updated_at": r[14],
            "device_id": r[15],
            "location": r[16],
            "water_level": r[17],
            "current_ma": r[18],
            "power_mw": r[19],
            "tilt": r[20],
            "event_status": r[21] if len(r) > 21 and r[21] else "DETECTED",
        }
        for r in rows
    ]


@router.get("/{event_id}", summary="Get a single event by ID")
def get_event(
    event_id: int,
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                e.id, e.camera_id, e.event_type, e.severity, e.event_status,
                e.temperature, e.humidity, e.voltage, e.dust, e.vibration, e.light,
                e.prediction, e.image_path, e.description, e.created_at, e.updated_at,
                c.device_id, c.location,
                e.water_level, e.current_ma, e.power_mw, e.tilt
            FROM events e
            JOIN cameras c ON e.camera_id = c.id
            WHERE e.id = %s
            """,
            (event_id,),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    return {
        "id": row[0],
        "camera_id": row[1],
        "event_type": row[2],
        "severity": row[3],
        "event_status": row[4],
        "temperature": row[5],
        "humidity": row[6],
        "voltage": row[7],
        "dust": row[8],
        "vibration": row[9],
        "light": row[10],
        "prediction": row[11],
        "image_path": row[12],
        "description": row[13],
        "created_at": row[14],
        "updated_at": row[15],
        "device_id": row[16],
        "location": row[17],
        "water_level": row[18],
        "current_ma": row[19],
        "power_mw": row[20],
        "tilt": row[21],
    }


@router.put("/{event_id}/status", summary="Acknowledge or resolve an event")
def update_event_status(
    event_id: int,
    body: UpdateEventStatusRequest,
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    status_val = body.event_status.upper()
    if status_val not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid event_status. Must be one of {list(VALID_STATUSES)}",
        )

    conn = get_connection()
    with conn.cursor() as cur:
        # Check if event exists and get its camera_id
        cur.execute("SELECT camera_id FROM events WHERE id = %s", (event_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        camera_id = row[0]

        # Update event_status (keep row, only change event_status)
        cur.execute(
            "UPDATE events SET event_status = %s, updated_at = NOW() WHERE id = %s RETURNING id",
            (status_val, event_id),
        )
        updated_row = cur.fetchone()

        # If resolved, reset camera status in cameras table to 'online'
        if status_val == "RESOLVED":
            cur.execute("UPDATE cameras SET status = 'online', updated_at = NOW() WHERE id = %s", (camera_id,))

        conn.commit()

        log_audit(
            current_user["id"],
            f"EVENT_{status_val}",
            "events",
            event_id,
            {"camera_id": camera_id, "event_status": status_val},
        )
        return {
            "message": f"Event marked as {status_val}",
            "id": updated_row[0],
            "camera_id": camera_id,
            "event_status": status_val,
        }


@router.delete("/{event_id}", summary="Delete an event (admin only)")
def delete_event(
    event_id: int,
    current_user: dict = Depends(require_role("admin")),
):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute("DELETE FROM events WHERE id = %s RETURNING id", (event_id,))
        row = cur.fetchone()
    conn.commit()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    log_audit(current_user["id"], "DELETE_EVENT", "events", event_id)
    return {"message": "Event deleted", "id": row[0]}
