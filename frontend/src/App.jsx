import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import DashboardStats from './components/DashboardStats';
import CameraGrid from './components/CameraGrid';
import MaintenanceList from './components/MaintenanceList';
import EventsList from './components/EventsList';
import MaintenanceModal from './components/MaintenanceModal';
import AuthScreen from './components/AuthScreen';
import { api, getToken } from './services/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [cameras, setCameras] = useState([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('cameras'); // 'cameras' | 'maintenance' | 'events'
  const [loadingData, setLoadingData] = useState(false);

  // Check auth session on startup
  useEffect(() => {
    async function checkAuth() {
      const token = getToken();
      if (!token) {
        setAuthChecking(false);
        return;
      }

      try {
        const user = await api.getMe();
        setCurrentUser(user);
      } catch (err) {
        console.warn('Session expired or invalid token:', err.message);
        api.logout();
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    }

    checkAuth();
  }, []);

  // Fetch real database data when user is authenticated
  const loadData = async () => {
    if (!currentUser) return;
    setLoadingData(true);

    try {
      // Get accessible cameras for current user
      const fetchedCams = await api.getCameras();
      setCameras(fetchedCams || []);
    } catch (e) {
      console.error('Error loading cameras:', e.message);
      setCameras([]);
    }

    try {
      const fetchedRecords = await api.getMaintenanceRecords();
      setMaintenanceRecords(fetchedRecords || []);
    } catch (e) {
      console.error('Error loading maintenance records:', e.message);
      setMaintenanceRecords([]);
    }

    try {
      const fetchedEvts = await api.getEvents();
      setEvents(fetchedEvts || []);
    } catch (e) {
      console.error('Error loading events:', e.message);
      setEvents([]);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  // Auth handler
  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setCameras([]);
    setMaintenanceRecords([]);
    setEvents([]);
  };

  // Callback when a new maintenance record is submitted
  const handleMaintenanceSubmitted = async () => {
    await loadData();
  };

  // Render loading screen during session check
  if (authChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
        fontSize: '0.9rem'
      }}>
        Verifying security session...
      </div>
    );
  }

  // Render Login / Sign Up screen if not logged in
  if (!currentUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  // Calculate live statistics
  const stats = {
    totalCameras: cameras.length,
    onlineCameras: cameras.filter(c => c.status === 'online').length,
    offlineCameras: cameras.filter(c => c.status !== 'online').length,
    openEvents: events.length,
    avgHealth: cameras.length > 0
      ? Math.round(cameras.reduce((acc, c) => acc + Number(c.health_score || 0), 0) / cameras.length)
      : 100
  };

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '40px' }}>
      
      {/* Navbar with authenticated user details & Logout */}
      <Navbar
        currentUser={currentUser}
        onOpenMaintenanceModal={() => setIsModalOpen(true)}
        onRefresh={loadData}
        onLogout={handleLogout}
      />

      {/* Main Content Container */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
        
        {/* KPI Dashboard Stats */}
        <DashboardStats stats={stats} />

        {/* View Tabs */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('cameras')}
            className={`btn ${activeTab === 'cameras' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Cameras Infrastructure ({cameras.length})
          </button>
          <button
            onClick={() => setActiveTab('maintenance')}
            className={`btn ${activeTab === 'maintenance' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Maintenance Logs ({maintenanceRecords.length})
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`btn ${activeTab === 'events' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Telemetry Alerts ({events.length})
          </button>
        </div>

        {/* Tab Views */}
        {loadingData ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading database metrics...
          </div>
        ) : (
          <>
            {activeTab === 'cameras' && (
              <CameraGrid
                cameras={cameras}
                currentUser={currentUser}
                onOpenMaintenanceForCamera={() => {
                  setIsModalOpen(true);
                }}
              />
            )}

            {activeTab === 'maintenance' && (
              <MaintenanceList records={maintenanceRecords} />
            )}

            {activeTab === 'events' && (
              <EventsList events={events} />
            )}
          </>
        )}

      </main>

      {/* Maintenance Record Modal (Fetches only cameras respective to active user) */}
      <MaintenanceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentUser={currentUser}
        mockCameras={cameras}
        onSubmitSuccess={handleMaintenanceSubmitted}
      />

    </div>
  );
}
