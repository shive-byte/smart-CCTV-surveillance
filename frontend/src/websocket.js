// Real-time WebSocket connection to /ws/alerts for live telemetry & alerts

class RealtimeSocket {
  constructor() {
    this.ws = null;
    this.status = "disconnected"; // disconnected | connecting | connected
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.reconnectTimeout = null;
    this.pingInterval = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Connect to backend host (default port 8000)
    const host = window.location.hostname || "localhost";
    const wsUrl = `${protocol}//${host}:8000/ws/alerts`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setStatus("connected");
        this.reconnectAttempts = 0;
        console.log("[Sentinel WS] Connected to live alerts stream:", wsUrl);

        // Keepalive heartbeat
        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notify(data);
        } catch {
          // message might be string
          this.notify({ type: "raw", data: event.data });
        }
      };

      this.ws.onclose = () => {
        this.setStatus("disconnected");
        clearInterval(this.pingInterval);
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn("[Sentinel WS] Error or connection refused:", err);
        // onclose will trigger next
      };
    } catch (err) {
      console.warn("[Sentinel WS] Init failed:", err);
      this.setStatus("disconnected");
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[Sentinel WS] Max reconnect attempts reached, waiting 15s");
      this.reconnectAttempts = 0;
    }
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect() {
    clearTimeout(this.reconnectTimeout);
    clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  setStatus(status) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  onMessage(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  notify(data) {
    this.listeners.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error("[Sentinel WS] Listener error:", err);
      }
    });
  }
}

export const realtimeSocket = new RealtimeSocket();
