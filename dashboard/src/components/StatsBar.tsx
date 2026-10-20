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
    <div className="flex items-center gap-4 bg-slate-950/95 border-b border-slate-800 px-6 py-3.5 select-none z-20">
      {/* Brand Logo */}
      <div className="flex items-center gap-3 mr-2">
        <div className="p-2.5 rounded-xl bg-red-950 border border-red-500/70 shadow-lg">
          <AlertTriangle size={30} className="text-red-500 animate-pulse" />
        </div>
        <div>
          <span className="font-black text-2xl sm:text-3xl text-slate-100 tracking-widest uppercase font-mono">
            DRISHTI<span className="text-red-500">-AI</span>
          </span>
          <span className="hidden lg:inline text-sm text-cyan-300 font-mono font-bold ml-3 border border-cyan-600/80 bg-cyan-950/70 px-3 py-1 rounded-lg shadow-md">
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
        <div className="hidden xl:block w-20 h-14">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={24} strokeWidth={0}>
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={THREAT_COLORS[entry.name] ?? '#64748b'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 13 }}
                formatter={(v: number, name: string) => [v, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Tactical Action Buttons */}
      <div className="flex items-center gap-3">
        {/* Audio HUD Chime Mute/Unmute */}
        <button
          onClick={handleToggleAudio}
          className={`p-3 rounded-2xl border transition shadow-lg ${
            isMuted
              ? 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'
              : 'bg-emerald-950/80 border-emerald-500/70 text-emerald-400 shadow-md'
          }`}
          title={isMuted ? 'Tactical Radar Audio Muted (Click to Unmute)' : 'Tactical Radar Audio Active (Click to Mute)'}
        >
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </button>

        {/* Multi-Modal Sensor Grid Telemetry Button */}
        <button
          onClick={onOpenSensors}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/70 text-emerald-300 hover:text-emerald-100 text-base font-mono font-black tracking-wide transition shadow-lg hover:scale-[1.03]"
          title="Open Multi-Modal Sensor Grid Health & Ingestion Telemetry"
        >
          <Activity size={22} className="text-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">SENSOR GRID</span>
        </button>

        {/* Subterranean Seismic FFT Analyzer Button */}
        <button
          onClick={onOpenSeismic}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-yellow-950 hover:bg-yellow-900 border border-yellow-500/70 text-yellow-300 hover:text-yellow-100 text-base font-mono font-black tracking-wide transition shadow-lg hover:scale-[1.03]"
          title="Open Subterranean Acoustic & Seismic Tunneling Frequency Analyzer"
        >
          <Zap size={22} className="text-yellow-400" />
          <span className="hidden sm:inline">SEISMIC INTEL</span>
        </button>

        {/* Sentinel-2 Multi-Spectral Camouflage Inspector Button */}
        <button
          onClick={onOpenSatellite}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-blue-950 hover:bg-blue-900 border border-blue-500/70 text-blue-300 hover:text-blue-100 text-base font-mono font-black tracking-wide transition shadow-lg hover:scale-[1.03]"
          title="Open Sentinel-2 Multi-Spectral Camouflage Defeat & Surface Change Inspector"
        >
          <Satellite size={22} className="text-blue-400" />
          <span className="hidden sm:inline">SATELLITE INTEL</span>
        </button>

        {/* Wargame Simulator Button */}
        <button
          onClick={onOpenSimulator}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-red-950 hover:bg-red-900 border border-red-500/70 text-red-300 hover:text-red-100 text-base font-mono font-black tracking-wide transition shadow-lg hover:scale-[1.03]"
          title="Open Tactical Wargame Incursion Simulator (Jury Demo)"
        >
          <Crosshair size={22} className="text-red-400" />
          <span className="hidden sm:inline">WARGAME SIM</span>
        </button>

        {/* Tactical AI Copilot Button */}
        <button
          onClick={onOpenCopilot}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/70 text-cyan-300 hover:text-cyan-100 text-base font-mono font-black tracking-wide transition shadow-lg hover:scale-[1.03]"
          title="Open Drishti AI Tactical Copilot (Gemini 3.8 Flash)"
        >
          <Bot size={22} className="text-cyan-400 animate-pulse" />
          <span className="hidden sm:inline">AI COPILOT</span>
        </button>

        {/* SITREP Export Button */}
        <button
          onClick={onOpenSitrep}
          className="flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-600 text-slate-200 hover:text-white text-base font-mono font-black tracking-wide transition shadow-lg hover:scale-[1.03]"
          title="Export Official Military Situation Report (Print / PDF)"
        >
          <FileText size={22} className="text-amber-400" />
          <span className="hidden sm:inline">SITREP</span>
        </button>
      </div>

      <div className="h-8 w-px bg-slate-800 mx-1 hidden sm:block" />

      {/* Clock */}
      <span className="text-sm sm:text-base text-slate-300 font-mono font-bold hidden md:inline">{clock}</span>

      {/* Live / Offline WebSocket indicator */}
      <div
        className={clsx(
          'flex items-center gap-2.5 text-sm sm:text-base font-mono font-black px-4 py-2 rounded-xl border shadow-md',
          isConnected
            ? 'text-emerald-400 bg-emerald-950/60 border-emerald-500/60'
            : 'text-red-400 bg-red-950/60 border-red-500/60'
        )}
      >
        {isConnected ? <Wifi size={18} /> : <WifiOff size={18} />}
        <span>{isConnected ? 'LIVE FEED' : 'OFFLINE'}</span>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-1.5 min-w-[88px] shadow-sm">
      <span className={clsx('text-xl sm:text-2xl font-black leading-tight font-mono', color)}>{value}</span>
      <span className="text-[11px] text-slate-400 font-black uppercase tracking-wider font-mono">{label}</span>
    </div>
  );
}
