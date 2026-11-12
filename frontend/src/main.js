import { api, authState, setSession, clearSession } from "./api.js";
import { realtimeSocket } from "./websocket.js";
import { icons } from "./icons.js";
import { renderHealthTrendChart, renderCameraStatusChart } from "./charts.js";

// Global state
const state = {
  activeView: "dashboard",
  user: null,
  dashboardSummary: null,
  healthTrend: [],
  cameras: [],
  events: [],
  maintenance: [],
  notifications: [],
  auditLogs: [],
  cameraFilter: "all",
  cameraSearch: "",
  eventSeverityFilter: "all",
  eventStatusFilter: "unresolved",
  socketStatus: "disconnected",
};

// UI Toast Notification Manager
function showToast(title, message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${type === "danger" ? icons.alertTriangle : type === "success" ? icons.checkCircle : type === "warning" ? icons.alertCircle : icons.bell}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">${icons.x}</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 250);
  }, 4500);
}

// ---------------------------------------------------------------------------
// VIEW RENDERERS
// ---------------------------------------------------------------------------

function renderApp() {
  const app = document.getElementById("app");
  if (!state.user) {
    renderAuthView(app);
  } else {
    renderDashboardView(app);
  }
}

// 1. Auth View (Login / Register)
function renderAuthView(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo-badge">
            ${icons.shield}
          </div>
          <h1 class="auth-title">SentinelAI</h1>
          <p class="auth-subtitle">Camera Health & Predictive Surveillance</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab-btn active" id="tab-login-btn">Sign In</button>
          <button class="auth-tab-btn" id="tab-register-btn">Register</button>
        </div>

        <!-- Login Form -->
        <form class="auth-form" id="login-form">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" id="login-username" class="form-input" placeholder="e.g. ss or admin" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <div class="form-input-wrap">
              <input type="password" id="login-password" class="form-input" placeholder="Enter your password" required />
            </div>
          </div>
          <button type="submit" class="btn-primary" id="btn-submit-login" style="margin-top: 0.5rem;">
            Sign In to Console
          </button>
        </form>

        <!-- Register Form -->
        <form class="auth-form" id="register-form" style="display: none;">
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" id="reg-name" class="form-input" placeholder="e.g. John Doe" required />
          </div>
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" id="reg-username" class="form-input" placeholder="Choose a username" required />
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" id="reg-password" class="form-input" placeholder="Create a strong password" required />
          </div>
          <div class="form-group">
            <label class="form-label">Role</label>
            <select id="reg-role" class="form-input">
              <option value="operator">Operator</option>
              <option value="worker">Field Worker</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <button type="submit" class="btn-primary" style="margin-top: 0.5rem;">
            Create Account
          </button>
        </form>

        <div class="quick-demo-box">
          <div class="quick-demo-title">Quick Demo Login</div>
          <div class="quick-demo-btns">
            <button class="btn-chip" id="demo-user-btn">Fill 'ss' (Admin)</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Toggle Login / Register tabs
  const loginTab = document.getElementById("tab-login-btn");
  const registerTab = document.getElementById("tab-register-btn");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  loginTab.addEventListener("click", () => {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.style.display = "flex";
    registerForm.style.display = "none";
  });

  registerTab.addEventListener("click", () => {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    loginForm.style.display = "none";
    registerForm.style.display = "flex";
  });

  // Demo user fill
  document.getElementById("demo-user-btn").addEventListener("click", () => {
    document.getElementById("login-username").value = "ss";
    document.getElementById("login-password").focus();
  });

  // Handle Login
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("btn-submit-login");

    try {
      btn.disabled = true;
      btn.textContent = "Verifying...";
      const res = await api.login(username, password);
      state.user = res.user;
      showToast("Signed In", `Welcome back, ${res.user.name || res.user.username}!`, "success");
      initRealtime();
      await loadInitialData();
      renderApp();
    } catch (err) {
      showToast("Authentication Failed", err.message, "danger");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign In to Console";
    }
  });

  // Handle Register
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const username = document.getElementById("reg-username").value.trim();
    const password = document.getElementById("reg-password").value;
    const role = document.getElementById("reg-role").value;

    try {
      const res = await api.register(name, username, password, role);
      state.user = res.user;
      showToast("Account Created", `Welcome, ${res.user.name}!`, "success");
      initRealtime();
      await loadInitialData();
      renderApp();
    } catch (err) {
      showToast("Registration Failed", err.message, "danger");
    }
  });
}

// 2. Main Dashboard Shell
function renderDashboardView(container) {
  const unreadNotifs = state.notifications.filter((n) => !n.is_read).length;

  container.innerHTML = `
    <div class="app-container">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-brand-icon">${icons.shield}</div>
          <div class="sidebar-brand-text">
            <span class="sidebar-brand-name">SentinelAI</span>
            <span class="sidebar-brand-desc">Camera Health Intelligence</span>
          </div>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section-title">Monitoring</div>
          <button class="nav-item ${state.activeView === "dashboard" ? "active" : ""}" data-view="dashboard">
            ${icons.dashboard}
            <span>Overview & Analytics</span>
          </button>
          <button class="nav-item ${state.activeView === "cameras" ? "active" : ""}" data-view="cameras">
            ${icons.camera}
            <span>Cameras Fleet</span>
            <span class="nav-badge" style="background: var(--brand-500);">${state.cameras.length}</span>
          </button>
          <button class="nav-item ${state.activeView === "events" ? "active" : ""}" data-view="events">
            ${icons.alertTriangle}
            <span>Events & Anomalies</span>
            ${state.events.filter((e) => e.event_status === "DETECTED").length > 0 ? `<span class="nav-badge">${state.events.filter((e) => e.event_status === "DETECTED").length}</span>` : ""}
          </button>
          <button class="nav-item ${state.activeView === "maintenance" ? "active" : ""}" data-view="maintenance">
            ${icons.wrench}
            <span>Maintenance</span>
          </button>

          <div class="nav-section-title">Simulation & Tools</div>
          <button class="nav-item ${state.activeView === "simulator" ? "active" : ""}" data-view="simulator">
            ${icons.cpu}
            <span>IoT Sensor Simulator</span>
          </button>

          ${
            state.user.role === "admin"
              ? `
            <div class="nav-section-title">Administration</div>
            <button class="nav-item ${state.activeView === "audit" ? "active" : ""}" data-view="audit">
              ${icons.fileText}
              <span>Audit Trail</span>
            </button>
          `
              : ""
          }
        </nav>

        <div class="sidebar-footer">
          <div class="user-mini">
            <div class="user-avatar">${(state.user.name || state.user.username || "U")[0].toUpperCase()}</div>
            <div class="user-info">
              <span class="user-name">${state.user.name || state.user.username}</span>
              <span class="user-role-badge">${state.user.role}</span>
            </div>
          </div>
          <button class="btn-icon-logout" id="btn-logout" title="Log Out">
            ${icons.logOut}
          </button>
        </div>
      </aside>

      <!-- Main Layout -->
      <main class="main-wrapper">
        <!-- Top Bar -->
        <header class="topbar">
          <div class="topbar-left">
            <h1 class="page-title">${getViewTitle(state.activeView)}</h1>
          </div>

          <div class="topbar-right">
            <!-- WebSocket Status Indicator -->
            <div class="ws-status-pill ${state.socketStatus}">
              <span class="radar-dot"></span>
              <span>${state.socketStatus === "connected" ? "Live Connected" : state.socketStatus === "connecting" ? "Reconnecting..." : "Offline Stream"}</span>
            </div>

            <!-- Refresh Button -->
            <button class="btn-secondary" id="btn-refresh" title="Refresh Data" style="padding: 7px 12px; font-size: 0.8125rem;">
              ${icons.refreshCw}
              <span>Refresh</span>
            </button>

            <!-- Notifications Dropdown -->
            <div class="notif-dropdown-wrapper">
              <button class="btn-icon-notif" id="btn-notif-toggle">
                ${icons.bell}
                ${unreadNotifs > 0 ? `<span class="notif-unread-dot"></span>` : ""}
              </button>
              <div class="notif-dropdown" id="notif-dropdown">
                <div class="notif-dropdown-header">
                  <span class="notif-dropdown-title">Notifications (${unreadNotifs} unread)</span>
                  ${unreadNotifs > 0 ? `<button class="btn-chip" id="btn-mark-all-read" style="padding: 2px 6px;">Mark all read</button>` : ""}
                </div>
                <div class="notif-list">
                  ${
                    state.notifications.length === 0
                      ? `<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.8125rem;">No notifications yet</div>`
                      : state.notifications
                          .slice(0, 15)
                          .map(
                            (n) => `
                        <div class="notif-item ${!n.is_read ? "unread" : ""}" data-id="${n.id}">
                          <div class="notif-content">
                            <div class="notif-item-title">${escapeHtml(n.title)}</div>
                            <div class="notif-item-msg">${escapeHtml(n.message)}</div>
                            <div class="notif-item-time">${formatDate(n.created_at)} • Cam #${n.camera_id}</div>
                          </div>
                        </div>
                      `
                          )
                          .join("")
                  }
                </div>
              </div>
            </div>
          </div>
        </header>

        <!-- Main View Area -->
        <section class="content-body" id="content-body">
          ${renderCurrentViewContent()}
        </section>
      </main>
    </div>

    <!-- Modals Container -->
    <div id="modal-container"></div>
  `;

  // Attach Sidebar Navigation clicks
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-view");
      if (view) {
        state.activeView = view;
        renderApp();
      }
    });
  });

  // Logout Click
  document.getElementById("btn-logout").addEventListener("click", () => {
    clearSession();
    state.user = null;
    realtimeSocket.disconnect();
    showToast("Signed Out", "You have been safely signed out.", "info");
    renderApp();
  });

  // Refresh Click
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    await loadInitialData();
    renderApp();
    showToast("Refreshed", "Latest data loaded from backend.", "info");
  });

  // Notification Toggle
  const notifBtn = document.getElementById("btn-notif-toggle");
  const notifDropdown = document.getElementById("notif-dropdown");
  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle("show");
  });
  document.addEventListener("click", () => notifDropdown.classList.remove("show"));

  // Mark all read
  const markAllBtn = document.getElementById("btn-mark-all-read");
  if (markAllBtn) {
    markAllBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await api.markAllNotificationsRead();
        state.notifications.forEach((n) => (n.is_read = true));
        renderApp();
        showToast("Success", "All notifications marked as read.", "success");
      } catch (err) {
        showToast("Error", err.message, "danger");
      }
    });
  }

  // Render Charts if on dashboard
  if (state.activeView === "dashboard") {
    setTimeout(() => {
      const healthCanvas = document.getElementById("chart-health-trend");
      const statusCanvas = document.getElementById("chart-camera-status");
      if (healthCanvas) {
        renderHealthTrendChart(healthCanvas, state.healthTrend);
      }
      if (statusCanvas) {
        renderCameraStatusChart(statusCanvas, state.dashboardSummary?.cameras);
      }
    }, 50);
  }

  // Attach view-specific actions
  attachViewEventListeners();
}

function getViewTitle(view) {
  switch (view) {
    case "dashboard":
      return "Overview & Fleet Analytics";
    case "cameras":
      return "Camera Fleet Management";
    case "events":
      return "Incidents & Telemetry Events";
    case "maintenance":
      return "Preventive Maintenance Tracker";
    case "simulator":
      return "ESP32 IoT Sensor Simulator";
    case "audit":
      return "System Audit Trail";
    default:
      return "Console";
  }
}

// ---------------------------------------------------------------------------
// VIEW CONTENTS
// ---------------------------------------------------------------------------

function renderCurrentViewContent() {
  switch (state.activeView) {
    case "dashboard":
      return renderDashboardContent();
    case "cameras":
      return renderCamerasContent();
    case "events":
      return renderEventsContent();
    case "maintenance":
      return renderMaintenanceContent();
    case "simulator":
      return renderSimulatorContent();
    case "audit":
      return renderAuditContent();
    default:
      return `<div>View not found</div>`;
  }
}

// 1. Dashboard Overview Content
function renderDashboardContent() {
  const sum = state.dashboardSummary || {
    cameras: { online: 0, offline: 0, error: 0, total: 0, avg_health_score: 100 },
    events: { open: 0, critical: 0, acknowledged: 0, total: 0 },
    maintenance: { pending: 0, in_progress: 0, completed: 0, total: 0 },
  };

  const avgHealth = sum.cameras?.avg_health_score ?? 100;

  return `
    <div class="dashboard-grid">
      <!-- Top Metrics Row -->
      <div class="metrics-row">
        <!-- Cameras Metric -->
        <div class="metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Active Fleet</span>
            <div class="metric-icon-wrap emerald">${icons.camera}</div>
          </div>
          <div class="metric-value">${sum.cameras.online} <span style="font-size: 1rem; font-weight: 500; color: var(--text-muted);">/ ${sum.cameras.total}</span></div>
          <div class="metric-footer">
            <span class="badge badge-online">${sum.cameras.online} Online</span>
            ${sum.cameras.error > 0 ? `<span class="badge badge-error">${sum.cameras.error} Dead/Error</span>` : ""}
            ${sum.cameras.offline > 0 ? `<span class="badge badge-offline">${sum.cameras.offline} Offline</span>` : ""}
          </div>
        </div>

        <!-- Average Health Score Metric -->
        <div class="metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Average Health Score</span>
            <div class="metric-icon-wrap blue">${icons.activity}</div>
          </div>
          <div class="metric-value">${avgHealth}%</div>
          <div class="metric-footer">
            <span class="badge ${avgHealth >= 80 ? "badge-online" : avgHealth >= 50 ? "badge-offline" : "badge-error"}">
              ${avgHealth >= 80 ? "Optimal Condition" : avgHealth >= 50 ? "Degraded" : "Critical Attention"}
            </span>
          </div>
        </div>

        <!-- Open Anomalies & Events -->
        <div class="metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Open Anomalies</span>
            <div class="metric-icon-wrap rose">${icons.alertTriangle}</div>
          </div>
          <div class="metric-value">${sum.events.open}</div>
          <div class="metric-footer">
            ${sum.events.critical > 0 ? `<span class="badge badge-critical">${sum.events.critical} Critical</span>` : `<span style="color: var(--color-success); font-weight: 600;">No critical alerts</span>`}
          </div>
        </div>

        <!-- Maintenance Status -->
        <div class="metric-card">
          <div class="metric-card-header">
            <span class="metric-label">Pending Maintenance</span>
            <div class="metric-icon-wrap amber">${icons.wrench}</div>
          </div>
          <div class="metric-value">${sum.maintenance.pending}</div>
          <div class="metric-footer">
            <span>${sum.maintenance.in_progress} in progress • ${sum.maintenance.completed} completed</span>
          </div>
        </div>
      </div>

      <!-- Charts Section -->
      <div class="charts-row">
        <!-- 7-Day Health Trend -->
        <div class="chart-card">
          <div class="card-title-bar">
            <div>
              <div class="card-title">7-Day Fleet Health & Anomaly Trends</div>
              <div class="card-subtitle">Daily aggregate camera health scores against detected anomalies</div>
            </div>
          </div>
          <div class="chart-canvas-container">
            <canvas id="chart-health-trend"></canvas>
          </div>
        </div>

        <!-- Camera Status Breakdown -->
        <div class="chart-card">
          <div class="card-title-bar">
            <div>
              <div class="card-title">Fleet Connectivity</div>
              <div class="card-subtitle">Camera operational states</div>
            </div>
          </div>
          <div class="chart-canvas-container" style="height: 220px;">
            <canvas id="chart-camera-status"></canvas>
          </div>
        </div>
      </div>

      <!-- Quick Tables Row -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
        <!-- Recent Critical Alerts -->
        <div class="table-card">
          <div class="table-header-bar">
            <span class="card-title">Recent Critical Incidents</span>
            <button class="btn-chip" data-goto="events">View All</button>
          </div>
          <div class="table-responsive">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Camera</th>
                  <th>Severity</th>
                  <th>Event</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${
                  (() => {
                    const unresolvedEvents = state.events.filter((e) => (e.event_status || "DETECTED").toUpperCase() !== "RESOLVED");
                    if (unresolvedEvents.length === 0) {
                      return `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">No active incidents detected. Fleet running healthy.</td></tr>`;
                    }
                    return unresolvedEvents
                      .slice(0, 5)
                      .map(
                        (ev) => `
                        <tr>
                          <td>
                            <strong>${escapeHtml(ev.device_id || `Cam #${ev.camera_id}`)}</strong>
                            <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(ev.location || "")}</div>
                          </td>
                          <td><span class="badge badge-${(ev.severity || "LOW").toLowerCase()}">${ev.severity}</span></td>
                          <td>${escapeHtml(ev.event_type)}</td>
                          <td><span class="badge badge-${(ev.event_status || "DETECTED").toLowerCase()}">${ev.event_status}</span></td>
                        </tr>
                      `
                      )
                      .join("");
                  })()
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Cameras Quick Status -->
        <div class="table-card">
          <div class="table-header-bar">
            <span class="card-title">Registered Cameras Status</span>
            <button class="btn-chip" data-goto="cameras">Manage Fleet</button>
          </div>
          <div class="table-responsive">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Status</th>
                  <th>Health Score</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                ${
                  state.cameras.length === 0
                    ? `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">No cameras registered. Click "Cameras Fleet" to add.</td></tr>`
                    : state.cameras
                        .slice(0, 5)
                        .map(
                          (cam) => `
                      <tr>
                        <td>
                          <strong>${escapeHtml(cam.device_id)}</strong>
                          <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(cam.location)}</div>
                        </td>
                        <td><span class="badge badge-${(cam.status || "offline").toLowerCase()}">${cam.status || "offline"}</span></td>
                        <td>
                          <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-weight: 700; font-size: 0.8125rem;">${cam.health_score != null ? Math.round(cam.health_score) : 100}%</span>
                          </div>
                        </td>
                        <td style="font-size: 0.75rem; color: var(--text-muted);">${formatRelativeTime(cam.last_seen)}</td>
                      </tr>
                    `
                        )
                        .join("")
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 2. Cameras Fleet View
function renderCamerasContent() {
  const filteredCameras = state.cameras.filter((cam) => {
    const matchStatus = state.cameraFilter === "all" || (cam.status || "offline").toLowerCase() === state.cameraFilter.toLowerCase();
    const matchSearch =
      !state.cameraSearch ||
      cam.device_id.toLowerCase().includes(state.cameraSearch.toLowerCase()) ||
      cam.location.toLowerCase().includes(state.cameraSearch.toLowerCase());
    return matchStatus && matchSearch;
  });

  return `
    <div>
      <div class="filter-bar">
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <div class="search-input-wrap">
            <span class="search-icon">${icons.search}</span>
            <input type="text" id="camera-search-input" class="search-input" placeholder="Search device ID or location..." value="${escapeHtml(state.cameraSearch)}" />
          </div>

          <div style="display: flex; gap: 0.25rem; background: var(--bg-surface); padding: 3px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <button class="btn-chip ${state.cameraFilter === "all" ? "active" : ""}" data-cam-filter="all">All (${state.cameras.length})</button>
            <button class="btn-chip ${state.cameraFilter === "online" ? "active" : ""}" data-cam-filter="online">Online</button>
            <button class="btn-chip ${state.cameraFilter === "offline" ? "active" : ""}" data-cam-filter="offline">Offline</button>
            <button class="btn-chip ${state.cameraFilter === "dead" ? "active" : ""}" data-cam-filter="dead">Dead / Error</button>
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          ${
            state.user.role === "admin"
              ? `
            <button class="btn-primary" id="btn-add-camera">
              ${icons.plus}
              <span>Register Camera</span>
            </button>
          `
              : ""
          }
        </div>
      </div>

      <!-- Camera Cards Grid -->
      ${
        filteredCameras.length === 0
          ? `
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 3rem; text-align: center;">
          <div style="color: var(--text-muted); margin-bottom: 0.5rem;">${icons.camera}</div>
          <h3 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">No Cameras Found</h3>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.25rem;">
            ${state.cameras.length === 0 ? "No cameras have been registered in the system yet." : "No cameras matched your filter criteria."}
          </p>
          ${
            state.user.role === "admin" && state.cameras.length === 0
              ? `
            <button class="btn-primary" id="btn-add-camera-empty" style="margin-top: 1rem;">
              ${icons.plus} Register First Camera
            </button>
          `
              : ""
          }
        </div>
      `
          : `
        <div class="camera-grid">
          ${filteredCameras
            .map((cam) => {
              const score = cam.health_score != null ? Math.round(cam.health_score) : 100;
              const scoreClass = score >= 80 ? "healthy" : score >= 50 ? "warning" : "critical";
              const isOnline = cam.status === "online" || cam.status === "active";

              return `
              <div class="camera-card" data-cam-id="${cam.id}">
                <div class="camera-card-top">
                  <div>
                    <div class="camera-card-id">${escapeHtml(cam.device_id)}</div>
                    <div class="camera-card-location">
                      ${icons.video}
                      <span>${escapeHtml(cam.location)}</span>
                    </div>
                  </div>
                  <span class="badge badge-${(cam.status || "offline").toLowerCase()}">
                    <span class="radar-dot" style="animation: ${isOnline ? "pulse 2s infinite" : "none"};"></span>
                    ${cam.status || "offline"}
                  </span>
                </div>

                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
                  IP: <span style="font-family: 'JetBrains Mono', monospace;">${cam.ip_address || "DHCP / Unset"}</span>
                </div>

                <div class="health-bar-wrapper">
                  <div class="health-bar-label">
                    <span>Hardware Health</span>
                    <span style="font-weight: 700;">${score}%</span>
                  </div>
                  <div class="health-bar-track">
                    <div class="health-bar-fill ${scoreClass}" style="width: ${score}%;"></div>
                  </div>
                </div>

                <div class="camera-card-footer">
                  <span>Last Seen: <strong>${formatRelativeTime(cam.last_seen)}</strong></span>
                  <div style="display: flex; gap: 0.25rem;">
                    <button class="btn-chip" data-test-ping="${cam.id}" title="Test Ping Heartbeat">Ping WS</button>
                    <button class="btn-chip" data-sim-cam="${cam.device_id}" title="Send Test Telemetry">Simulate</button>
                  </div>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `
      }
    </div>
  `;
}

// 3. Events & Incidents View
function renderEventsContent() {
  const filteredEvents = state.events.filter((ev) => {
    const matchSev = state.eventSeverityFilter === "all" || (ev.severity || "").toUpperCase() === state.eventSeverityFilter.toUpperCase();
    const st = (ev.event_status || "DETECTED").toUpperCase();
    let matchStatus = true;
    if (state.eventStatusFilter === "unresolved") {
      matchStatus = st !== "RESOLVED";
    } else if (state.eventStatusFilter === "all") {
      matchStatus = true;
    } else {
      matchStatus = st === state.eventStatusFilter.toUpperCase();
    }
    return matchSev && matchStatus;
  });

  return `
    <div>
      <div class="filter-bar">
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <!-- Severity Filter -->
          <div style="display: flex; gap: 0.25rem; background: var(--bg-surface); padding: 3px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <button class="btn-chip ${state.eventSeverityFilter === "all" ? "active" : ""}" data-ev-sev="all">All Severities</button>
            <button class="btn-chip ${state.eventSeverityFilter === "CRITICAL" ? "active" : ""}" data-ev-sev="CRITICAL">Critical</button>
            <button class="btn-chip ${state.eventSeverityFilter === "HIGH" ? "active" : ""}" data-ev-sev="HIGH">High</button>
            <button class="btn-chip ${state.eventSeverityFilter === "MEDIUM" ? "active" : ""}" data-ev-sev="MEDIUM">Medium</button>
            <button class="btn-chip ${state.eventSeverityFilter === "LOW" ? "active" : ""}" data-ev-sev="LOW">Low</button>
          </div>

          <!-- Status Filter -->
          <div style="display: flex; gap: 0.25rem; background: var(--bg-surface); padding: 3px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <button class="btn-chip ${state.eventStatusFilter === "unresolved" ? "active" : ""}" data-ev-stat="unresolved">Active (Unresolved)</button>
            <button class="btn-chip ${state.eventStatusFilter === "DETECTED" ? "active" : ""}" data-ev-stat="DETECTED">Detected</button>
            <button class="btn-chip ${state.eventStatusFilter === "ACKNOWLEDGED" ? "active" : ""}" data-ev-stat="ACKNOWLEDGED">Acknowledged</button>
            <button class="btn-chip ${state.eventStatusFilter === "RESOLVED" ? "active" : ""}" data-ev-stat="RESOLVED">Resolved History</button>
            <button class="btn-chip ${state.eventStatusFilter === "all" ? "active" : ""}" data-ev-stat="all">All</button>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Event & Camera</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Environmental Sensor Readout</th>
                <th>ML Prediction</th>
                <th>Recorded At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${
                filteredEvents.length === 0
                  ? `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">No events match your selected filters.</td></tr>`
                  : filteredEvents
                      .map(
                        (ev) => `
                    <tr>
                      <td>
                        <strong>${escapeHtml(ev.event_type.replace(/_/g, " ").toUpperCase())}</strong>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                          ${escapeHtml(ev.device_id || `Cam #${ev.camera_id}`)} • ${escapeHtml(ev.location || "")}
                        </div>
                        ${ev.description ? `<div style="font-size: 0.7rem; color: var(--color-danger); margin-top: 2px;">${escapeHtml(ev.description)}</div>` : ""}
                      </td>
                      <td><span class="badge badge-${(ev.severity || "LOW").toLowerCase()}">${ev.severity}</span></td>
                      <td><span class="badge badge-${(ev.event_status || "DETECTED").toLowerCase()}">${ev.event_status}</span></td>
                      <td>
                        <div class="sensor-chips">
                          ${ev.temperature != null ? `<span class="sensor-chip">${icons.thermometer} ${ev.temperature}°C</span>` : ""}
                          ${ev.voltage != null ? `<span class="sensor-chip">${icons.zap} ${ev.voltage}V</span>` : ""}
                          ${ev.current_ma != null ? `<span class="sensor-chip">${icons.zap} ${ev.current_ma}mA</span>` : ""}
                          ${ev.water_level != null ? `<span class="sensor-chip" style="${ev.water_level >= 4100 ? 'color: #b45309; background: #fef3c7; border-color: #fde68a;' : 'color: #0284c7; background: #e0f2fe; border-color: #bae6fd;'}">${icons.droplet} Water: ${ev.water_level}${ev.water_level >= 4100 ? ' (Minor)' : ''}</span>` : ""}
                          ${ev.tilt != null ? `<span class="sensor-chip" style="color: #d97706; background: #fef3c7; border-color: #fde68a;">Tilt: ${ev.tilt}°</span>` : ""}
                          ${ev.humidity != null ? `<span class="sensor-chip">${icons.droplet} ${ev.humidity}%</span>` : ""}
                          ${ev.vibration != null ? `<span class="sensor-chip">${icons.wind} Vib: ${ev.vibration}</span>` : ""}
                          ${ev.dust != null ? `<span class="sensor-chip">Dust: ${ev.dust}</span>` : ""}
                        </div>
                      </td>
                      <td>
                        ${
                          ev.prediction
                            ? `<span class="badge badge-info" style="font-family: 'JetBrains Mono', monospace; font-size: 0.7rem;">${escapeHtml(ev.prediction)}</span>`
                            : `<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>`
                        }
                      </td>
                      <td style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(ev.created_at)}</td>
                      <td>
                        <div style="display: flex; gap: 0.35rem;">
                          ${
                            ev.event_status === "DETECTED"
                              ? `<button class="btn-chip" data-ev-action="ACKNOWLEDGED" data-id="${ev.id}">Ack</button>`
                              : ""
                          }
                          ${
                            ev.event_status !== "RESOLVED"
                              ? `<button class="btn-chip" style="background: var(--color-success-bg); color: var(--color-success); border-color: var(--color-success-border);" data-ev-action="RESOLVED" data-id="${ev.id}">Resolve</button>`
                              : `<span style="font-size: 0.75rem; color: var(--color-success); font-weight: 600;">Resolved</span>`
                          }
                          ${
                            state.user.role === "admin"
                              ? `<button class="btn-chip" style="color: var(--color-danger);" data-ev-delete="${ev.id}">${icons.trash}</button>`
                              : ""
                          }
                        </div>
                      </td>
                    </tr>
                  `
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 4. Maintenance View
function renderMaintenanceContent() {
  return `
    <div>
      <div class="filter-bar">
        <h2 style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">Service & Work Orders</h2>
        ${
          state.user.role === "admin" || state.user.role === "operator"
            ? `
          <button class="btn-primary" id="btn-schedule-maint">
            ${icons.plus}
            <span>Schedule Maintenance</span>
          </button>
        `
            : ""
        }
      </div>

      <div class="table-card">
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Camera</th>
                <th>Type</th>
                <th>Status</th>
                <th>Recommendation</th>
                <th>Assigned Tech</th>
                <th>Date Scheduled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${
                state.maintenance.length === 0
                  ? `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">No maintenance records registered.</td></tr>`
                  : state.maintenance
                      .map(
                        (m) => `
                    <tr>
                      <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;">#MNT-${m.id}</td>
                      <td>
                        <strong>${escapeHtml(m.device_id || `Cam #${m.camera_id}`)}</strong>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(m.location || "")}</div>
                      </td>
                      <td><strong>${escapeHtml(m.maintenance_type)}</strong></td>
                      <td><span class="badge badge-${(m.status || "PENDING").toLowerCase()}">${m.status}</span></td>
                      <td style="max-width: 250px; font-size: 0.8125rem; color: var(--text-secondary);">${escapeHtml(m.recommendation || "Regular Inspection")}</td>
                      <td>${escapeHtml(m.performed_by_name || m.performed_by || "Unassigned")}</td>
                      <td style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(m.maintenance_date)}</td>
                      <td>
                        ${
                          m.status !== "COMPLETED"
                            ? `<button class="btn-chip" data-maint-complete="${m.id}">Mark Done</button>`
                            : `<span style="font-size: 0.75rem; color: var(--color-success); font-weight: 600;">Completed</span>`
                        }
                      </td>
                    </tr>
                  `
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 5. IoT Sensor Telemetry Simulator (Interactive Tester)
function renderSimulatorContent() {
  const cameraOptions = state.cameras
    .map((c) => `<option value="${escapeHtml(c.device_id)}">${escapeHtml(c.device_id)} (${escapeHtml(c.location)})</option>`)
    .join("");

  return `
    <div style="max-width: 840px; margin: 0 auto;">
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); padding: 1.75rem; box-shadow: var(--shadow-card);">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
          <div style="width: 42px; height: 42px; border-radius: var(--radius-lg); background: var(--brand-50); color: var(--brand-600); display: flex; align-items: center; justify-content: center;">
            ${icons.cpu}
          </div>
          <div>
            <h2 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary);">ESP32 Hardware Telemetry Simulator</h2>
            <p style="font-size: 0.8125rem; color: var(--text-secondary);">
              Simulate real-time sensor packets sent from CCTV microcontrollers to test anomaly alerts, health score degradation, and WebSocket notifications.
            </p>
          </div>
        </div>

        <!-- Presets Buttons -->
        <div style="margin-bottom: 1.5rem; background: var(--bg-surface-subtle); padding: 0.75rem 1rem; border-radius: var(--radius-md);">
          <div style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem;">Quick Simulation Presets</div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn-chip" id="preset-normal">Normal (Optimal)</button>
            <button class="btn-chip" style="color: var(--color-danger); border-color: var(--color-danger-border);" id="preset-overheat">Overheating Alert (>60°C)</button>
            <button class="btn-chip" style="color: #92400e; border-color: var(--color-warning-border);" id="preset-humidity">High Humidity (>80%)</button>
            <button class="btn-chip" style="color: #991b1b; border-color: var(--color-danger-border);" id="preset-voltage">Critical Voltage Spike (6.2V)</button>
            <button class="btn-chip" style="color: var(--brand-600);" id="preset-vibration">Vibration & Dust Hazard</button>
          </div>
        </div>

        <form id="sim-form" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label class="form-label">Target Camera Device ID</label>
            ${
              state.cameras.length > 0
                ? `<select id="sim-device-id" class="form-input">${cameraOptions}</select>`
                : `<input type="text" id="sim-device-id" class="form-input" placeholder="e.g. CAM-001" value="CAM-001" required />`
            }
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Temperature (°C) [Threshold: 60°C]</label>
              <input type="number" step="0.1" id="sim-temp" class="form-input" value="38.5" required />
            </div>
            <div class="form-group">
              <label class="form-label">Humidity (%) [Threshold: 80%]</label>
              <input type="number" step="0.1" id="sim-humidity" class="form-input" value="45.0" required />
            </div>
            <div class="form-group">
              <label class="form-label">Voltage (V) [Safe: 4.5V - 5.5V]</label>
              <input type="number" step="0.01" id="sim-voltage" class="form-input" value="5.02" required />
            </div>
            <div class="form-group">
              <label class="form-label">Vibration (units) [-5 pts / unit]</label>
              <input type="number" step="0.1" id="sim-vibration" class="form-input" value="0.2" required />
            </div>
            <div class="form-group">
              <label class="form-label">Dust Concentration (units)</label>
              <input type="number" step="1" id="sim-dust" class="form-input" value="12" required />
            </div>
            <div class="form-group">
              <label class="form-label">Ambient Light (Lux)</label>
              <input type="number" step="1" id="sim-light" class="form-input" value="450" required />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">ML Defect Prediction (Optional Tag)</label>
            <input type="text" id="sim-prediction" class="form-input" placeholder="e.g. lens_smudge, moisture_condensation, normal" value="" />
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 0.5rem;">
            <button type="submit" class="btn-primary" id="btn-send-sim">
              ${icons.send}
              <span>Transmit Sensor Telemetry Packet</span>
            </button>
          </div>
        </form>

        <!-- Response output box -->
        <div id="sim-response-box" style="margin-top: 1.5rem; display: none;">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">Backend Processing Ingestion:</div>
          <pre id="sim-output-pre" style="background: var(--bg-surface-subtle); padding: 1rem; border-radius: var(--radius-md); font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; overflow-x: auto; border: 1px solid var(--border-subtle);"></pre>
        </div>
      </div>
    </div>
  `;
}

// 6. Audit Trail View (Admin only)
function renderAuditContent() {
  return `
    <div>
      <div class="table-card">
        <div class="table-header-bar">
          <span class="card-title">Audit Logs (Compliance & Actions)</span>
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Actor User</th>
                <th>Action</th>
                <th>Entity Target</th>
                <th>Details Payload</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${
                state.auditLogs.length === 0
                  ? `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">No audit logs recorded yet.</td></tr>`
                  : state.auditLogs
                      .map(
                        (a) => `
                    <tr>
                      <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;">#${a.id}</td>
                      <td><strong>${escapeHtml(a.user_name || a.user_id || "System")}</strong></td>
                      <td><span class="badge badge-info" style="font-family: 'JetBrains Mono', monospace;">${escapeHtml(a.action)}</span></td>
                      <td>${escapeHtml(a.entity_type || "-")} ${a.entity_id ? `(#${a.entity_id})` : ""}</td>
                      <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${a.details ? escapeHtml(JSON.stringify(a.details)) : "-"}
                      </td>
                      <td style="font-size: 0.75rem; color: var(--text-muted);">${formatDate(a.created_at)}</td>
                    </tr>
                  `
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// EVENT LISTENERS & MODALS
// ---------------------------------------------------------------------------

function attachViewEventListeners() {
  // Quick navigation buttons from dashboard
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeView = btn.getAttribute("data-goto");
      renderApp();
    });
  });

  // Cameras View Handlers
  const camSearchInput = document.getElementById("camera-search-input");
  if (camSearchInput) {
    camSearchInput.addEventListener("input", (e) => {
      state.cameraSearch = e.target.value;
      const body = document.getElementById("content-body");
      if (body) body.innerHTML = renderCurrentViewContent();
      attachViewEventListeners();
    });
  }

  document.querySelectorAll("[data-cam-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.cameraFilter = btn.getAttribute("data-cam-filter");
      renderApp();
    });
  });

  // Add Camera Modal
  const addCamBtn = document.getElementById("btn-add-camera") || document.getElementById("btn-add-camera-empty");
  if (addCamBtn) {
    addCamBtn.addEventListener("click", () => openAddCameraModal());
  }

  // Ping test
  document.querySelectorAll("[data-test-ping]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const camId = btn.getAttribute("data-test-ping");
      showToast("Ping Sent", `Heartbeat check initiated for Camera #${camId}...`, "info");
    });
  });

  // Simulate shortcut
  document.querySelectorAll("[data-sim-cam]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const devId = btn.getAttribute("data-sim-cam");
      state.activeView = "simulator";
      renderApp();
      setTimeout(() => {
        const select = document.getElementById("sim-device-id");
        if (select) select.value = devId;
      }, 50);
    });
  });

  // Events Filters
  document.querySelectorAll("[data-ev-sev]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.eventSeverityFilter = btn.getAttribute("data-ev-sev");
      renderApp();
    });
  });

  document.querySelectorAll("[data-ev-stat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.eventStatusFilter = btn.getAttribute("data-ev-stat");
      renderApp();
    });
  });

  // Event Actions (Ack / Resolve)
  document.querySelectorAll("[data-ev-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const targetStatus = btn.getAttribute("data-ev-action");
      try {
        await api.updateEventStatus(id, targetStatus);
        showToast("Status Updated", `Event #${id} marked as ${targetStatus}.`, "success");
        await loadInitialData();
        renderApp();
      } catch (err) {
        showToast("Error", err.message, "danger");
      }
    });
  });

  // Delete event
  document.querySelectorAll("[data-ev-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-ev-delete");
      if (confirm(`Delete Event #${id}?`)) {
        try {
          await api.deleteEvent(id);
          showToast("Deleted", `Event #${id} deleted.`, "info");
          await loadInitialData();
          renderApp();
        } catch (err) {
          showToast("Error", err.message, "danger");
        }
      }
    });
  });

  // Maintenance complete
  document.querySelectorAll("[data-maint-complete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-maint-complete");
      try {
        await api.updateMaintenance(id, { status: "COMPLETED", remarks: "Completed verified via console" });
        showToast("Maintenance Completed", `Work Order #${id} closed.`, "success");
        await loadInitialData();
        renderApp();
      } catch (err) {
        showToast("Error", err.message, "danger");
      }
    });
  });

  // Schedule Maintenance Modal
  const schedMaintBtn = document.getElementById("btn-schedule-maint");
  if (schedMaintBtn) {
    schedMaintBtn.addEventListener("click", () => openScheduleMaintenanceModal());
  }

  // Telemetry Simulator Handlers
  const simForm = document.getElementById("sim-form");
  if (simForm) {
    // Preset buttons
    document.getElementById("preset-normal")?.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("sim-temp").value = "36.2";
      document.getElementById("sim-humidity").value = "45";
      document.getElementById("sim-voltage").value = "5.0";
      document.getElementById("sim-vibration").value = "0.1";
      document.getElementById("sim-dust").value = "10";
      document.getElementById("sim-prediction").value = "normal";
    });

    document.getElementById("preset-overheat")?.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("sim-temp").value = "68.5";
      document.getElementById("sim-humidity").value = "50";
      document.getElementById("sim-voltage").value = "5.0";
      document.getElementById("sim-vibration").value = "0.5";
      document.getElementById("sim-dust").value = "15";
      document.getElementById("sim-prediction").value = "overheating";
    });

    document.getElementById("preset-humidity")?.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("sim-temp").value = "42.0";
      document.getElementById("sim-humidity").value = "88.0";
      document.getElementById("sim-voltage").value = "5.0";
      document.getElementById("sim-vibration").value = "0.2";
      document.getElementById("sim-dust").value = "10";
      document.getElementById("sim-prediction").value = "condensation_risk";
    });

    document.getElementById("preset-voltage")?.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("sim-temp").value = "40.0";
      document.getElementById("sim-humidity").value = "40";
      document.getElementById("sim-voltage").value = "6.15";
      document.getElementById("sim-vibration").value = "0.1";
      document.getElementById("sim-dust").value = "10";
      document.getElementById("sim-prediction").value = "power_surge";
    });

    document.getElementById("preset-vibration")?.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("sim-temp").value = "45.0";
      document.getElementById("sim-humidity").value = "40";
      document.getElementById("sim-voltage").value = "5.0";
      document.getElementById("sim-vibration").value = "8.5";
      document.getElementById("sim-dust").value = "85";
      document.getElementById("sim-prediction").value = "mechanical_instability";
    });

    simForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const devIdEl = document.getElementById("sim-device-id");
      const deviceId = devIdEl ? devIdEl.value.trim() : "CAM-001";
      const payload = {
        device_id: deviceId,
        temperature: parseFloat(document.getElementById("sim-temp").value),
        humidity: parseFloat(document.getElementById("sim-humidity").value),
        voltage: parseFloat(document.getElementById("sim-voltage").value),
        vibration: parseFloat(document.getElementById("sim-vibration").value),
        dust: parseFloat(document.getElementById("sim-dust").value),
        light: parseFloat(document.getElementById("sim-light").value),
        prediction: document.getElementById("sim-prediction").value.trim() || null,
      };

      const btn = document.getElementById("btn-send-sim");
      try {
        btn.disabled = true;
        btn.textContent = "Transmitting...";
        const res = await api.sendTelemetry(payload);
        const box = document.getElementById("sim-response-box");
        const pre = document.getElementById("sim-output-pre");
        box.style.display = "block";
        pre.textContent = JSON.stringify(res, null, 2);

        if (res.event_created) {
          showToast("Anomaly Detected!", `Event #${res.event_id} logged with calculated health: ${res.health_score}%.`, "warning");
        } else {
          showToast("Telemetry Ingested", `Camera ${deviceId} updated. Health: ${res.health_score}%.`, "success");
        }
        await loadInitialData();
      } catch (err) {
        showToast("Telemetry Error", err.message, "danger");
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${icons.send} <span>Transmit Sensor Telemetry Packet</span>`;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// MODALS
// ---------------------------------------------------------------------------

function openAddCameraModal() {
  const container = document.getElementById("modal-container");
  container.innerHTML = `
    <div class="modal-overlay show" id="modal-add-cam">
      <div class="modal-dialog">
        <div class="modal-header">
          <span class="modal-title">Register New Camera</span>
          <button class="toast-close" id="btn-close-modal">${icons.x}</button>
        </div>
        <form id="form-add-camera">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Device Identifier (Unique Hardware ID)</label>
              <input type="text" id="m-device-id" class="form-input" placeholder="e.g. CAM-ZONE1-01" required />
            </div>
            <div class="form-group">
              <label class="form-label">Physical Location</label>
              <input type="text" id="m-location" class="form-input" placeholder="e.g. North Perimeter Gate 4" required />
            </div>
            <div class="form-group">
              <label class="form-label">IP Address</label>
              <input type="text" id="m-ip" class="form-input" placeholder="e.g. 192.168.1.120" />
            </div>
            <div class="form-group">
              <label class="form-label">Assigned Operator / Supervisor ID</label>
              <input type="text" id="m-operator" class="form-input" placeholder="e.g. ${state.user.id}" value="${state.user.id}" required />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="btn-cancel-modal">Cancel</button>
            <button type="submit" class="btn-primary">Register Camera</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const close = () => {
    container.innerHTML = "";
  };
  document.getElementById("btn-close-modal").addEventListener("click", close);
  document.getElementById("btn-cancel-modal").addEventListener("click", close);

  document.getElementById("form-add-camera").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      device_id: document.getElementById("m-device-id").value.trim(),
      location: document.getElementById("m-location").value.trim(),
      ip_address: document.getElementById("m-ip").value.trim() || null,
      operator_id: document.getElementById("m-operator").value.trim(),
    };

    try {
      await api.createCamera(payload);
      showToast("Camera Registered", `Device ${payload.device_id} successfully created.`, "success");
      close();
      await loadInitialData();
      renderApp();
    } catch (err) {
      showToast("Registration Failed", err.message, "danger");
    }
  });
}

function openScheduleMaintenanceModal() {
  const container = document.getElementById("modal-container");
  const camOptions = state.cameras
    .map((c) => `<option value="${c.id}">${escapeHtml(c.device_id)} (${escapeHtml(c.location)})</option>`)
    .join("");

  container.innerHTML = `
    <div class="modal-overlay show" id="modal-sched-maint">
      <div class="modal-dialog">
        <div class="modal-header">
          <span class="modal-title">Schedule Camera Maintenance</span>
          <button class="toast-close" id="btn-close-modal">${icons.x}</button>
        </div>
        <form id="form-sched-maint">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Target Camera</label>
              <select id="m-maint-cam-id" class="form-input" required>
                ${camOptions || `<option value="">No cameras registered</option>`}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Maintenance Type</label>
              <input type="text" id="m-maint-type" class="form-input" placeholder="e.g. Lens Cleaning & Housing Seal Inspection" required />
            </div>
            <div class="form-group">
              <label class="form-label">Recommendations & Procedures</label>
              <textarea id="m-maint-rec" class="form-input" rows="3" placeholder="Check power cable contacts and clean optical dome."></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Field Technician / Performed By (User ID)</label>
              <input type="text" id="m-maint-tech" class="form-input" placeholder="e.g. ${state.user.id}" value="${state.user.id}" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="btn-cancel-modal">Cancel</button>
            <button type="submit" class="btn-primary">Create Record</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const close = () => {
    container.innerHTML = "";
  };
  document.getElementById("btn-close-modal").addEventListener("click", close);
  document.getElementById("btn-cancel-modal").addEventListener("click", close);

  document.getElementById("form-sched-maint").addEventListener("submit", async (e) => {
    e.preventDefault();
    const camId = parseInt(document.getElementById("m-maint-cam-id").value, 10);
    if (!camId) {
      showToast("Validation Error", "Please select a valid camera.", "danger");
      return;
    }
    const payload = {
      camera_id: camId,
      maintenance_type: document.getElementById("m-maint-type").value.trim(),
      recommendation: document.getElementById("m-maint-rec").value.trim() || null,
      performed_by: document.getElementById("m-maint-tech").value.trim() || state.user.id,
    };

    try {
      await api.createMaintenance(payload);
      showToast("Maintenance Logged", `Work order created for Camera #${camId}.`, "success");
      close();
      await loadInitialData();
      renderApp();
    } catch (err) {
      showToast("Scheduling Failed", err.message, "danger");
    }
  });
}

// ---------------------------------------------------------------------------
// DATA INITIALIZATION & REALTIME SYNC
// ---------------------------------------------------------------------------

async function loadInitialData() {
  if (!state.user) return;
  try {
    const [summary, trend, cameras, events, maintenance, notifs] = await Promise.all([
      api.getDashboardSummary().catch(() => null),
      api.getHealthTrend().catch(() => []),
      api.getCameras().catch(() => []),
      api.getEvents({ limit: 50 }).catch(() => []),
      api.getMaintenance().catch(() => []),
      api.getNotifications({ limit: 30 }).catch(() => []),
    ]);

    state.dashboardSummary = summary;
    state.healthTrend = trend;
    state.cameras = cameras;
    state.events = events;
    state.maintenance = maintenance;
    state.notifications = notifs;

    if (state.user.role === "admin") {
      state.auditLogs = await api.getAuditLogs({ limit: 30 }).catch(() => []);
    }
  } catch (err) {
    console.error("Error loading dashboard data:", err);
  }
}

function initRealtime() {
  realtimeSocket.connect();

  realtimeSocket.onStatusChange((status) => {
    state.socketStatus = status;
    const pill = document.querySelector(".ws-status-pill");
    if (pill) {
      pill.className = `ws-status-pill ${status}`;
      pill.innerHTML = `<span class="radar-dot"></span><span>${status === "connected" ? "Live Connected" : status === "connecting" ? "Reconnecting..." : "Offline Stream"}</span>`;
    }
  });

  realtimeSocket.onMessage((msg) => {
    console.log("[Sentinel WS Message]", msg);

    if (msg.type === "notification") {
      showToast(msg.title || "Critical Camera Alert", msg.message || "Alert received", (msg.severity || "info").toLowerCase());
      // Refresh notifications & summary
      loadInitialData().then(() => renderApp());
    } else if (msg.type === "camera_status") {
      showToast("Heartbeat Status Update", `Camera #${msg.camera_id} is now ${msg.status.toUpperCase()}`, msg.status === "active" ? "success" : "danger");
      // Update local camera status directly
      const cam = state.cameras.find((c) => c.id === msg.camera_id);
      if (cam) cam.status = msg.status === "active" ? "online" : "dead";
      loadInitialData().then(() => renderApp());
    } else if (msg.type === "telemetry") {
      // Live telemetry ingestion packet from hardware
      const cam = state.cameras.find((c) => c.id === msg.camera_id || c.device_id === msg.device_id);
      if (cam) {
        cam.status = "online";
        cam.health_score = msg.health_score;
        cam.last_seen = new Date().toISOString();
      }
      loadInitialData().then(() => renderApp());
    }
  });
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return "Never";
  const diffSec = Math.floor((new Date() - new Date(isoStr)) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// Global 401 unauthorized listener
window.addEventListener("sentinel:unauthorized", () => {
  state.user = null;
  showToast("Session Expired", "Please sign in again to continue.", "warning");
  renderApp();
});

// ---------------------------------------------------------------------------
// BOOTSTRAP APP
// ---------------------------------------------------------------------------

async function init() {
  renderApp(); // Render loading or auth view first

  // JWT Verification Flow
  if (authState.token) {
    try {
      const user = await api.verifyToken();
      if (user) {
        state.user = user;
        initRealtime();
        await loadInitialData();
        renderApp();
        return;
      }
    } catch {
      clearSession();
    }
  }

  // If no valid session
  renderApp();
}

init();
