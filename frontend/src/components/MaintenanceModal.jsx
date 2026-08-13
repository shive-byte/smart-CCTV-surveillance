import React, { useState, useEffect } from 'react';
import { X, Wrench, AlertCircle, CheckCircle, UserCheck, Camera } from 'lucide-react';
import { api } from '../services/api';

export default function MaintenanceModal({ isOpen, onClose, currentUser, mockCameras, onSubmitSuccess }) {
  const [userCameras, setUserCameras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    camera_id: '',
    maintenance_type: 'ROUTINE_INSPECTION',
    recommendation: '',
    remarks: '',
    next_maintenance: ''
  });

  // Fetch only cameras respective to the active user when modal opens or active user changes
  useEffect(() => {
    if (!isOpen) return;

    async function loadUserCameras() {
      setLoading(true);
      setError(null);
      try {
        // Call backend API /maintenance/user-cameras?user_id=...
        const cameras = await api.getUserCamerasForMaintenance(currentUser.id);
        setUserCameras(cameras);
        if (cameras.length > 0) {
          setFormData(prev => ({ ...prev, camera_id: cameras[0].id }));
        } else {
          setFormData(prev => ({ ...prev, camera_id: '' }));
        }
      } catch (err) {
        console.warn('API error fetching user cameras, using user filtered mock data:', err.message);
        // Fallback filter mock cameras by current user's operator_id (or all for admin if requested)
        const filteredMock = currentUser.role === 'admin' 
          ? mockCameras 
          : mockCameras.filter(c => c.operator_id === currentUser.id);
        
        setUserCameras(filteredMock);
        if (filteredMock.length > 0) {
          setFormData(prev => ({ ...prev, camera_id: filteredMock[0].id }));
        }
      } finally {
        setLoading(false);
      }
    }

    loadUserCameras();
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.camera_id) {
      setError('Please select a camera assigned to your user account.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      camera_id: Number(formData.camera_id),
      maintenance_type: formData.maintenance_type,
      recommendation: formData.recommendation || null,
      remarks: formData.remarks || null,
      performed_by: currentUser.id,
      next_maintenance: formData.next_maintenance ? new Date(formData.next_maintenance).toISOString() : null
    };

    try {
      await api.createMaintenanceRecord(payload);
      onSubmitSuccess(payload);
      onClose();
    } catch (err) {
      // In case server is offline or returned error
      console.warn('Backend submit notice, creating record locally:', err.message);
      onSubmitSuccess(payload);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <Wrench size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#fff' }}>
                New Maintenance Record
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Register service log for your assigned cameras
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* User context notification badge */}
        <div style={{
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <UserCheck size={20} color="#38bdf8" />
          <div style={{ fontSize: '0.8rem' }}>
            <span style={{ color: '#fff', fontWeight: '700' }}>Active Operator Scope: </span>
            <span style={{ color: '#38bdf8', fontWeight: '600' }}>{currentUser.name} ({currentUser.id})</span>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '2px' }}>
              Showing only cameras registered/assigned to your account.
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '16px',
            color: '#fda4af',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          
          {/* Camera Selection Dropdown */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Select Camera (Respective to {currentUser.name})</span>
              <span style={{ color: '#38bdf8' }}>{userCameras.length} Available</span>
            </label>
            
            {loading ? (
              <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading user cameras...</div>
            ) : userCameras.length === 0 ? (
              <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', color: '#fbbf24', fontSize: '0.85rem' }}>
                No cameras currently assigned to user {currentUser.id} ({currentUser.name}).
              </div>
            ) : (
              <select
                className="form-control"
                value={formData.camera_id}
                onChange={(e) => setFormData({ ...formData, camera_id: e.target.value })}
                required
              >
                {userCameras.map(cam => (
                  <option key={cam.id} value={cam.id}>
                    {cam.device_id} - {cam.location} (Health: {cam.health_score}%)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Maintenance Type */}
          <div className="form-group">
            <label className="form-label">Maintenance Type</label>
            <select
              className="form-control"
              value={formData.maintenance_type}
              onChange={(e) => setFormData({ ...formData, maintenance_type: e.target.value })}
            >
              <option value="ROUTINE_INSPECTION">Routine Inspection & Cleaning</option>
              <option value="HARDWARE_REPAIR">Hardware Repair / Part Replacement</option>
              <option value="FIRMWARE_UPDATE">Firmware & Software Update</option>
              <option value="SENSOR_CALIBRATION">Sensor Recalibration</option>
              <option value="EMERGENCY_SERVICING">Emergency Servicing</option>
            </select>
          </div>

          {/* Recommendation */}
          <div className="form-group">
            <label className="form-label">Technician Recommendation</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Clean lens housing, replace thermal sensor in 30 days"
              value={formData.recommendation}
              onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
            />
          </div>

          {/* Next Scheduled Maintenance */}
          <div className="form-group">
            <label className="form-label">Next Maintenance Date</label>
            <input
              type="date"
              className="form-control"
              value={formData.next_maintenance}
              onChange={(e) => setFormData({ ...formData, next_maintenance: e.target.value })}
            />
          </div>

          {/* Remarks */}
          <div className="form-group">
            <label className="form-label">Field Remarks</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Additional findings, voltage readings, or environment observations..."
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            />
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || userCameras.length === 0}
            >
              {submitting ? 'Saving...' : 'Submit Maintenance Entry'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
