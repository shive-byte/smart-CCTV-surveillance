from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.database import get_connection
from app.utils import require_role

router = APIRouter(prefix="/audit", tags=["Audit Logs"])


@router.get("", summary="Paginated audit log (admin only)")
def list_audit_logs(
    user_id: Optional[str] = Query(None, description="Filter by actor user ID"),
    action: Optional[str] = Query(None, description="Partial match on action name"),
    entity_type: Optional[str] = Query(None, description="e.g. cameras | events | users"),
    limit: int = Query(50, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_role("admin")),
):
    """
    Returns audit log entries in reverse-chronological order.
    JWT required — admin role only.
    """
    conn = get_connection()
    print(conn)
    query = """
        SELECT
            a.id, a.user_id, a.action, a.entity_type, a.entity_id,
            a.details, a.created_at,
            u.name AS user_name
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE 1=1
    """
    params: list = []

    if user_id:
        query += " AND a.user_id = %s"
        params.append(user_id)
    if action:
        query += " AND a.action ILIKE %s"
        params.append(f"%{action}%")
    if entity_type:
        query += " AND a.entity_type = %s"
        params.append(entity_type)

    query += " ORDER BY a.created_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "user_id": r[1],
            "action": r[2],
            "entity_type": r[3],
            "entity_id": r[4],
            "details": r[5],
            "created_at": r[6],
            "user_name": r[7],
        }
        for r in rows
    ]
