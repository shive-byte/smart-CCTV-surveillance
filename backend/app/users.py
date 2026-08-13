from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel

from app.database import get_connection
from app.utils import hash_password, require_role, log_audit

router = APIRouter(prefix="/users", tags=["Users"])

VALID_ROLES = {"admin", "operator", "worker"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    name: str
    username: str
    password: str
    role: str = "worker"


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Routes  (all require admin role — JWT verified via require_role)
# ---------------------------------------------------------------------------

@router.get("", summary="List all users")
def list_users(current_user: dict = Depends(require_role("admin"))):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, username, role, is_active, created_at
            FROM users
            ORDER BY created_at DESC
            """
        )
        rows = cur.fetchall()
    return [
        {
            "id": r[0],
            "name": r[1],
            "username": r[2],
            "role": r[3],
            "is_active": r[4],
            "created_at": r[5],
        }
        for r in rows
    ]


@router.post("", status_code=201, summary="Create a new user")
def create_user(
    body: CreateUserRequest,
    current_user: dict = Depends(require_role("admin")),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of {list(VALID_ROLES)}",
        )

    conn = get_connection()
    password_hash = hash_password(body.password)

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (name, username, password_hash, role)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, username, role, created_at
                """,
                (body.name, body.username, password_hash, body.role),
            )
            row = cur.fetchone()
        conn.commit()
    except Exception as e:
        conn.rollback()
        if "unique" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already exists",
            )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    log_audit(
        current_user["id"],
        "CREATE_USER",
        "users",
        None,
        {"new_username": body.username, "role": body.role},
    )

    return {
        "id": row[0],
        "name": row[1],
        "username": row[2],
        "role": row[3],
        "created_at": row[4],
    }


@router.get("/{user_id}", summary="Get a user by ID")
def get_user(user_id: str, current_user: dict = Depends(require_role("admin"))):
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, username, role, is_active, created_at
            FROM users
            WHERE id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {
        "id": row[0],
        "name": row[1],
        "username": row[2],
        "role": row[3],
        "is_active": row[4],
        "created_at": row[5],
    }


@router.put("/{user_id}", summary="Update a user's name, role, or active status")
def update_user(
    user_id: str,
    body: UpdateUserRequest,
    current_user: dict = Depends(require_role("admin")),
):
    if body.role is not None and body.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of {list(VALID_ROLES)}",
        )

    conn = get_connection()
    fields, values = [], []

    if body.name is not None:
        fields.append("name = %s")
        values.append(body.name)
    if body.role is not None:
        fields.append("role = %s")
        values.append(body.role)
    if body.is_active is not None:
        fields.append("is_active = %s")
        values.append(body.is_active)

    if not fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values.append(user_id)
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE users SET {', '.join(fields)} WHERE id = %s RETURNING id",
            values,
        )
        row = cur.fetchone()
    conn.commit()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    log_audit(current_user["id"], "UPDATE_USER", "users", None, {"target_user": user_id})
    return {"message": "User updated", "id": row[0]}


@router.delete("/{user_id}", summary="Deactivate a user (soft delete)")
def deactivate_user(
    user_id: str,
    current_user: dict = Depends(require_role("admin")),
):
    if user_id == current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account",
        )

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE users SET is_active = FALSE WHERE id = %s RETURNING id",
            (user_id,),
        )
        row = cur.fetchone()
    conn.commit()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    log_audit(current_user["id"], "DEACTIVATE_USER", "users", None, {"target_user": user_id})
    return {"message": "User deactivated", "id": row[0]}
