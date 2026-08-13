import React from 'react';
import { Shield, User, Wrench, RefreshCw, LogOut } from 'lucide-react';

export default function Navbar({ currentUser, onOpenMaintenanceModal, onRefresh, onLogout }) {
  return (
    <header className="glass-panel" style={{ borderRadius: '0 0 16px 16px', marginBottom: '24px', padding: '16px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(56, 189, 248, 0.4)'
          }}>
            <Shield size={24} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.5px', background: 'linear-gradient(90deg, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Sentinel<span style={{ background: 'linear-gradient(90deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '500' }}>
              Camera Health & Predictive Maintenance Platform
            </p>
          </div>
        </div>

        {/* User Profile Badge & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          
          {/* User Profile Info */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(255,255,255,0.04)',
            padding: '8px 14px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
              <User size={16} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#ffffff' }}>
                {currentUser?.name || currentUser?.username || 'Authenticated User'}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: '600', textTransform: 'uppercase' }}>
                ID: {currentUser?.id} ({currentUser?.role || 'operator'})
              </div>
            </div>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={onRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>

          <button className="btn btn-primary" onClick={onOpenMaintenanceModal}>
            <Wrench size={16} /> Record Maintenance
          </button>

          <button className="btn btn-danger btn-sm" onClick={onLogout} title="Sign Out">
            <LogOut size={14} /> Sign Out
          </button>
        </div>

      </div>
    </header>
  );
}
