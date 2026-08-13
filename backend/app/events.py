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
            e.id, e.camera_id, e.event_type, e.severity, e.event_status,
            e.temperature, e.humidity, e.voltage, e.dust, e.vibration, e.light,
            e.prediction, e.image_path, e.description, e.created_at, e.updated_at,
            c.device_id, c.location
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
            "event_status": r[4],
            "temperature": r[5],
            "humidity": r[6],
            "voltage": r[7],
            "dust": r[8],
            "vibration": r[9],
            "light": r[10],
            "prediction": r[11],
            "image_path": r[12],
            "description": r[13],
            "created_at": r[14],
            "updated_at": r[15],
            "device_id": r[16],
            "location": r[17],
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
                c.device_id, c.location
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
    }


@router.put("/{event_id}/status", summary="Acknowledge or resolve an event")
def update_event_status(
    event_id: int,
    body: UpdateEventStatusRequest,
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    if body.event_status.upper() not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid event_status. Must be one of {list(VALID_STATUSES)}",
        )

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE events SET event_status = %s WHERE id = %s RETURNING id",
            (body.event_status.upper(), event_id),
        )
        row = cur.fetchone()
    conn.commit()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    log_audit(
        current_user["id"],
        f"EVENT_{body.event_status.upper()}",
        "events",
        event_id,
    )
    return {"message": f"Event marked as {body.event_status.upper()}", "id": row[0]}


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
