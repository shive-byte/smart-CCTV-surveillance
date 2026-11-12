@echo off
cd /d "%~dp0backend"
echo Starting SentinelAI FastAPI Backend on port 8000...
..\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
pause

