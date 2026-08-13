import React from 'react';
import { ShieldAlert, Thermometer, Zap, Activity } from 'lucide-react';

export default function EventsList({ events }) {
  const getSeverityBadge = (sev) => {
    switch (sev) {
      case 'CRITICAL': return { bg: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', border: 'rgba(244, 63, 94, 0.3)' };
      case 'HIGH': return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
      case 'MEDIUM': return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
      default: return { bg: 'rgba(100, 116, 139, 0.15)', color: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' };
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={20} color="var(--accent-rose)" />
            Real-Time Anomaly & Telemetry Events
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            ESP32 device environmental telemetry and anomaly detection triggers
          </p>
        </div>
      </div>

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Event ID</th>
              <th>Camera Device</th>
              <th>Severity</th>
              <th>Event Type</th>
              <th>Telemetry Metrics</th>
              <th>Description</th>
              <th>Detected At</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No telemetry anomalies recorded.
                </td>
              </tr>
            ) : (
              events.map((ev) => {
                const badge = getSeverityBadge(ev.severity);
                return (
                  <tr key={ev.id}>
                    <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>EVT-{ev.id}</td>
                    <td>
                      <div style={{ fontWeight: '600', color: '#fff' }}>{ev.device_id || `Cam #${ev.camera_id}`}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ev.location}</div>
                    </td>
                    <td>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`
                      }}>
                        {ev.severity}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', fontWeight: '600' }}>{ev.event_type}</td>
                    <td style={{ fontSize: '0.75rem' }}>
                      {ev.temperature && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '10px', color: '#fb7185' }}>
                          <Thermometer size={12} /> {ev.temperature}°C
                        </span>
                      )}
                      {ev.voltage && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '10px', color: '#fbbf24' }}>
                          <Zap size={12} /> {ev.voltage}V
                        </span>
                      )}
                      {ev.vibration && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#38bdf8' }}>
                          <Activity size={12} /> {ev.vibration}g
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {ev.description || 'Routine hardware update'}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {ev.created_at ? new Date(ev.created_at).toLocaleString() : 'Just now'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
