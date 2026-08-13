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
            # Ping the server to verify the connection is still alive
            with _connection.cursor() as cur:
                cur.execute("SELECT 1")
    except OperationalError:
        _connection = psycopg2.connect(DATABASE_URL)
    return _connection