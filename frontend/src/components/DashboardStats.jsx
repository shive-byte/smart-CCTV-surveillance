import React from 'react';
import { Camera, CheckCircle2, AlertTriangle, ShieldAlert, Activity } from 'lucide-react';

export default function DashboardStats({ stats }) {
  const cards = [
    {
      title: 'Total Cameras',
      value: stats.totalCameras,
      icon: Camera,
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.1)',
      subtitle: 'System registered nodes'
    },
    {
      title: 'Online Cameras',
      value: stats.onlineCameras,
      icon: CheckCircle2,
      color: '#34d399',
      bg: 'rgba(52, 211, 153, 0.1)',
      subtitle: `${Math.round((stats.onlineCameras / (stats.totalCameras || 1)) * 100)}% online rate`
    },
    {
      title: 'Offline / Warning',
      value: stats.offlineCameras,
      icon: AlertTriangle,
      color: '#fbbf24',
      bg: 'rgba(251, 191, 36, 0.1)',
      subtitle: 'Requires technical review'
    },
    {
      title: 'Active Events',
      value: stats.openEvents,
      icon: ShieldAlert,
      color: '#f43f5e',
      bg: 'rgba(244, 63, 94, 0.1)',
      subtitle: 'Telemetry anomaly logs'
    },
    {
      title: 'Average Health',
      value: `${stats.avgHealth}%`,
      icon: Activity,
      color: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.1)',
      subtitle: 'Global hardware score'
    }
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '16px',
      marginBottom: '28px'
    }}>
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div key={i} className="glass-panel glass-card-interactive" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {card.title}
              </span>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: card.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: card.color
              }}>
                <Icon size={20} />
              </div>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.5px' }}>
              {card.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {card.subtitle}
            </div>
          </div>
        );
      })}
    </div>
  );
}
