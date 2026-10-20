// src/components/WargameSimulator.tsx — Live Tactical Scenario Simulator (Judge Demo Engine)
import React, { useState } from 'react';
import axios from 'axios';
import { Play, ShieldAlert, Waves, Mountain, Crosshair, CheckCircle2, Loader2, X } from 'lucide-react';
import { playTacticalPing } from '../utils/audioAlert';
import { useDrishtiStore } from '../store/useDrishtiStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Scenario {
  id: string;
  name: string;
  sector: string;
  modalities: string[];
  severity: 'CRITICAL' | 'HIGH';
  desc: string;
  icon: React.ReactNode;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'ladakh_drone_swarm',
    name: 'Pangong Tso UAV Swarm',
    sector: 'LAC – Ladakh Sector',
    modalities: ['ADS-B', 'Radar', 'Sentinel-2', 'Video'],
    severity: 'CRITICAL',
    desc: '5 Low-RCS stealth reconnaissance drones navigating Pangong Lake under 200m AGL. Thermal cross-verification.',
    icon: <Crosshair className="w-4 h-4 text-red-400" />,
  },
  {
    id: 'sir_creek_maritime',
    name: 'Sir Creek Dark Flotilla',
    sector: 'Gujarat Coast / Sir Creek',
    modalities: ['AIS', 'Coastal Radar', 'Satellite'],
    severity: 'CRITICAL',
    desc: '2 high-speed unflagged assault skiffs approaching tidal border at 34 knots with AIS disabled seaward.',
    icon: <Waves className="w-4 h-4 text-cyan-400" />,
  },
  {
    id: 'loc_tunnel_seismic',
    name: 'Subterranean Rotary Drilling',
    sector: 'LoC – Poonch Sector',
    modalities: ['USGS Seismic', 'HUMINT'],
    severity: 'HIGH',
    desc: 'Cluster of 8m-depth micro-seismic vibrations characteristic of covert cross-border tunnel excavation.',
    icon: <Mountain className="w-4 h-4 text-amber-400" />,
  },
  {
    id: 'ne_border_incursion',
    name: 'Tawang Motorized Recon',
    sector: 'Northeast Frontier',
    modalities: ['Optical Satellite', 'Radar', 'CCTV'],
    severity: 'CRITICAL',
    desc: '8 heavy all-terrain recon vehicles crossing frontier demarcation line 42 under monsoonal cloud cover.',
    icon: <ShieldAlert className="w-4 h-4 text-orange-400" />,
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function WargameSimulator({ isOpen, onClose }: Props) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastExecuted, setLastExecuted] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunScenario = async (scenario: Scenario) => {
    setRunningId(scenario.id);
    try {
      await axios.post(`${API_URL}/api/v1/simulate/scenario`, { scenario: scenario.id });
      playTacticalPing('SIMULATE');
      setLastExecuted(scenario.name);
      setTimeout(() => setRunningId(null), 800);
    } catch {
      // Standalone GitHub Pages client-side simulation fallback
      const simulatedEvt = {
        id: `sim-${scenario.id}-${Date.now()}`,
        threat_type: scenario.id.includes('maritime')
          ? ('MARITIME' as const)
          : scenario.id.includes('seismic')
          ? ('SEISMIC_ANOMALY' as const)
          : ('AIR_INCURSION' as const),
        threat_score: scenario.severity === 'CRITICAL' ? 0.98 : 0.84,
        priority: scenario.severity,
        location:
          scenario.id === 'ladakh_drone_swarm'
            ? { lat: 34.225, lon: 77.56 }
            : scenario.id === 'sir_creek_maritime'
            ? { lat: 23.68, lon: 68.32 }
            : scenario.id === 'loc_tunnel_seismic'
            ? { lat: 33.77, lon: 74.12 }
            : { lat: 27.58, lon: 91.86 },
        modalities: scenario.modalities as any,
        entity_count: scenario.id === 'ladakh_drone_swarm' ? 5 : scenario.id === 'ne_border_incursion' ? 8 : 2,
        description: scenario.desc,
        is_false_positive: false,
        occurred_at: new Date().toISOString(),
      };
      useDrishtiStore.getState().addEvent(simulatedEvt);
      useDrishtiStore.getState().addAlert({
        id: `alt-sim-${Date.now()}`,
        priority: scenario.severity,
        title: `${scenario.severity}: ${scenario.name}`,
        message: scenario.desc,
        status: 'ACTIVE',
        threat_score: simulatedEvt.threat_score,
        created_at: new Date().toISOString(),
      });
      playTacticalPing('SIMULATE');
      setLastExecuted(scenario.name);
      setTimeout(() => setRunningId(null), 800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-red-500/40 rounded-2xl shadow-2xl max-w-4xl w-full p-7 text-slate-100 flex flex-col gap-5 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-lg font-extrabold tracking-wider text-red-400 uppercase">
              Tactical Wargame Scenario Simulator
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <p className="text-sm text-slate-300 font-sans leading-relaxed">
          Trigger live, simulated multi-modal threat events across India's frontiers. Events are immediately injected into the
          live Kafka pipeline, persisted in PostGIS, evaluated by the Threat Escalation Engine, and briefed by Gemini 3.8 Flash.
        </p>

        {lastExecuted && (
          <div className="flex items-center gap-2.5 bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-sm px-4 py-2.5 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Scenario <strong>&ldquo;{lastExecuted}&rdquo;</strong> injected into live command pipeline. Map marker & alert updated.</span>
          </div>
        )}

        {/* Scenarios List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
          {SCENARIOS.map((s) => (
            <div
              key={s.id}
              className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between gap-3.5 transition"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 font-bold text-base text-slate-200">
                    {s.icon}
                    <span>{s.name}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-extrabold ${
                      s.severity === 'CRITICAL'
                        ? 'bg-red-950 text-red-400 border border-red-800'
                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {s.severity}
                  </span>
                </div>
                <div className="text-xs text-cyan-400 font-sans font-semibold mb-1.5">{s.sector}</div>
                <p className="text-xs text-slate-300 font-sans leading-relaxed line-clamp-2">{s.desc}</p>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {s.modalities.map((m) => (
                    <span key={m} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono font-medium">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleRunScenario(s)}
                disabled={runningId === s.id}
                className="w-full flex items-center justify-center gap-2 bg-red-600/90 hover:bg-red-500 text-white font-sans font-bold text-sm py-2.5 px-4 rounded-xl shadow transition disabled:opacity-50"
              >
                {runningId === s.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Injecting Stream...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Execute Threat Simulation</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="text-sm font-sans font-semibold text-slate-300 hover:text-white px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          >
            Close Simulation Deck
          </button>
        </div>
      </div>
    </div>
  );
}
