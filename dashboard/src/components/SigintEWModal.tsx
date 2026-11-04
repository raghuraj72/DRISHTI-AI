// src/components/SigintEWModal.tsx — Real-Time SIGINT & Electronic Warfare Spectrum Analyzer
import React, { useState, useEffect, useRef } from 'react';
import { X, Radio, Zap, ShieldAlert, Cpu, Activity, AlertTriangle, Crosshair, Volume2 } from 'lucide-react';
import sigintData from '../data/sigint_rf_emitters.json';

interface SigintEWModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EmitterRecord {
  timestamp: string;
  emitter_id: string;
  emitter_name: string;
  allegiance: string;
  frequency_mhz: number;
  pulse_repetition_interval_us: number;
  pulse_width_us: number;
  modulation_type: string;
  signal_to_noise_ratio_db: number;
  bearing_angle_deg: number;
  estimated_latitude: number;
  estimated_longitude: number;
  is_jamming_active: boolean;
  threat_score: number;
}

export function SigintEWModal({ isOpen, onClose }: SigintEWModalProps) {
  const [selectedBand, setSelectedBand] = useState<'ALL' | 'VHF' | 'UHF' | 'L_BAND' | 'C_BAND'>('ALL');
  const [activeEmitter, setActiveEmitter] = useState<EmitterRecord | null>(null);
  const [isJammingSuppressed, setIsJammingSuppressed] = useState(false);
  const [activeDirectEnergyLock, setActiveDirectEnergyLock] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  const emitters: EmitterRecord[] = sigintData as EmitterRecord[];

  const filteredEmitters = emitters.filter((e) => {
    if (selectedBand === 'VHF') return e.frequency_mhz < 300;
    if (selectedBand === 'UHF') return e.frequency_mhz >= 300 && e.frequency_mhz < 1000;
    if (selectedBand === 'L_BAND') return e.frequency_mhz >= 1000 && e.frequency_mhz < 2000;
    if (selectedBand === 'C_BAND') return e.frequency_mhz >= 4000;
    return true;
  });

  const hostileCount = emitters.filter((e) => e.allegiance === 'HOSTILE').length;
  const jammingActive = emitters.some((e) => e.is_jamming_active);

  // Animated Real-Time Spectrum Waterfall Display
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let offset = 0;

    const render = () => {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid lines
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw RF Spectrum Signal Peaks
      ctx.beginPath();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;

      for (let x = 0; x < canvas.width; x++) {
        // Multi-frequency simulated RF baseline noise
        const noise = Math.sin((x + offset) * 0.05) * 6 + Math.cos((x - offset) * 0.02) * 8;
        let peak = 0;

        // Emitter spectral spikes
        if (Math.abs(x - 120) < 15) peak = 85; // GPS L1 Jammer
        if (Math.abs(x - 260) < 22) peak = 110; // Barlock Early Warning Radar
        if (Math.abs(x - 420) < 10) peak = 65; // Tactical Data Link

        const y = canvas.height - 40 - noise - peak;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Peak glow fill
      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(0, canvas.height);
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, 'rgba(6, 182, 212, 0.4)');
      gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
      ctx.fillStyle = gradient;
      ctx.fill();

      // Threat marker tags on spectrum
      ctx.fillStyle = '#ef4444';
      ctx.font = '10px monospace';
      ctx.fillText('▼ GNSS JAMMER (1575.4 MHz)', 80, 45);
      ctx.fillText('▼ HOSTILE EW RADAR (2.85 GHz)', 210, 25);
      ctx.fillText('▼ COFDM VIDEO (5.8 GHz)', 380, 65);

      offset += 1.5;
      animRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl bg-slate-950 border-2 border-cyan-500/50 shadow-2xl overflow-hidden font-mono text-slate-100">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-wider text-cyan-400">
                  SIGINT // ELECTRONIC WARFARE (EW) SPECTRUM INTERCEPT
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-500/20 text-red-400 border border-red-500/40">
                  {jammingActive ? 'ACTIVE SPOOFING DETECTED' : 'SPECTRUM CLEAR'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Passive RF Emitter Fingerprinting & Direct-Energy Tactical Countermeasures
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl border border-slate-800 hover:border-slate-600 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tactical Sub-Bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-950 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-slate-400">SPECTRUM BANDS:</span>
            {(['ALL', 'VHF', 'UHF', 'L_BAND', 'C_BAND'] as const).map((band) => (
              <button
                key={band}
                onClick={() => setSelectedBand(band)}
                className={`px-3 py-1 rounded-xl font-bold transition ${
                  selectedBand === band
                    ? 'bg-cyan-500 text-slate-950 font-black'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {band}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsJammingSuppressed(!isJammingSuppressed)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                isJammingSuppressed
                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                  : 'bg-amber-950/80 border-amber-500 text-amber-300'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{isJammingSuppressed ? 'ANTI-JAM FILTER: ENGAGED' : 'ENGAGE ADAPTIVE NOTCH FILTER'}</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Real-Time Live Waterfall Spectrum Canvas */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
              <span className="flex items-center gap-2 font-bold text-cyan-300">
                <Activity className="w-4 h-4 text-cyan-400" />
                LIVE WIDEBAND SPECTRUM SWEEP (30 MHz — 6.0 GHz)
              </span>
              <span className="text-slate-500">SAMPLING: 2.4 GSPS // DDC RESOLUTION: 10 kHz</span>
            </div>
            <canvas
              ref={canvasRef}
              width={800}
              height={140}
              className="w-full h-36 rounded-xl bg-slate-950 border border-slate-800"
            />
          </div>

          {/* Grid Layout: Emitter List & Selected Emitter Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Emitter Intercept Table */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 overflow-hidden flex flex-col">
              <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center justify-between">
                <span>INTERCEPTED RF EMITTERS ({filteredEmitters.length})</span>
                <span className="text-xs text-red-400 font-mono">HOSTILE: {hostileCount}</span>
              </h3>
              <div className="overflow-y-auto max-h-64 space-y-2 pr-1">
                {filteredEmitters.slice(0, 15).map((e) => (
                  <div
                    key={e.emitter_id}
                    onClick={() => setActiveEmitter(e)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                      activeEmitter?.emitter_id === e.emitter_id
                        ? 'bg-cyan-950/80 border-cyan-400 text-white'
                        : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 font-black">
                        <span className={`w-2 h-2 rounded-full ${e.allegiance === 'HOSTILE' ? 'bg-red-500 animate-ping' : 'bg-emerald-400'}`} />
                        <span>{e.emitter_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {e.frequency_mhz.toFixed(2)} MHz
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        PRI: {e.pulse_repetition_interval_us} μs | PW: {e.pulse_width_us} μs | SNR: {e.signal_to_noise_ratio_db} dB
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        e.allegiance === 'HOSTILE' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {e.allegiance}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-1">BRG: {e.bearing_angle_deg}°</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Emitter Diagnostics & Tactical Jammer Controls */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>EMITTER DIAGNOSTICS & COUNTERMEASURES</span>
                </h3>

                {activeEmitter ? (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">DESIGNATION</div>
                      <div className="font-black text-amber-400 text-sm">{activeEmitter.emitter_name}</div>
                      <div className="text-slate-500 text-[10px] mt-0.5">ID: {activeEmitter.emitter_id}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">FREQUENCY</div>
                        <div className="font-bold text-cyan-300">{activeEmitter.frequency_mhz} MHz</div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">MODULATION</div>
                        <div className="font-bold text-slate-200">{activeEmitter.modulation_type}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">EST. LATITUDE</div>
                        <div className="font-bold text-slate-200">{activeEmitter.estimated_latitude.toFixed(4)}° N</div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">EST. LONGITUDE</div>
                        <div className="font-bold text-slate-200">{activeEmitter.estimated_longitude.toFixed(4)}° E</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-[11px]">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>THREAT IMPACT CALCULATION</span>
                      </div>
                      <div className="mt-1 text-slate-400">
                        Signal correlation indicates hostile surveillance targeting frontline communication relays. Threat coefficient: {(activeEmitter.threat_score * 100).toFixed(0)}%.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    Select an emitter from the intercept table to inspect spectral modulation and target vector.
                  </div>
                )}
              </div>

              {/* Action Button */}
              {activeEmitter && (
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setActiveDirectEnergyLock(activeEmitter.emitter_id);
                      setTimeout(() => setActiveDirectEnergyLock(null), 3000);
                    }}
                    className={`w-full py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 ${
                      activeDirectEnergyLock === activeEmitter.emitter_id
                        ? 'bg-red-600 text-white animate-pulse'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20'
                    }`}
                  >
                    <Crosshair className="w-4 h-4" />
                    <span>
                      {activeDirectEnergyLock === activeEmitter.emitter_id
                        ? 'TACTICAL RF JAMMING ACTIVE [300W DIRECTIONAL]'
                        : 'TASK DIRECTED RF SOFT-KILL JAMMER'}
                    </span>
                  </button>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-500">
          <span>DRISHTI-AI C4ISR // DEFENSE EW PROTOCOL MIL-STD-188F</span>
          <span className="text-cyan-400 font-bold">PASSIVE RF GEOLOCATION: ±45m ACCURACY</span>
        </div>

      </div>
    </div>
  );
}
