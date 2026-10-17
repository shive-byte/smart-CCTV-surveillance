import psycopg2
from psycopg2 import OperationalError
from app.config import DATABASE_URL

_connection = None


def get_connection():
    """
    Return a live psycopg2 connection.
    Automatically reconnects if the connection has been closed or dropped.
    """
    global _connection

    try:
        if _connection is None or _connection.closed != 0:
            _connection = psycopg2.connect(DATABASE_URL)

        else:
            # Clear any previous failed transaction
            _connection.rollback()

            # Verify the connection is still usable
            with _connection.cursor() as cur:
                cur.execute("SELECT 1")

    except OperationalError:
        if _connection and _connection.closed == 0:
            _connection.rollback()
            _connection.close()

        _connection = psycopg2.connect(DATABASE_URL)

    except Exception:
        if _connection and _connection.closed == 0:
            _connection.rollback()

        raise

    return _connection