from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel

from app.database import get_connection
from app.utils import require_role, log_audit
from app.cameras import get_user_accessible_cameras

router = APIRouter(prefix="/maintenance", tags=["Maintenance"])

VALID_STATUSES = {"PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateMaintenanceRequest(BaseModel):
    camera_id: int
    event_id: Optional[int] = None
    maintenance_type: str
    recommendation: Optional[str] = None
    performed_by: Optional[str] = None          # user ID (VARCHAR 10)
    next_maintenance: Optional[datetime] = None
    remarks: Optional[str] = None


class UpdateMaintenanceRequest(BaseModel):
    status: Optional[str] = None
    performed_by: Optional[str] = None
    next_maintenance: Optional[datetime] = None
    remarks: Optional[str] = None
    recommendation: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/user-cameras", summary="List cameras accessible to current user for maintenance registration")
def list_user_cameras(
    user_id: Optional[str] = Query(None, description="Optional user/operator ID to filter cameras for"),
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    """Returns list of cameras assigned/respective to the user for maintenance registration."""
    target_user_id = user_id if (current_user["role"] == "admin" and user_id) else current_user["id"]
    return get_user_accessible_cameras(current_user, user_id=target_user_id)


@router.get("", summary="List maintenance records")
def list_maintenance(
    camera_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    conn = get_connection()
    query = """
        SELECT
            m.id, m.camera_id, m.event_id, m.maintenance_type, m.recommendation,
            m.status, m.performed_by, m.maintenance_date, m.next_maintenance, m.remarks,
            m.created_at, m.updated_at,
            c.device_id, c.location,
            u.name AS performed_by_name
        FROM maintenance_records m
        JOIN cameras c ON m.camera_id = c.id
        LEFT JOIN users u ON m.performed_by = u.id
        WHERE 1=1
    """
    params: list = []
    if current_user["role"] != "admin":
        query += " AND c.operator_id = %s"
        params.append(current_user["id"])
    if camera_id is not None:
        query += " AND m.camera_id = %s"
        params.append(camera_id)
    if status:
        query += " AND m.status = %s"
        params.append(status.upper())
    query += " ORDER BY m.created_at DESC"

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "camera_id": r[1],
            "event_id": r[2],
            "maintenance_type": r[3],
            "recommendation": r[4],
            "status": r[5],
            "performed_by": r[6],
            "maintenance_date": r[7],
            "next_maintenance": r[8],
            "remarks": r[9],
            "created_at": r[10],
            "updated_at": r[11],
            "device_id": r[12],
            "location": r[13],
            "performed_by_name": r[14],
        }
        for r in rows
    ]


@router.post("", status_code=201, summary="Create a maintenance record")
def create_maintenance(
    body: CreateMaintenanceRequest,
    current_user: dict = Depends(require_role("admin", "operator")),
):
    performed_by = body.performed_by or current_user["id"]

    # Check camera accessibility - only cameras respective to the user are permitted
    target_user_id = performed_by if current_user["role"] == "admin" else current_user["id"]
    accessible_cameras = get_user_accessible_cameras(current_user, user_id=target_user_id)
    accessible_ids = {cam["id"] for cam in accessible_cameras}

    if body.camera_id not in accessible_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Camera ID {body.camera_id} is not assigned to user '{target_user_id}'.",
        )

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO maintenance_records
                    (camera_id, event_id, maintenance_type, recommendation,
                     performed_by, next_maintenance, remarks)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, camera_id, status, maintenance_date
                """,
                (
                    body.camera_id,
                    body.event_id,
                    body.maintenance_type,
                    body.recommendation,
                    performed_by,
                    body.next_maintenance,
                    body.remarks,
                ),
            )
            row = cur.fetchone()
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    log_audit(
        current_user["id"],
        "CREATE_MAINTENANCE",
        "maintenance_records",
        row[0],
        {"camera_id": body.camera_id, "performed_by": performed_by},
    )
    return {
        "id": row[0],
        "camera_id": row[1],
        "status": row[2],
        "maintenance_date": row[3],
    }



@router.get("/{record_id}", summary="Get a maintenance record by ID")
def get_maintenance(
    record_id: int,
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                m.id, m.camera_id, m.event_id, m.maintenance_type, m.recommendation,
                m.status, m.performed_by, m.maintenance_date, m.next_maintenance, m.remarks,
                m.created_at, m.updated_at,
                c.device_id, c.location,
                u.name AS performed_by_name
            FROM maintenance_records m
            JOIN cameras c ON m.camera_id = c.id
            LEFT JOIN users u ON m.performed_by = u.id
            WHERE m.id = %s
            """,
            (record_id,),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found",
        )

    return {
        "id": row[0],
        "camera_id": row[1],
        "event_id": row[2],
        "maintenance_type": row[3],
        "recommendation": row[4],
        "status": row[5],
        "performed_by": row[6],
        "maintenance_date": row[7],
        "next_maintenance": row[8],
        "remarks": row[9],
        "created_at": row[10],
        "updated_at": row[11],
        "device_id": row[12],
        "location": row[13],
        "performed_by_name": row[14],
    }


@router.put("/{record_id}", summary="Update a maintenance record")
def update_maintenance(
    record_id: int,
    body: UpdateMaintenanceRequest,
    current_user: dict = Depends(require_role("admin", "operator")),
):
    if body.status is not None and body.status.upper() not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of {list(VALID_STATUSES)}",
        )

    conn = get_connection()
    fields, values = [], []

    if body.status is not None:
        fields.append("status = %s")
        values.append(body.status.upper())
    if body.performed_by is not None:
        fields.append("performed_by = %s")
        values.append(body.performed_by)
    if body.next_maintenance is not None:
        fields.append("next_maintenance = %s")
        values.append(body.next_maintenance)
    if body.remarks is not None:
        fields.append("remarks = %s")
        values.append(body.remarks)
    if body.recommendation is not None:
        fields.append("recommendation = %s")
        values.append(body.recommendation)

    if not fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values.append(record_id)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE maintenance_records SET {', '.join(fields)} WHERE id = %s RETURNING id",
            values,
        )
        row = cur.fetchone()
    conn.commit()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found",
        )

    log_audit(
        current_user["id"],
        "UPDATE_MAINTENANCE",
        "maintenance_records",
        record_id,
    )
    return {"message": "Maintenance record updated", "id": row[0]}


@router.delete("/{record_id}", summary="Delete a maintenance record (admin only)")
def delete_maintenance(
    record_id: int,
    current_user: dict = Depends(require_role("admin")),
):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM maintenance_records WHERE id = %s RETURNING id",
            (record_id,),
        )
        row = cur.fetchone()
    conn.commit()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found",
        )

    log_audit(current_user["id"], "DELETE_MAINTENANCE", "maintenance_records", record_id)
    return {"message": "Maintenance record deleted", "id": row[0]}
