// src/components/AlertPanel.tsx — Real-time alert sidebar
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Shield, Waves, Wind, Zap, X, Check } from 'lucide-react';
import clsx from 'clsx';
import { useDrishtiStore } from '../store/useDrishtiStore';
import axios from 'axios';
import type { Alert, Priority, ThreatType } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const PRIORITY_STYLES: Record<Priority, string> = {
  CRITICAL: 'border-red-500 bg-red-950/40',
  HIGH:     'border-orange-500 bg-orange-950/30',
  MEDIUM:   'border-yellow-500 bg-yellow-950/20',
  LOW:      'border-blue-500 bg-blue-950/20',
};

const PRIORITY_BADGE: Record<Priority, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH:     'bg-orange-600 text-white',
  MEDIUM:   'bg-yellow-600 text-black',
  LOW:      'bg-blue-600 text-white',
};

const THREAT_ICON: Record<ThreatType, React.ReactNode> = {
  INTRUSION:      <Shield size={14} />,
  AIR_INCURSION:  <Wind size={14} />,
  MARITIME:       <Waves size={14} />,
  SEISMIC_ANOMALY:<Zap size={14} />,
  MULTI_MODAL:    <AlertTriangle size={14} />,
  CYBER:          <AlertTriangle size={14} />,
  UNKNOWN:        <AlertTriangle size={14} />,
};

type Tab = 'ALL' | Priority;
const TABS: Tab[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function AlertPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('ALL');
  const alerts = useDrishtiStore((s) => s.alerts);
  const acknowledgeAlert = useDrishtiStore((s) => s.acknowledgeAlert);
  const selectEvent = useDrishtiStore((s) => s.selectEvent);
  const events = useDrishtiStore((s) => s.events);

  const filtered = alerts.filter((a) => {
    if (a.status !== 'ACTIVE') return false;
    if (activeTab === 'ALL') return true;
    return a.priority === activeTab;
  });

  async function handleAcknowledge(alert: Alert) {
    try {
      await axios.patch(`${API_URL}/api/v1/alerts/${alert.id}/acknowledge`, {
        acknowledged_by: 'OPERATOR',
      });
      acknowledgeAlert(alert.id);
    } catch {
      // optimistic update anyway
      acknowledgeAlert(alert.id);
    }
  }

  function handleSelectAlert(alert: Alert) {
    if (alert.threat_event_id) {
      const event = events.find((e) => e.id === alert.threat_event_id);
      if (event) selectEvent(event);
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border-l border-slate-700">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-200">ACTIVE ALERTS</span>
        <span className="text-xs bg-red-600 text-white rounded-full px-2 py-0.5">
          {filtered.length}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/80 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'text-xs px-3.5 py-2 whitespace-nowrap transition-colors font-bold tracking-wide',
              activeTab === tab
                ? 'text-white border-b-2 border-cyan-500 bg-slate-800/90'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Alert List */}
      <div className="flex-1 overflow-y-auto space-y-2 p-2">
        {filtered.length === 0 && (
          <div className="text-center text-slate-500 text-xs mt-8">
            No active alerts
          </div>
        )}
        {filtered.map((alert) => (
          <div
            key={alert.id}
            onClick={() => handleSelectAlert(alert)}
            className={clsx(
              'rounded-lg border p-2.5 cursor-pointer transition-all hover:opacity-90',
              PRIORITY_STYLES[alert.priority],
              alert.priority === 'CRITICAL' && 'animate-pulse-border'
            )}
          >
            {/* Priority badge + type icon */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded', PRIORITY_BADGE[alert.priority])}>
                  {alert.priority}
                </span>
                {alert.threat_type && (
                  <span className="text-slate-400">
                    {THREAT_ICON[alert.threat_type as ThreatType]}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleAcknowledge(alert); }}
                className="text-slate-500 hover:text-green-400 transition-colors"
                title="Acknowledge"
              >
                <Check size={13} />
              </button>
            </div>

            {/* Title */}
            <div className="text-xs text-slate-200 font-medium leading-tight mb-1">
              {alert.title}
            </div>

            {/* Message */}
            <div className="text-[11px] text-slate-400 leading-snug mb-1.5">
              {alert.message}
            </div>

            {/* Threat score bar */}
            {alert.threat_score !== undefined && (
              <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-1.5">
                <div
                  className={clsx('h-full rounded-full transition-all', {
                    'bg-red-500': alert.priority === 'CRITICAL',
                    'bg-orange-500': alert.priority === 'HIGH',
                    'bg-yellow-500': alert.priority === 'MEDIUM',
                    'bg-blue-500': alert.priority === 'LOW',
                  })}
                  style={{ width: `${(alert.threat_score * 100).toFixed(0)}%` }}
                />
              </div>
            )}

            {/* Time */}
            <div className="text-[10px] text-slate-500">
              {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
