from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, status

from app.database import get_connection
from app.utils import get_current_user, require_role

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", summary="List notifications (newest first)")
def list_notifications(
    is_read: Optional[bool] = Query(None, description="Filter by read state"),
    severity: Optional[str] = Query(None, description="LOW | MEDIUM | HIGH | CRITICAL"),
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user),
):
    """
    Returns the most recent *limit* notifications.
    Any authenticated user may call this endpoint (JWT required).
    """
    conn = get_connection()
    query = """
        SELECT
            n.id, n.event_id, n.camera_id, n.title, n.message,
            n.severity, n.is_read, n.created_at,
            c.device_id, c.location
        FROM web_notifications n
        JOIN cameras c ON n.camera_id = c.id
        WHERE 1=1
    """
    params: list = []
    if is_read is not None:
        query += " AND n.is_read = %s"
        params.append(is_read)
    if severity:
        query += " AND n.severity = %s"
        params.append(severity.upper())
    query += " ORDER BY n.created_at DESC LIMIT %s"
    params.append(limit)

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "event_id": r[1],
            "camera_id": r[2],
            "title": r[3],
            "message": r[4],
            "severity": r[5],
            "is_read": r[6],
            "created_at": r[7],
            "device_id": r[8],
            "location": r[9],
        }
        for r in rows
    ]


@router.put("/read-all", summary="Mark all unread notifications as read")
def mark_all_read(current_user: dict = Depends(get_current_user)):
    """JWT required — any authenticated user."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE web_notifications SET is_read = TRUE WHERE is_read = FALSE RETURNING id"
        )
        updated = cur.rowcount
    conn.commit()
    return {"message": f"Marked {updated} notification(s) as read"}


@router.put("/{notif_id}/read", summary="Mark a single notification as read")
def mark_read(notif_id: int, current_user: dict = Depends(get_current_user)):
    """JWT required — any authenticated user."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE web_notifications SET is_read = TRUE WHERE id = %s RETURNING id",
            (notif_id,),
        )
        row = cur.fetchone()
    conn.commit()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return {"message": "Notification marked as read", "id": row[0]}


@router.delete("/{notif_id}", summary="Delete a notification (admin only)")
def delete_notification(
    notif_id: int,
    current_user: dict = Depends(require_role("admin")),
):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM web_notifications WHERE id = %s RETURNING id",
            (notif_id,),
        )
        row = cur.fetchone()
    conn.commit()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return {"message": "Notification deleted", "id": row[0]}
