import React from 'react';
import { Wrench, Calendar, User, CheckCircle2, Clock } from 'lucide-react';

export default function MaintenanceList({ records }) {
  return (
    <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wrench size={20} color="var(--accent-emerald)" />
            Maintenance Log History
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Service tickets, technician recommendations, and audit status
          </p>
        </div>
      </div>

      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Camera / Location</th>
              <th>Maintenance Type</th>
              <th>Status</th>
              <th>Performed By</th>
              <th>Log Date</th>
              <th>Recommendation & Remarks</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  No maintenance records logged yet.
                </td>
              </tr>
            ) : (
              records.map((rec) => (
                <tr key={rec.id}>
                  <td style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>#{rec.id}</td>
                  <td>
                    <div style={{ fontWeight: '600', color: '#fff' }}>{rec.device_id || `Cam #${rec.camera_id}`}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rec.location || 'Site Location'}</div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: '6px' }}>
                      {rec.maintenance_type}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${(rec.status || 'pending').toLowerCase()}`}>
                      {rec.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                      <User size={14} color="var(--accent-cyan)" />
                      {rec.performed_by_name || rec.performed_by || 'Unassigned'}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} color="var(--text-muted)" />
                      {rec.maintenance_date ? new Date(rec.maintenance_date).toLocaleDateString() : 'Today'}
                    </div>
                  </td>
                  <td style={{ maxWidth: '280px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <div><strong>Rec:</strong> {rec.recommendation || 'None'}</div>
                    {rec.remarks && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{rec.remarks}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
