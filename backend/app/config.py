from dotenv import load_dotenv
import os
from pathlib import Path

# Load .env from backend directory regardless of where uvicorn is launched
backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=backend_dir / ".env")
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:shive@localhost:5432/Camera_AI")
SECRET_KEY = os.getenv("SECRET_KEY", "ChangeThisToAVeryLongRandomString")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", str(backend_dir / "uploads"))
API_KEY = os.getenv("API_KEY", "ESP32_SECRET_KEY")