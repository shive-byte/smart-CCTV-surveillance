from fastapi import APIRouter, Depends

from app.database import get_connection
from app.utils import require_role

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", summary="High-level system health summary")
def get_summary(
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    """
    Returns aggregated counts across cameras, events, maintenance, and notifications.
    JWT required (any role).
    """
    conn = get_connection()
    with conn.cursor() as cur:

        # Camera counts by status
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'online')  AS online,
                COUNT(*) FILTER (WHERE status = 'offline') AS offline,
                COUNT(*) FILTER (WHERE status = 'error')   AS error,
                COUNT(*)                                    AS total,
                COALESCE(AVG(health_score), 100)           AS avg_health
            FROM cameras
            """
        )
        cam = cur.fetchone()

        # Event counts
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE event_type = 'DETECTED')     AS open_events,
                COUNT(*) FILTER (WHERE severity     = 'CRITICAL')     AS critical_events,
                COUNT(*) FILTER (WHERE event_type = 'ACKNOWLEDGED') AS acknowledged,
                COUNT(*)                                               AS total_events
            FROM events
            """
        )
        ev = cur.fetchone()

        # Maintenance counts
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'PENDING')     AS pending,
                COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress,
                COUNT(*) FILTER (WHERE status = 'COMPLETED')   AS completed,
                COUNT(*)                                        AS total
            FROM maintenance_records
            """
        )
        maint = cur.fetchone()

        # Unread notification count
        cur.execute("SELECT COUNT(*) FROM web_notifications WHERE is_read = FALSE")
        unread = cur.fetchone()[0]

    return {
        "cameras": {
            "online": cam[0],
            "offline": cam[1],
            "error": cam[2],
            "total": cam[3],
            "avg_health_score": round(float(cam[4]), 2),
        },
        "events": {
            "open": ev[0],
            "critical": ev[1],
            "acknowledged": ev[2],
            "total": ev[3],
        },
        "maintenance": {
            "pending": maint[0],
            "in_progress": maint[1],
            "completed": maint[2],
            "total": maint[3],
        },
        "unread_notifications": unread,
    }


@router.get("/health-trend", summary="7-day daily average health score & event count")
def get_health_trend(
    current_user: dict = Depends(require_role("admin", "operator", "worker")),
):
    """
    Returns one data point per day for the past 7 days.
    Each point contains the average camera health score and the number of events.
    JWT required (any role).
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                DATE(e.created_at)     AS day,
                AVG(c.health_score)    AS avg_health,
                COUNT(e.id)            AS event_count
            FROM events e
            JOIN cameras c ON e.camera_id = c.id
            WHERE e.created_at >= NOW() - INTERVAL '7 days'
            GROUP BY DATE(e.created_at)
            ORDER BY day ASC
            """
        )
        rows = cur.fetchall()

    return [
        {
            "day": str(r[0]),
            "avg_health": round(float(r[1]), 2) if r[1] is not None else 100.0,
            "event_count": r[2],
        }
        for r in rows
    ]
