// API Client for SentinelAI Backend with JWT authentication

const API_BASE = "http://localhost:8000";

export const authState = {
  token: localStorage.getItem("sentinel_token") || null,
  user: null,
};

// Try to parse cached user
try {
  const cached = localStorage.getItem("sentinel_user");
  if (cached) {
    authState.user = JSON.parse(cached);
  }
} catch {
  // ignore
}

export function setSession(token, user) {
  authState.token = token;
  authState.user = user;
  if (token) {
    localStorage.setItem("sentinel_token", token);
  } else {
    localStorage.removeItem("sentinel_token");
  }
  if (user) {
    localStorage.setItem("sentinel_user", JSON.stringify(user));
  } else {
    localStorage.removeItem("sentinel_user");
  }
}

export function clearSession() {
  authState.token = null;
  authState.user = null;
  localStorage.removeItem("sentinel_token");
  localStorage.removeItem("sentinel_user");
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = options.headers || {};

  // Attach JWT Bearer token if available
  if (authState.token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${authState.token}`;
  }

  // Default content type to json unless FormData/URLSearchParams
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof URLSearchParams) &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // If we received an unauthorized error and it's not the login endpoint
    if (!endpoint.startsWith("/auth/login")) {
      clearSession();
      window.dispatchEvent(new CustomEvent("sentinel:unauthorized"));
    }
  }

  let data;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      (data && data.detail) ||
      (typeof data === "string" ? data : `Request failed with status ${response.status}`);
    throw new Error(errorMsg);
  }

  return data;
}

export const api = {
  // Auth
  async login(username, password) {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);

    const res = await request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    setSession(res.access_token, res.user);
    return res;
  },

  async register(name, username, password, role = "operator") {
    const res = await request("/auth/register", {
      method: "POST",
      body: { name, username, password, role },
    });
    setSession(res.access_token, res.user);
    return res;
  },

  async verifyToken() {
    if (!authState.token) return null;
    try {
      const user = await request("/auth/me");
      authState.user = user;
      localStorage.setItem("sentinel_user", JSON.stringify(user));
      return user;
    } catch (err) {
      clearSession();
      return null;
    }
  },

  async changePassword(oldPassword, newPassword) {
    return request("/auth/me/password", {
      method: "PUT",
      body: { old_password: oldPassword, new_password: newPassword },
    });
  },

  // Dashboard
  async getDashboardSummary() {
    return request("/dashboard/summary");
  },

  async getHealthTrend() {
    return request("/dashboard/health-trend");
  },

  // Cameras
  async getCameras(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    if (params.location) query.append("location", params.location);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request(`/cameras${qs}`);
  },

  async getAccessibleCameras() {
    return request("/cameras/accessible");
  },

  async getCamera(id) {
    return request(`/cameras/${id}`);
  },

  async createCamera(payload) {
    return request("/cameras", {
      method: "POST",
      body: payload,
    });
  },

  async updateCamera(id, payload) {
    return request(`/cameras/${id}`, {
      method: "PUT",
      body: payload,
    });
  },

  async deleteCamera(id) {
    return request(`/cameras/${id}`, {
      method: "DELETE",
    });
  },

  // Telemetry (ESP32 simulation)
  async sendTelemetry(payload, apiKey = "ESP32_SECRET_KEY") {
    return request("/cameras/telemetry", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: payload,
    });
  },

  // Events
  async getEvents(params = {}) {
    const query = new URLSearchParams();
    if (params.camera_id) query.append("camera_id", params.camera_id);
    if (params.severity) query.append("severity", params.severity);
    if (params.event_status) query.append("event_status", params.event_status);
    if (params.from_date) query.append("from_date", params.from_date);
    if (params.to_date) query.append("to_date", params.to_date);
    if (params.limit) query.append("limit", params.limit);
    if (params.offset) query.append("offset", params.offset);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request(`/events${qs}`);
  },

  async getEvent(id) {
    return request(`/events/${id}`);
  },

  async updateEventStatus(id, event_status) {
    return request(`/events/${id}/status`, {
      method: "PUT",
      body: { event_status },
    });
  },

  async deleteEvent(id) {
    return request(`/events/${id}`, {
      method: "DELETE",
    });
  },

  // Maintenance
  async getMaintenance(params = {}) {
    const query = new URLSearchParams();
    if (params.camera_id) query.append("camera_id", params.camera_id);
    if (params.status) query.append("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request(`/maintenance${qs}`);
  },

  async createMaintenance(payload) {
    return request("/maintenance", {
      method: "POST",
      body: payload,
    });
  },

  async updateMaintenance(id, payload) {
    return request(`/maintenance/${id}`, {
      method: "PUT",
      body: payload,
    });
  },

  async deleteMaintenance(id) {
    return request(`/maintenance/${id}`, {
      method: "DELETE",
    });
  },

  // Notifications
  async getNotifications(params = {}) {
    const query = new URLSearchParams();
    if (params.is_read !== undefined) query.append("is_read", params.is_read);
    if (params.severity) query.append("severity", params.severity);
    if (params.limit) query.append("limit", params.limit || 50);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request(`/notifications${qs}`);
  },

  async markNotificationRead(id) {
    return request(`/notifications/${id}/read`, {
      method: "PUT",
    });
  },

  async markAllNotificationsRead() {
    return request("/notifications/read-all", {
      method: "PUT",
    });
  },

  async deleteNotification(id) {
    return request(`/notifications/${id}`, {
      method: "DELETE",
    });
  },

  // Audit Logs (admin only)
  async getAuditLogs(params = {}) {
    const query = new URLSearchParams();
    if (params.user_id) query.append("user_id", params.user_id);
    if (params.action) query.append("action", params.action);
    if (params.entity_type) query.append("entity_type", params.entity_type);
    if (params.limit) query.append("limit", params.limit || 50);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return request(`/audit${qs}`);
  },

  // Users management (admin only)
  async getUsers() {
    return request("/users");
  },

  async createUser(payload) {
    return request("/users", {
      method: "POST",
      body: payload,
    });
  },

  async updateUser(id, payload) {
    return request(`/users/${id}`, {
      method: "PUT",
      body: payload,
    });
  },

  async deactivateUser(id) {
    return request(`/users/${id}`, {
      method: "DELETE",
    });
  },
};
