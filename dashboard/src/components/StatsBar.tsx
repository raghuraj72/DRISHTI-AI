// src/components/StatsBar.tsx — Top tactical command strip
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  Crosshair,
  Bot,
  FileText,
  Activity,
  Zap,
  Satellite,
} from 'lucide-react';
import { useDrishtiStore } from '../store/useDrishtiStore';
import { DEFCONBadge } from './DEFCONBadge';
import { toggleAudioMute, getAudioMute } from '../utils/audioAlert';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';

const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const THREAT_COLORS: Record<string, string> = {
  Intrusions: '#ef4444',
  Air: '#f97316',
  Maritime: '#3b82f6',
  Seismic: '#eab308',
  'Multi-modal': '#a855f7',
};

interface Props {
  isConnected: boolean;
  onOpenSimulator: () => void;
  onOpenCopilot: () => void;
  onOpenSitrep: () => void;
  onOpenSensors: () => void;
  onOpenSeismic: () => void;
  onOpenSatellite: () => void;
}

export function StatsBar({
  isConnected,
  onOpenSimulator,
  onOpenCopilot,
  onOpenSitrep,
  onOpenSensors,
  onOpenSeismic,
  onOpenSatellite,
}: Props) {
  const stats = useDrishtiStore((s) => s.stats);
  const [clock, setClock] = useState('');
  const [isMuted, setIsMuted] = useState(getAudioMute());

  useEffect(() => {
    const tick = () => setClock(IST_FORMATTER.format(new Date()) + ' IST');
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleToggleAudio = () => {
    const updated = toggleAudioMute();
    setIsMuted(updated);
  };

  const pieData = [
    { name: 'Intrusions', value: stats.total_intrusions },
    { name: 'Air', value: stats.total_air },
    { name: 'Maritime', value: stats.total_maritime },
    { name: 'Seismic', value: stats.total_seismic },
    { name: 'Multi-modal', value: stats.total_multimodal },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex items-center gap-3 bg-slate-950/95 border-b border-slate-800 px-4 py-2 select-none z-20">
      {/* Brand Logo */}
      <div className="flex items-center gap-2 mr-1">
        <div className="p-1 rounded bg-red-950 border border-red-500/50">
          <AlertTriangle size={16} className="text-red-500 animate-pulse" />
        </div>
        <div>
          <span className="font-bold text-sm text-slate-100 tracking-widest uppercase font-mono">
            DRISHTI<span className="text-red-500">-AI</span>
          </span>
          <span className="hidden lg:inline text-[9px] text-cyan-400 font-mono ml-2 border border-cyan-800/60 bg-cyan-950/40 px-1 py-0.5 rounded">
            RYIC 2026 TRL-8
          </span>
        </div>
      </div>

      {/* DEFCON Dynamic Status Badge */}
      <DEFCONBadge />

      {/* Stat pills */}
      <StatPill label="Threats (24h)" value={stats.threats_24h} color="text-white" />
      <StatPill label="CRITICAL" value={stats.critical_24h} color="text-red-400" />
      <StatPill label="HIGH" value={stats.high_24h} color="text-orange-400" />

      {/* Mini Pie chart */}
      {pieData.length > 0 && (
        <div className="hidden xl:block w-14 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={16} strokeWidth={0}>
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={THREAT_COLORS[entry.name] ?? '#64748b'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 10 }}
                formatter={(v: number, name: string) => [v, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Tactical Action Buttons */}
      <div className="flex items-center gap-2">
        {/* Audio HUD Chime Mute/Unmute */}
        <button
          onClick={handleToggleAudio}
          className={`p-1.5 rounded border transition ${
            isMuted
              ? 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'
              : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400'
          }`}
          title={isMuted ? 'Tactical Radar Audio Muted (Click to Unmute)' : 'Tactical Radar Audio Active (Click to Mute)'}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>

        {/* Multi-Modal Sensor Grid Telemetry Button */}
        <button
          onClick={onOpenSensors}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/60 text-emerald-300 hover:text-emerald-100 text-xs font-mono font-bold transition shadow-sm"
          title="Open Multi-Modal Sensor Grid Health & Ingestion Telemetry"
        >
          <Activity size={14} className="text-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">SENSOR GRID</span>
        </button>

        {/* Subterranean Seismic FFT Analyzer Button */}
        <button
          onClick={onOpenSeismic}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-950/80 hover:bg-yellow-900 border border-yellow-500/60 text-yellow-300 hover:text-yellow-100 text-xs font-mono font-bold transition shadow-sm"
          title="Open Subterranean Acoustic & Seismic Tunneling Frequency Analyzer"
        >
          <Zap size={14} className="text-yellow-400" />
          <span className="hidden sm:inline">SEISMIC INTEL</span>
        </button>

        {/* Sentinel-2 Multi-Spectral Camouflage Inspector Button */}
        <button
          onClick={onOpenSatellite}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-500/60 text-blue-300 hover:text-blue-100 text-xs font-mono font-bold transition shadow-sm"
          title="Open Sentinel-2 Multi-Spectral Camouflage Defeat & Surface Change Inspector"
        >
          <Satellite size={14} className="text-blue-400" />
          <span className="hidden sm:inline">SATELLITE INTEL</span>
        </button>

        {/* Wargame Simulator Button */}
        <button
          onClick={onOpenSimulator}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-500/60 text-red-300 hover:text-red-100 text-xs font-mono font-bold transition shadow-sm"
          title="Open Tactical Wargame Incursion Simulator (Jury Demo)"
        >
          <Crosshair size={14} className="text-red-400" />
          <span className="hidden sm:inline">WARGAME SIM</span>
        </button>

        {/* Tactical AI Copilot Button */}
        <button
          onClick={onOpenCopilot}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/60 text-cyan-300 hover:text-cyan-100 text-xs font-mono font-bold transition shadow-sm"
          title="Open Drishti AI Tactical Copilot (Gemini 3.8 Flash)"
        >
          <Bot size={14} className="text-cyan-400 animate-pulse" />
          <span className="hidden sm:inline">AI COPILOT</span>
        </button>

        {/* SITREP Export Button */}
        <button
          onClick={onOpenSitrep}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-mono font-semibold transition shadow-sm"
          title="Export Official Military Situation Report (Print / PDF)"
        >
          <FileText size={14} className="text-amber-400" />
          <span className="hidden sm:inline">SITREP</span>
        </button>
      </div>

      <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />

      {/* Clock */}
      <span className="text-[11px] text-slate-400 font-mono hidden md:inline">{clock}</span>

      {/* Live / Offline WebSocket indicator */}
      <div
        className={clsx(
          'flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded border',
          isConnected
            ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500/40'
            : 'text-red-400 bg-red-950/40 border-red-500/40'
        )}
      >
        {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span>{isConnected ? 'LIVE FEED' : 'OFFLINE'}</span>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center bg-slate-900 border border-slate-800 rounded px-2.5 py-0.5 min-w-[58px]">
      <span className={clsx('text-sm font-bold leading-none font-mono', color)}>{value}</span>
      <span className="text-[8px] text-slate-400 uppercase tracking-wider font-mono">{label}</span>
    </div>
  );
}
