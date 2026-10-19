// src/components/SeismicSpectrogramModal.tsx — Subterranean Tunneling & Seismic Spectral Intelligence Analyzer
import React, { useState } from 'react';
import { X, Zap, Activity, Mountain, ShieldAlert, CheckCircle2, Sliders } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type SignatureType = 'TUNNELING' | 'EARTHQUAKE' | 'ARMOR_VEHICLE';

export function SeismicSpectrogramModal({ isOpen, onClose }: Props) {
  const [activeSig, setActiveSig] = useState<SignatureType>('TUNNELING');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-yellow-500/40 rounded-xl shadow-2xl max-w-4xl w-full p-6 text-slate-100 flex flex-col gap-4 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />
            <div>
              <h2 className="text-base font-bold tracking-wider text-yellow-400 uppercase">
                SUBTERRANEAN ACOUSTIC & SEISMIC SPECTRAL ANALYZER
              </h2>
              <div className="text-[11px] text-slate-400 font-sans">
                USGS FDSN + 3-Axis Geophone Cross-Spectral Micro-Vibration Classifier
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Signature Selector Tabs */}
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveSig('TUNNELING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeSig === 'TUNNELING'
                ? 'bg-red-950 border border-red-500 text-red-300 shadow'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span>Rotary Tunnel Drilling (Covert Excavation)</span>
          </button>

          <button
            onClick={() => setActiveSig('ARMOR_VEHICLE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeSig === 'ARMOR_VEHICLE'
                ? 'bg-amber-950 border border-amber-500 text-amber-300 shadow'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Heavy Armored Column (T-90/Tracked)</span>
          </button>

          <button
            onClick={() => setActiveSig('EARTHQUAKE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeSig === 'EARTHQUAKE'
                ? 'bg-blue-950 border border-blue-500 text-blue-300 shadow'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mountain className="w-4 h-4 text-blue-400" />
            <span>Natural Tectonic Tremor (Baseline)</span>
          </button>
        </div>

        {/* Simulated Waveform & Spectrogram Visualization */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Visualizer (2 Cols) */}
          <div className="lg:col-span-2 bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-yellow-400" />
                <span>TIME-DOMAIN VELOCITY WAVEFORM (v_z mm/s)</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">SAMPLING: 200 Hz (Nyquist: 100 Hz)</span>
            </div>

            {/* Waveform Canvas Simulation */}
            <div className="h-28 w-full bg-slate-900/80 rounded border border-slate-800/80 relative overflow-hidden flex items-center px-2">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 500 100">
                <line x1="0" y1="50" x2="500" y2="50" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
                {activeSig === 'TUNNELING' && (
                  <path
                    d="M0,50 Q25,30 50,50 T100,50 T150,50 T200,45 T250,55 T300,42 T350,58 T400,44 T450,56 T500,50"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2.5"
                  />
                )}
                {activeSig === 'ARMOR_VEHICLE' && (
                  <path
                    d="M0,50 Q15,10 30,50 T60,50 T90,20 T120,50 T150,50 T180,15 T210,50 T240,50 T270,18 T300,50 T330,50 T360,20 T390,50 T420,50 T450,22 T500,50"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                  />
                )}
                {activeSig === 'EARTHQUAKE' && (
                  <path
                    d="M0,50 Q50,48 100,50 Q130,5 160,95 Q190,20 220,80 Q250,35 280,65 Q310,45 350,55 Q400,48 500,50"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                  />
                )}
              </svg>
              <div className="absolute top-2 right-2 text-[10px] bg-slate-950/80 border border-slate-700 px-2 py-0.5 rounded text-slate-300">
                {activeSig === 'TUNNELING' && 'Harmonic Continuous Vibration (0.42 mm/s)'}
                {activeSig === 'ARMOR_VEHICLE' && 'Periodic Engine/Track Impact Spikes'}
                {activeSig === 'EARTHQUAKE' && 'P-Wave Arrival & S-Wave Decay'}
              </div>
            </div>

            {/* Fast Fourier Transform (FFT) Power Spectral Density */}
            <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
              <span>FREQUENCY SPECTRUM PSD (0 – 60 Hz)</span>
              <span className="text-[10px] text-yellow-400">FFT WINDOW: 1024-PT HANNING</span>
            </div>

            <div className="h-32 w-full bg-slate-900/80 rounded border border-slate-800/80 p-2 flex items-end gap-1 relative">
              {/* Frequency Bars */}
              {Array.from({ length: 30 }).map((_, i) => {
                const freq = (i + 1) * 2;
                let heightPct = 10;
                if (activeSig === 'TUNNELING') {
                  // High peak around 20-32 Hz (rotary drilling harmonic)
                  if (freq >= 20 && freq <= 32) heightPct = 75 + Math.sin(i) * 20;
                  else heightPct = 12 + Math.random() * 8;
                } else if (activeSig === 'ARMOR_VEHICLE') {
                  // Peak around 8-16 Hz (diesel engine / tracked rumble)
                  if (freq >= 8 && freq <= 16) heightPct = 65 + Math.cos(i) * 25;
                  else heightPct = 10 + Math.random() * 10;
                } else {
                  // Earthquakes dominate low frequencies < 4 Hz
                  if (freq <= 6) heightPct = 85 - freq * 10;
                  else heightPct = 6 + Math.random() * 5;
                }

                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                    <div
                      className={`w-full rounded-t transition-all duration-300 ${
                        activeSig === 'TUNNELING' && freq >= 20 && freq <= 32
                          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                          : activeSig === 'ARMOR_VEHICLE' && freq >= 8 && freq <= 16
                          ? 'bg-amber-400'
                          : activeSig === 'EARTHQUAKE' && freq <= 6
                          ? 'bg-blue-400'
                          : 'bg-slate-700/60'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    {i % 5 === 0 && <span className="text-[8px] text-slate-500">{freq}Hz</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tactical Diagnostic & Intelligence Panel (1 Col) */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-3 text-xs font-sans">
            <div>
              <div className="flex items-center gap-2 font-mono font-bold text-slate-100 text-sm mb-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span>INTELLIGENCE VERDICT</span>
              </div>

              {activeSig === 'TUNNELING' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded bg-red-950/70 border border-red-500/60 text-red-200">
                    <div className="font-bold text-red-400 flex items-center gap-1 mb-1 font-mono">
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                      <span>COVERT TUNNEL DRILLING DETECTED</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Continuous 24.5 Hz harmonic acoustic signature characteristic of rotary excavation drilling.
                      Corroborated by 3 forward geophones in Samba/Poonch sector.
                    </p>
                  </div>

                  <div className="space-y-1 font-mono text-[11px] bg-slate-900 p-2.5 rounded border border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Estimated Depth:</span>
                      <strong className="text-amber-400">7.8 m ± 0.6m AGL</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Distance to Border:</span>
                      <strong className="text-red-400">140 m from Zero Line</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Medium Velocity:</span>
                      <strong className="text-slate-200">1,820 m/s (Alluvial)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Classification Conf:</span>
                      <strong className="text-emerald-400">97.8% (LSTM Autoencoder)</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeSig === 'ARMOR_VEHICLE' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded bg-amber-950/70 border border-amber-500/60 text-amber-200">
                    <div className="font-bold text-amber-400 mb-1 font-mono">TRACKED VEHICLE CONVOY</div>
                    <p className="text-[11px] leading-relaxed">
                      Rhythmic ground transmission at 12 Hz matching heavy mechanized treads (T-90 / Type-15 class
                      armor).
                    </p>
                  </div>
                  <div className="space-y-1 font-mono text-[11px] bg-slate-900 p-2.5 rounded border border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Speed Estimate:</span>
                      <strong className="text-slate-200">28 km/h</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Bearing:</span>
                      <strong className="text-cyan-400">045° NE (Approaching LAC)</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeSig === 'EARTHQUAKE' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded bg-blue-950/70 border border-blue-500/60 text-blue-200">
                    <div className="font-bold text-blue-400 mb-1 font-mono">NATURAL TECTONIC EVENT</div>
                    <p className="text-[11px] leading-relaxed">
                      Low-frequency broadband seismic packet typical of natural Himalayan tectonic shifting. Zero
                      hostile intent.
                    </p>
                  </div>
                  <div className="space-y-1 font-mono text-[11px] bg-slate-900 p-2.5 rounded border border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Magnitude:</span>
                      <strong className="text-slate-200">M 2.4</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Focal Depth:</span>
                      <strong className="text-slate-200">22.4 km (Deep Crust)</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800">
              <div className="text-[10px] text-slate-400 mb-1 font-mono">COUNTERMEASURE DIRECTIVE:</div>
              <div className="bg-slate-900 p-2 rounded text-[10px] text-slate-300 font-sans">
                {activeSig === 'TUNNELING'
                  ? 'Dispatch Ground Penetrating Radar (GPR) unit to grid coordinate Samba-42. Prepare subterranean acoustic geophone array.'
                  : activeSig === 'ARMOR_VEHICLE'
                  ? 'Alert forward Anti-Tank Guided Missile (ATGM) post. Request UAV visual confirmation.'
                  : 'Log as natural seismic baseline; suppress automated alarm escalation.'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs font-sans text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Multi-modal corroboration with Sentinel-2 surface change passes active</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition"
          >
            Close Spectral Analyzer
          </button>
        </div>
      </div>
    </div>
  );
}
