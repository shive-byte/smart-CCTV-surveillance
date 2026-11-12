"""
Hardware Serial Bridge for CCTV Camera Health Monitoring System
----------------------------------------------------------------
Automatically bridges an ESP32 hardware device connected via USB cable
to the live FastAPI backend (http://localhost:8000/cameras/telemetry).

Features:
- Auto-detects connected ESP32 / CH340 / CP210x COM ports.
- Reads [TELEMETRY_JSON] packets emitted by main.ino.
- Forwards real-time telemetry to the FastAPI backend.
- Automatically handles device disconnect and reconnect events.

Usage:
  py hardware_bridge.py               # Auto-detects COM port
  py hardware_bridge.py --port COM4   # Connects to specific port
  py hardware_bridge.py --test        # Sends test simulation packet without hardware
"""

import sys
import time
import json
import argparse
import requests

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None

DEFAULT_BACKEND_URL = "http://localhost:8000/cameras/telemetry"
DEFAULT_API_KEY = "ESP32_SECRET_KEY"
DEFAULT_BAUD = 115200


def find_esp32_port():
    """Scan available COM ports for microcontrollers."""
    if not serial:
        return None
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return None

    # Common USB-UART chip descriptions
    esp_keywords = ["CP210", "CH340", "CH9102", "FTDI", "UART", "USB Serial", "ESP32"]
    for p in ports:
        desc = f"{p.description} {p.manufacturer} {p.hwid}".lower()
        for kw in esp_keywords:
            if kw.lower() in desc:
                return p.device

    # Fallback to the first non-internal COM port if available
    external_ports = [p.device for p in ports if "intel(r) active management" not in p.description.lower()]
    return external_ports[0] if external_ports else None


def forward_to_backend(payload: dict, backend_url: str, api_key: str):
    """POST telemetry JSON to FastAPI."""
    headers = {
        "Content-Type": "application/json",
        "X-Api-Key": api_key,
    }
    try:
        response = requests.post(backend_url, json=payload, headers=headers, timeout=3.0)
        if response.status_code == 200:
            res_data = response.json()
            score = res_data.get("health_score", "N/A")
            event_flag = " [ANOMALY DETECTED!]" if res_data.get("event_created") else ""
            print(f"[Bridge -> FastAPI] Ingested: Camera {payload.get('device_id')} | Health: {score}%{event_flag}")
            return True
        else:
            print(f"[Bridge -> FastAPI] Error {response.status_code}: {response.text}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"[Bridge -> FastAPI] Failed to connect to FastAPI at {backend_url}. Is backend running on port 8000?")
        return False
    except Exception as exc:
        print(f"[Bridge -> FastAPI] Request exception: {exc}")
        return False


def run_bridge(port: str = None, backend_url: str = DEFAULT_BACKEND_URL, api_key: str = DEFAULT_API_KEY):
    if not serial:
        print("[ERROR] 'pyserial' library is required. Install with: py -m pip install pyserial")
        sys.exit(1)

    print("=" * 65)
    print("  SentinelAI Hardware Serial Bridge (ESP32 <-> FastAPI)")
    print(f"  Target Backend: {backend_url}")
    print("=" * 65)

    while True:
        target_port = port or find_esp32_port()

        if not target_port:
            print("[Bridge] No hardware device detected on USB. Waiting for connection...")
            print("         (Plug in your ESP32 via USB cable)")
            time.sleep(2.5)
            continue

        print(f"\n[Bridge] Connecting to hardware on {target_port} at {DEFAULT_BAUD} baud...")
        try:
            with serial.Serial(target_port, DEFAULT_BAUD, timeout=1.5) as ser:
                print(f"[Bridge] Successfully connected to {target_port}!")
                print("[Bridge] Listening for real-time sensor streams from main.ino...\n")

                last_forward = 0
                while True:
                    line = ser.readline().decode("utf-8", errors="replace").strip()
                    if not line:
                        continue

                    # Check for tagged JSON from main.ino
                    json_str = None
                    if "[TELEMETRY_JSON]" in line:
                        json_str = line.split("[TELEMETRY_JSON]", 1)[1].strip()
                    elif line.startswith("{") and line.endswith("}"):
                        json_str = line

                    if json_str:
                        now = time.time()
                        if now - last_forward >= 30.0:
                            try:
                                data = json.loads(json_str)
                                if forward_to_backend(data, backend_url, api_key):
                                    last_forward = now
                            except json.JSONDecodeError:
                                print(f"[Serial Raw] {line}")
                    else:
                        # Log debug messages from ESP32
                        print(f"[ESP32] {line}")

        except serial.SerialException as se:
            print(f"[Bridge] Hardware disconnected or port busy: {se}")
            print("[Bridge] Waiting to reconnect...")
            time.sleep(2.0)
        except KeyboardInterrupt:
            print("\n[Bridge] Stopped by user.")
            break


def run_test_simulation(backend_url: str = DEFAULT_BACKEND_URL, api_key: str = DEFAULT_API_KEY):
    """Send a sample hardware packet to verify FastAPI ingestion."""
    print("=" * 65)
    print("  SentinelAI Telemetry Verification Test")
    print(f"  Sending mock hardware packet matching main.ino sensors...")
    print("=" * 65)

    test_packet = {
        "device_id": "ABCD",
        "voltage": 12.05,
        "current_ma": 320.0,
        "power_mw": 3856.0,
        "temperature": 32.5,
        "water_level": 4068,
        "tilt": 0.35,
        "pitch": 1.2,
        "roll": -0.8,
        "vibration": 0.98,
        "shock": False,
        "status_power": "OK",
        "status_temp": "OK",
        "status_water": "OK",
        "status_tamper": "OK",
        "overall": "HEALTHY",
        "ip_address": "192.168.1.150"
    }

    ok = forward_to_backend(test_packet, backend_url, api_key)
    if ok:
        print("\nSUCCESS! FastAPI backend successfully ingested the hardware sensor telemetry.")
    else:
        print("\nFAILED: Ensure FastAPI backend is running with 'py -m uvicorn app.main:app --port 8000'.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SentinelAI ESP32 Hardware Bridge")
    parser.add_argument("--port", help="Serial COM port (e.g. COM4). If omitted, auto-detects.", default=None)
    parser.add_argument("--backend", help="FastAPI backend endpoint", default=DEFAULT_BACKEND_URL)
    parser.add_argument("--key", help="ESP32 API Key", default=DEFAULT_API_KEY)
    parser.add_argument("--test", action="store_true", help="Send test telemetry packet to backend")
    args = parser.parse_args()

    if args.test:
        run_test_simulation(args.backend, args.key)
    else:
        run_bridge(args.port, args.backend, args.key)

