import React, { useState } from 'react';
import { Shield, Lock, User, UserPlus, LogIn, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function AuthScreen({ onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form Fields
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: 'operator'
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (!formData.name || !formData.username || !formData.password) {
          throw new Error('Please complete all required fields.');
        }
        const data = await api.register(formData.name, formData.username, formData.password, formData.role);
        onAuthSuccess(data.user);
      } else {
        if (!formData.username || !formData.password) {
          throw new Error('Please enter username and password.');
        }
        const data = await api.login(formData.username, formData.password);
        onAuthSuccess(data.user);
      }
    } catch (err) {
      console.error('Authentication error:', err);
      setError(err.message || 'Authentication failed. Please check your credentials or backend server status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'radial-gradient(circle at 50% 20%, rgba(56, 189, 248, 0.15), transparent 70%), #0a0d14'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '36px',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
      }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)'
          }}>
            <Shield size={30} color="#ffffff" />
          </div>
          <h1 style={{
            fontSize: '1.6rem',
            fontWeight: '800',
            letterSpacing: '-0.5px',
            background: 'linear-gradient(90deg, #ffffff, #94a3b8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Sentinel<span style={{ background: 'linear-gradient(90deg, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI</span>
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {isSignUp ? 'Create your operational account' : 'Sign in to access camera health monitor'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '20px',
            color: '#fda4af',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          
          {/* Full Name field (Sign Up only) */}
          {isSignUp && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  name="name"
                  className="form-control"
                  placeholder="e.g. Alex Rivera"
                  value={formData.name}
                  onChange={handleChange}
                  style={{ paddingLeft: '38px' }}
                  required={isSignUp}
                />
              </div>
            </div>
          )}

          {/* Username */}
          <div className="form-group">
            <label className="form-label">Username</label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                name="username"
                className="form-control"
                placeholder="Enter your username"
                value={formData.username}
                onChange={handleChange}
                style={{ paddingLeft: '38px' }}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                name="password"
                className="form-control"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                style={{ paddingLeft: '38px' }}
                required
              />
            </div>
          </div>

          {/* Role Selector (Sign Up only) */}
          {isSignUp && (
            <div className="form-group">
              <label className="form-label">Operational Role</label>
              <select
                name="role"
                className="form-control"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="operator">Operator (Manages Assigned Cameras)</option>
                <option value="worker">Worker (Field Technician)</option>
                <option value="admin">System Administrator</option>
              </select>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '12px', padding: '12px', fontSize: '0.95rem' }}
          >
            {loading ? (
              'Authenticating...'
            ) : isSignUp ? (
              <>
                <UserPlus size={18} /> Create Account
              </>
            ) : (
              <>
                <LogIn size={18} /> Sign In
              </>
            )}
          </button>

        </form>

        {/* Toggle Mode Footer */}
        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {isSignUp ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setError(null); }}
                style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              Need a new account?{' '}
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setError(null); }}
                style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Sign Up
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
