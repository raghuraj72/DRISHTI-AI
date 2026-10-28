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
  Send,
  CheckCircle2,
  Radio,
  Crosshair,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import clsx from 'clsx';
import { useDrishtiStore } from '../store/useDrishtiStore';
import { playTacticalPing } from '../utils/audioAlert';
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
  const [selectedSOP, setSelectedSOP] = useState<string>('IAF_CAP');
  const [dispatchResult, setDispatchResult] = useState<{ code: string; sop: string; time: string } | null>(null);

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
          'relative w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-slate-900 rounded-2xl border font-sans',
          'animate-fade-in text-slate-100 shadow-2xl',
          PRIORITY_GLOW[e.priority]
        )}
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div
              className={clsx('p-2.5 rounded-xl', {
                'bg-red-900/50 text-red-400': e.priority === 'CRITICAL',
                'bg-orange-900/50 text-orange-400': e.priority === 'HIGH',
                'bg-yellow-900/50 text-yellow-400': e.priority === 'MEDIUM',
                'bg-blue-900/50 text-blue-400': e.priority === 'LOW',
              })}
            >
              {THREAT_ICONS[e.threat_type]}
            </div>
            <div>
              <div className="font-extrabold text-slate-100 text-base font-mono tracking-wide">
                [{e.priority}] {e.threat_type.replace(/_/g, ' ')}
              </div>
              <div className="text-sm text-slate-400 mt-0.5">
                {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
              </div>
            </div>
          </div>
          <button
            onClick={() => selectEvent(null)}
            className="text-slate-400 hover:text-slate-200 transition p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 text-sm">
          {/* Threat Score Bar */}
          <div>
            <div className="flex justify-between text-slate-400 mb-1.5 font-mono text-xs">
              <span className="font-semibold">CORRELATED THREAT SCORE</span>
              <span
                className={clsx('font-bold text-sm', {
                  'text-red-400': e.priority === 'CRITICAL',
                  'text-orange-400': e.priority === 'HIGH',
                  'text-yellow-400': e.priority === 'MEDIUM',
                  'text-blue-400': e.priority === 'LOW',
                })}
              >
                {threatScore}%
              </span>
            </div>
            <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
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
          <div className="grid grid-cols-2 gap-3 bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl font-mono">
            <div>
              <div className="text-slate-400 text-xs flex items-center gap-1.5">
                <MapPin size={14} className="text-cyan-400" />
                <span className="font-semibold">COORDINATES</span>
              </div>
              <div className="text-slate-200 font-bold text-sm mt-1">
                {e.location.lat.toFixed(4)}°N, {e.location.lon.toFixed(4)}°E
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-xs flex items-center gap-1.5">
                <Users size={14} className="text-amber-400" />
                <span className="font-semibold">CONFIRMED ENTITIES</span>
              </div>
              <div className="text-slate-200 font-bold text-sm mt-1">{e.entity_count} Target(s)</div>
            </div>
          </div>

          {/* Modalities */}
          <div>
            <div className="text-slate-400 mb-2 font-mono text-xs uppercase tracking-wider font-semibold">
              Corroborating Modalities
            </div>
            <div className="flex flex-wrap gap-2">
              {(Array.isArray(e.modalities) ? e.modalities : [e.modalities]).map((mod) => (
                <span
                  key={mod}
                  className={clsx(
                    'text-xs px-3 py-1 rounded-md font-mono font-bold',
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
            <div className="bg-slate-950/40 border border-slate-800 p-3.5 rounded-xl">
              <div className="text-slate-400 text-xs font-mono uppercase mb-1.5 font-semibold">Telemetry Assessment</div>
              <p className="text-slate-200 leading-relaxed text-sm">{e.description}</p>
            </div>
          )}

          {/* Tactical Intercept Vector Calculator Drawer */}
          <div className="border border-cyan-500/30 rounded-xl p-4 bg-cyan-950/20">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-cyan-300 font-mono font-bold text-sm">
                <Compass className="w-5 h-5 text-cyan-400" />
                <span>TACTICAL INTERCEPT CALCULATOR</span>
              </div>
              <button
                onClick={() => setShowIntercept(!showIntercept)}
                className="text-xs font-mono font-semibold text-cyan-400 hover:text-cyan-200 underline"
              >
                {showIntercept ? 'Hide Solution' : 'Compute Intercept'}
              </button>
            </div>

            {showIntercept && (
              <div className="space-y-2.5 pt-3 border-t border-cyan-500/20 font-mono text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Nearest Strategic Hub:</span>
                  <strong className="text-slate-100">{nearestBase.name}</strong>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Vector Distance:</span>
                  <strong className="text-amber-400 text-sm">{minDistance.toFixed(1)} km</strong>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2.5 pt-2.5 border-t border-slate-800">
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-semibold">AIR INTERCEPT (IAF)</span>
                    </div>
                    <div className="text-base font-extrabold text-cyan-300 mt-1">{jetMinutes} mins</div>
                    <div className="text-[10px] text-slate-400">Scramble @ Mach 1.2</div>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                    <div className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-semibold">GROUND QRT / PATROL</span>
                    </div>
                    <div className="text-base font-extrabold text-emerald-300 mt-1">{qrtMinutes} mins</div>
                    <div className="text-[10px] text-slate-400">Response @ 80 km/h</div>
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-lg border border-red-500/30 flex items-start gap-2 text-red-300 mt-2.5">
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <strong>Recommended SOP:</strong> Dispatch Quick Reaction Team (QRT) Vector Alpha. Alert forward observation post to illuminate target using laser designator / EO tracking.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tactical Countermeasure Response Authorization & Dispatch Matrix */}
          <div className="border border-red-500/40 rounded-xl p-4 bg-red-950/20 font-mono">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                <Crosshair className="w-5 h-5 text-red-400" />
                <span>COMMAND COUNTERMEASURE AUTHORIZATION MATRIX</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500 font-bold">
                OODA FAST-TRACK
              </span>
            </div>

            <p className="text-xs text-slate-300 font-sans mb-3">
              Select verified military countermeasure based on multi-modal threat classification. Authorizing logs an official dispatch directive with Integrated Defence Staff.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-3">
              {[
                { id: 'IAF_CAP', label: '✈️ Scramble IAF QRA CAP (Mach 1.2)', unit: 'IAF Forward Section' },
                { id: 'BSF_QRT', label: '🛡️ Dispatch BSF QRT Vector Alpha', unit: 'Border Security Force' },
                { id: 'EW_JAMMER', label: '⚡ Directional C-UAS EW Soft-Kill', unit: 'Army Electronic Warfare' },
                { id: 'RISAT_PASS', label: '🛰️ Priority Tasking: RISAT SAR Pass', unit: 'ISRO Defence Tasking' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedSOP(opt.id)}
                  className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between gap-1 ${
                    selectedSOP === opt.id
                      ? 'bg-red-950/90 border-red-500 text-white shadow-md'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold text-xs">{opt.label}</span>
                  <span className="text-[10px] text-slate-400 font-sans">{opt.unit}</span>
                </button>
              ))}
            </div>

            {dispatchResult ? (
              <div className="bg-emerald-950/70 border border-emerald-500 p-3 rounded-xl flex items-center justify-between text-xs text-emerald-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold">DISPATCH DIRECTIVE AUTHORIZED: {dispatchResult.code}</div>
                    <div className="text-[10px] text-slate-300 font-sans">
                      Unit acknowledged order at {dispatchResult.time}. Intercept clock active.
                    </div>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-900 px-2 py-0.5 rounded font-bold">STATUS: EN ROUTE</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  const code = `OP-CHETAK-${Math.floor(1000 + Math.random() * 9000)}`;
                  const nowStr = format(new Date(), 'HH:mm:ss');
                  setDispatchResult({ code, sop: selectedSOP, time: nowStr });
                  playTacticalPing('DISPATCH');
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-lg transition tracking-wider"
              >
                <Send className="w-4 h-4" />
                <span>AUTHORIZE & DISPATCH COUNTERMEASURE DIRECTIVE</span>
              </button>
            )}
          </div>

          {/* Timestamp */}
          <div className="text-xs text-slate-500 font-mono border-t border-slate-800 pt-3 flex justify-between">
            <span>TIMESTAMP: {format(new Date(e.occurred_at), 'dd MMM yyyy HH:mm:ss')} UTC</span>
            <span className="text-emerald-500 font-bold">VERIFIED TARGET</span>
          </div>
        </div>
      </div>
    </div>
  );
}
