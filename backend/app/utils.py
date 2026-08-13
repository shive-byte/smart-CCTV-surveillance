from datetime import datetime, timedelta
from typing import Optional
import json

from fastapi import Depends, HTTPException, Header, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, API_KEY
from app.database import get_connection

# ---------------------------------------------------------------------------
# Security contexts
# ---------------------------------------------------------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# tokenUrl must match the login endpoint path
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Return a bcrypt hash of *password*."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches the bcrypt *hashed* value."""
    return pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a signed JWT.

    The token payload includes:
      - All key-value pairs from *data*
      - 'exp': expiry timestamp
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    """
    Decode and verify a JWT.

    Raises HTTP 401 if the token is invalid or expired.
    Returns the decoded payload dict on success.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    FastAPI dependency — extract and verify the Bearer JWT.

    Injects: {"id": str, "role": str}
    Raises HTTP 401 if the token is missing, invalid, or expired.
    """
    payload = verify_token(token)
    user_id: str = payload.get("sub")
    role: str = payload.get("role")
    if not user_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is incomplete",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"id": user_id, "role": role}


def require_role(*allowed_roles: str):
    """
    Dependency factory — enforce role-based access control.

    Usage:
        current_user: dict = Depends(require_role("admin", "operator"))

    Raises HTTP 403 if the authenticated user's role is not in *allowed_roles*.
    """
    def _dependency(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Allowed roles: {list(allowed_roles)}",
            )
        return current_user
    return _dependency


def verify_api_key(x_api_key: str = Header(...)) -> str:
    """
    FastAPI dependency — validate the ESP32 API key sent via X-Api-Key header.

    Raises HTTP 403 on mismatch.
    """
    if x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key",
        )
    return x_api_key


# ---------------------------------------------------------------------------
# Audit log helper
# ---------------------------------------------------------------------------

def log_audit(
    user_id: Optional[str],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    details: Optional[dict] = None,
) -> None:
    """
    Insert a row into audit_logs.

    Failures are silently swallowed so that audit logging never breaks the
    main request/response flow.
    """
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    action,
                    entity_type,
                    entity_id,
                    json.dumps(details) if details else None,
                ),
            )
        conn.commit()
    except Exception:
        # Never let audit logging break the caller
        pass
