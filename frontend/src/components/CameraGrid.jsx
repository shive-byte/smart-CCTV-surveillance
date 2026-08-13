import React, { useState } from 'react';
import { Camera, HardDrive, Wifi, ShieldCheck, AlertCircle, Wrench, Search } from 'lucide-react';

export default function CameraGrid({ cameras, currentUser, onOpenMaintenanceForCamera }) {
  const [search, setSearch] = useState('');
  const [filterUserOnly, setFilterUserOnly] = useState(false);

  const filteredCameras = cameras.filter(c => {
    const matchesSearch = c.device_id.toLowerCase().includes(search.toLowerCase()) ||
                          c.location.toLowerCase().includes(search.toLowerCase());
    const matchesUser = filterUserOnly ? c.operator_id === currentUser.id : true;
    return matchesSearch && matchesUser;
  });

  return (
    <div style={{ marginBottom: '32px' }}>
      
      {/* Section Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={20} color="var(--accent-cyan)" />
            Camera Infrastructure Nodes ({filteredCameras.length})
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Real-time status, health metrics, and hardware assignment
          </p>
        </div>

        {/* Search & Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search camera or location..."
              className="form-control"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '34px', fontSize: '0.8rem', width: '220px' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filterUserOnly}
              onChange={(e) => setFilterUserOnly(e.target.checked)}
              style={{ accentColor: '#38bdf8' }}
            />
            Only My Respective Cameras ({currentUser.name})
          </label>
        </div>
      </div>

      {/* Grid of Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {filteredCameras.map((cam) => {
          const isUserOwned = cam.operator_id === currentUser.id;
          const healthScore = Number(cam.health_score || 100);
          
          let healthColor = '#34d399';
          if (healthScore < 50) healthColor = '#f43f5e';
          else if (healthScore < 80) healthColor = '#fbbf24';

          return (
            <div key={cam.id} className="glass-panel glass-card-interactive" style={{ padding: '18px', position: 'relative' }}>
              
              {/* Header Badge & Owner info */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span className={`badge badge-${cam.status}`}>
                  <span className={`dot ${cam.status === 'online' ? 'dot-pulse' : ''}`}></span>
                  {cam.status}
                </span>

                {isUserOwned && (
                  <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                    My Assigned
                  </span>
                )}
              </div>

              {/* Device Title & Location */}
              <div style={{ marginBottom: '14px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.2px' }}>
                  {cam.device_id}
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <HardDrive size={14} color="var(--text-muted)" />
                  {cam.location}
                </div>
              </div>

              {/* Health Score Meter */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '600', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Health Score</span>
                  <span style={{ color: healthColor }}>{healthScore}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${healthScore}%`, height: '100%', background: healthColor, transition: 'width 0.4s ease' }}></div>
                </div>
              </div>

              {/* Meta details */}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--border-color)', marginBottom: '14px' }}>
                <span>Operator: <strong style={{ color: 'var(--text-secondary)' }}>{cam.operator_name || cam.operator_id}</strong></span>
                <span>IP: <code style={{ color: 'var(--text-secondary)' }}>{cam.ip_address || '192.168.1.10'}</code></span>
              </div>

              {/* Action Button */}
              <button
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', opacity: isUserOwned || currentUser.role === 'admin' ? 1 : 0.6 }}
                onClick={() => onOpenMaintenanceForCamera(cam)}
                title={isUserOwned ? 'Register maintenance entry' : 'Requires operator access'}
              >
                <Wrench size={14} /> Log Maintenance
              </button>

            </div>
          );
        })}
      </div>

    </div>
  );
}
