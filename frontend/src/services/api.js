const BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:8000');

// Token helper
export const getToken = () => localStorage.getItem('token');
export const setToken = (token) => localStorage.getItem('token', token);

// Authenticated fetch wrapper
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errorData.detail || 'Request failed');
    }

    return await res.json();
  } catch (err) {
    console.warn(`API call ${endpoint} failed:`, err.message);
    throw err;
  }
}

export const api = {
  // Auth
  login: async (username, password) => {
    // Standard OAuth2 form submission for FastAPI
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'Invalid credentials' }));
      throw new Error(errData.detail || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    return data;
  },

  register: async (name, username, password, role = 'operator') => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password, role }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(errData.detail || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    return data;
  },

  getMe: () => request('/auth/me'),

  logout: () => {
    localStorage.removeItem('token');
  },


  // Dashboard
  getDashboardSummary: () => request('/dashboard/summary'),

  // Cameras
  getCameras: () => request('/cameras'),
  getAccessibleCameras: () => request('/cameras/accessible'),

  // Maintenance (Crucial requirement: User-specific cameras for maintenance entry)
  getUserCamerasForMaintenance: (userId) => {
    const query = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
    return request(`/maintenance/user-cameras${query}`);
  },
  getMaintenanceRecords: () => request('/maintenance'),
  createMaintenanceRecord: (data) =>
    request('/maintenance', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Events
  getEvents: () => request('/events'),

  // Users
  getUsers: () => request('/users'),
};
