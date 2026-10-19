// src/components/EventDetailModal.tsx — Detail modal with AI Tactical Intercept Vector Calculator
import React, { useState } from 'react';
import {
  X,
  MapPin,
  Shield,
  Zap,
  Waves,
  Wind,
  AlertTriangle,
  Users,
  Compass,
  Navigation,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import clsx from 'clsx';
import { useDrishtiStore } from '../store/useDrishtiStore';
import type { ThreatType, Priority } from '../types';

const THREAT_ICONS: Record<ThreatType, React.ReactNode> = {
  INTRUSION: <Shield size={20} />,
  AIR_INCURSION: <Wind size={20} />,
  MARITIME: <Waves size={20} />,
  SEISMIC_ANOMALY: <Zap size={20} />,
  MULTI_MODAL: <AlertTriangle size={20} />,
  CYBER: <AlertTriangle size={20} />,
  UNKNOWN: <AlertTriangle size={20} />,
};

const PRIORITY_GLOW: Record<Priority, string> = {
  CRITICAL: 'shadow-[0_0_24px_rgba(239,68,68,0.5)] border-red-500',
  HIGH: 'shadow-[0_0_20px_rgba(249,115,22,0.4)] border-orange-500',
  MEDIUM: 'shadow-[0_0_16px_rgba(234,179,8,0.3)] border-yellow-500',
  LOW: 'shadow-[0_0_12px_rgba(59,130,246,0.3)] border-blue-500',
};

const MODALITY_COLORS: Record<string, string> = {
  VIDEO: 'bg-purple-900/60 text-purple-300',
  SATELLITE: 'bg-blue-900/60 text-blue-300',
  ADS_B: 'bg-orange-900/60 text-orange-300',
  AIS: 'bg-cyan-900/60 text-cyan-300',
  SEISMIC: 'bg-yellow-900/60 text-yellow-300',
  RADAR: 'bg-green-900/60 text-green-300',
  HUMINT: 'bg-red-900/60 text-red-300',
};

// Strategic Bases for Intercept Calculation
const BASES = [
  { name: 'Leh Air Base (Northern Sector)', lat: 34.135, lon: 77.546, type: 'AIR' },
  { name: 'Srinagar AFS (LoC Command)', lat: 33.987, lon: 74.774, type: 'AIR' },
  { name: 'Jodhpur AFS (Desert Sector)', lat: 26.251, lon: 73.048, type: 'AIR' },
  { name: 'Jamnagar Naval Base (Maritime Sector)', lat: 22.464, lon: 70.012, type: 'SEA' },
  { name: 'Tezpur AFS (Eastern Command)', lat: 26.709, lon: 92.784, type: 'AIR' },
];

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function EventDetailModal() {
  const selectedEvent = useDrishtiStore((s) => s.selectedEvent);
  const selectEvent = useDrishtiStore((s) => s.selectEvent);
  const [showIntercept, setShowIntercept] = useState(false);

  if (!selectedEvent) return null;

  const e = selectedEvent;
  const threatScore = Math.round(e.threat_score * 100);

  // Compute nearest base
  let nearestBase = BASES[0]!;
  let minDistance = Infinity;

  BASES.forEach((b) => {
    const dist = haversineDistanceKm(e.location.lat, e.location.lon, b.lat, b.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearestBase = b;
    }
  });

  // Calculate Intercept Times
  const qrtMinutes = Math.round((minDistance / 80) * 60); // QRT Ground at 80 km/h
  const jetMinutes = Math.max(1, Math.round((minDistance / 1400) * 60)); // Air interceptor at Mach 1.2 (~1400 km/h)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={() => selectEvent(null)}
    >
      <div
        className={clsx(
          'relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-slate-900 rounded-xl border font-sans',
          'animate-fade-in text-slate-100 shadow-2xl',
          PRIORITY_GLOW[e.priority]
        )}
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={clsx('p-2 rounded-lg', {
                'bg-red-900/50 text-red-400': e.priority === 'CRITICAL',
                'bg-orange-900/50 text-orange-400': e.priority === 'HIGH',
                'bg-yellow-900/50 text-yellow-400': e.priority === 'MEDIUM',
                'bg-blue-900/50 text-blue-400': e.priority === 'LOW',
              })}
            >
              {THREAT_ICONS[e.threat_type]}
            </div>
            <div>
              <div className="font-bold text-slate-100 text-sm font-mono tracking-wide">
                [{e.priority}] {e.threat_type.replace(/_/g, ' ')}
              </div>
              <div className="text-xs text-slate-400">
                {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
              </div>
            </div>
          </div>
          <button
            onClick={() => selectEvent(null)}
            className="text-slate-400 hover:text-slate-200 transition p-1 rounded"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 text-xs">
          {/* Threat Score Bar */}
          <div>
            <div className="flex justify-between text-slate-400 mb-1 font-mono">
              <span>CORRELATED THREAT SCORE</span>
              <span
                className={clsx('font-bold', {
                  'text-red-400': e.priority === 'CRITICAL',
                  'text-orange-400': e.priority === 'HIGH',
                  'text-yellow-400': e.priority === 'MEDIUM',
                  'text-blue-400': e.priority === 'LOW',
                })}
              >
                {threatScore}%
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all', {
                  'bg-red-500': e.priority === 'CRITICAL',
                  'bg-orange-500': e.priority === 'HIGH',
                  'bg-yellow-500': e.priority === 'MEDIUM',
                  'bg-blue-500': e.priority === 'LOW',
                })}
                style={{ width: `${threatScore}%` }}
              />
            </div>
          </div>

          {/* Coordinates & Target Data */}
          <div className="grid grid-cols-2 gap-2 bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg font-mono">
            <div>
              <div className="text-slate-400 text-[10px] flex items-center gap-1">
                <MapPin size={12} className="text-cyan-400" />
                <span>COORDINATES</span>
              </div>
              <div className="text-slate-200 font-semibold mt-0.5">
                {e.location.lat.toFixed(4)}°N, {e.location.lon.toFixed(4)}°E
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-[10px] flex items-center gap-1">
                <Users size={12} className="text-amber-400" />
                <span>CONFIRMED ENTITIES</span>
              </div>
              <div className="text-slate-200 font-semibold mt-0.5">{e.entity_count} Target(s)</div>
            </div>
          </div>

          {/* Modalities */}
          <div>
            <div className="text-slate-400 mb-1.5 font-mono text-[10px] uppercase tracking-wider">
              Corroborating Modalities
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Array.isArray(e.modalities) ? e.modalities : [e.modalities]).map((mod) => (
                <span
                  key={mod}
                  className={clsx(
                    'text-[10px] px-2 py-0.5 rounded font-mono font-medium',
                    MODALITY_COLORS[mod] ?? 'bg-slate-800 text-slate-300'
                  )}
                >
                  {mod}
                </span>
              ))}
            </div>
          </div>

          {/* Description */}
          {e.description && (
            <div className="bg-slate-950/40 border border-slate-800 p-2.5 rounded-lg">
              <div className="text-slate-400 text-[10px] font-mono uppercase mb-1">Telemetry Assessment</div>
              <p className="text-slate-300 leading-relaxed">{e.description}</p>
            </div>
          )}

          {/* Tactical Intercept Vector Calculator Drawer */}
          <div className="border border-cyan-500/30 rounded-lg p-3 bg-cyan-950/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-cyan-300 font-mono font-bold">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span>TACTICAL INTERCEPT CALCULATOR</span>
              </div>
              <button
                onClick={() => setShowIntercept(!showIntercept)}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-200 underline"
              >
                {showIntercept ? 'Hide Solution' : 'Compute Intercept'}
              </button>
            </div>

            {showIntercept && (
              <div className="space-y-2 pt-2 border-t border-cyan-500/20 font-mono text-[11px]">
                <div className="flex justify-between text-slate-300">
                  <span>Nearest Strategic Hub:</span>
                  <strong className="text-slate-100">{nearestBase.name}</strong>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Vector Distance:</span>
                  <strong className="text-amber-400">{minDistance.toFixed(1)} km</strong>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span>AIR INTERCEPT (IAF)</span>
                    </div>
                    <div className="text-sm font-bold text-cyan-300 mt-0.5">{jetMinutes} mins</div>
                    <div className="text-[9px] text-slate-400">Scramble @ Mach 1.2</div>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Navigation className="w-3 h-3 text-emerald-400" />
                      <span>GROUND QRT / PATROL</span>
                    </div>
                    <div className="text-sm font-bold text-emerald-300 mt-0.5">{qrtMinutes} mins</div>
                    <div className="text-[9px] text-slate-400">Response @ 80 km/h</div>
                  </div>
                </div>

                <div className="bg-slate-900/90 p-2 rounded border border-red-500/30 flex items-start gap-1.5 text-red-300 mt-2">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-[10px] leading-relaxed">
                    <strong>Recommended SOP:</strong> Dispatch Quick Reaction Team (QRT) Vector Alpha. Alert forward observation post to illuminate target using laser designator / EO tracking.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Timestamp */}
          <div className="text-[10px] text-slate-500 font-mono border-t border-slate-800 pt-2 flex justify-between">
            <span>TIMESTAMP: {format(new Date(e.occurred_at), 'dd MMM yyyy HH:mm:ss')} UTC</span>
            <span className="text-emerald-500 font-bold">VERIFIED TARGET</span>
          </div>
        </div>
      </div>
    </div>
  );
}
