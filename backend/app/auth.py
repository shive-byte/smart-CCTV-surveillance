from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.database import get_connection
from app.utils import (
    verify_password,
    hash_password,
    create_access_token,
    get_current_user,
    log_audit,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str


class RegisterRequest(BaseModel):
    name: str
    username: str
    password: str
    role: str = "operator"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/login", summary="Obtain a JWT access token")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Accepts *username* and *password* (application/x-www-form-urlencoded).

    Returns a signed JWT Bearer token on success.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, username, password_hash, role, is_active
            FROM users
            WHERE username = %s
            """,
            (form_data.username,),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    user_id, name, username, password_hash, role, is_active = row

    if not is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact an administrator.",
        )

    if not verify_password(form_data.password, password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Embed user id and role inside the JWT payload
    token = create_access_token({"sub": user_id, "role": role})

    log_audit(user_id, "LOGIN", "users", None, {"username": username})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": name,
            "username": username,
            "role": role,
        },
    }


@router.post("/register", status_code=201, summary="Register a new user account")
def register(body: RegisterRequest):
    """
    Public registration endpoint.
    Creates a new user account and returns a signed JWT token on success.
    """
    valid_roles = {"admin", "operator", "worker"}
    role = body.role.lower() if body.role else "operator"
    if role not in valid_roles:
        role = "operator"

    conn = get_connection()
    password_hash = hash_password(body.password)

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (name, username, password_hash, role)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, username, role
                """,
                (body.name, body.username, password_hash, role),
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

    user_id, name, username, role = row
    token = create_access_token({"sub": user_id, "role": role})

    log_audit(user_id, "REGISTER", "users", None, {"username": username, "role": role})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "name": name,
            "username": username,
            "role": role,
        },
    }



@router.get("/me", summary="Get the current authenticated user's profile")
def get_me(current_user: dict = Depends(get_current_user)):
    """
    Requires a valid Bearer JWT.
    Returns the profile of the token owner.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, username, role, is_active, created_at
            FROM users
            WHERE id = %s
            """,
            (current_user["id"],),
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


@router.put("/me/password", summary="Change the current user's password")
def change_password(
    body: PasswordChangeRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Requires a valid Bearer JWT.
    Validates the old password before applying the new one.
    """
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT password_hash FROM users WHERE id = %s",
            (current_user["id"],),
        )
        row = cur.fetchone()

    if not row or not verify_password(body.old_password, row[0]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Old password is incorrect",
        )

    new_hash = hash_password(body.new_password)
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (new_hash, current_user["id"]),
        )
    conn.commit()

    log_audit(current_user["id"], "CHANGE_PASSWORD", "users", None)

    return {"message": "Password updated successfully"}
