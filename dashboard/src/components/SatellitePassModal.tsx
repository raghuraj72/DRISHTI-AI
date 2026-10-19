// src/components/SatellitePassModal.tsx — Multi-Spectral Satellite Camouflage-Defeat & Change Detection Inspector
import React, { useState } from 'react';
import { X, Satellite, Eye, Layers, Compass, CheckCircle2, ShieldAlert } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type BandMode = 'TRUE_COLOR' | 'SWIR_CAMO' | 'NDVI_CHANGE';

export function SatellitePassModal({ isOpen, onClose }: Props) {
  const [bandMode, setBandMode] = useState<BandMode>('SWIR_CAMO');
  const [sector, setSector] = useState('Pangong Tso / LAC North');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-blue-500/40 rounded-xl shadow-2xl max-w-4xl w-full p-6 text-slate-100 flex flex-col gap-4 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-blue-400 animate-pulse" />
            <div>
              <h2 className="text-base font-bold tracking-wider text-blue-400 uppercase">
                SENTINEL-2 MULTI-SPECTRAL CAMOUFLAGE DEFEAT INSPECTOR
              </h2>
              <div className="text-[11px] text-slate-400 font-sans">
                Copernicus Data Space Ecosystem (CDSE) Level-2A Multi-Spectral Surface Reflectance
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

        {/* Top Controls: Sector & Band Modes */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>SECTOR:</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-cyan-300 focus:outline-none"
            >
              <option>Pangong Tso / LAC North (Ladakh)</option>
              <option>Demchok Sector (Chumar Valley)</option>
              <option>Depsang Plains (Bottleneck Corridor)</option>
              <option>Tawang Demarcation (Northeast Frontier)</option>
              <option>Sir Creek Tidal Border (Gujarat)</option>
            </select>
          </div>

          {/* Band Selector */}
          <div className="flex gap-1.5 text-xs">
            <button
              onClick={() => setBandMode('TRUE_COLOR')}
              className={`px-3 py-1 rounded border transition ${
                bandMode === 'TRUE_COLOR'
                  ? 'bg-blue-600 text-white font-bold border-blue-400 shadow'
                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              True Color (B4/B3/B2)
            </button>
            <button
              onClick={() => setBandMode('SWIR_CAMO')}
              className={`px-3 py-1 rounded border transition ${
                bandMode === 'SWIR_CAMO'
                  ? 'bg-purple-600 text-white font-bold border-purple-400 shadow'
                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              SWIR Camouflage Defeat (B12/B8A/B4)
            </button>
            <button
              onClick={() => setBandMode('NDVI_CHANGE')}
              className={`px-3 py-1 rounded border transition ${
                bandMode === 'NDVI_CHANGE'
                  ? 'bg-emerald-600 text-white font-bold border-emerald-400 shadow'
                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              NDVI Surface Turnover (ΔNIR)
            </button>
          </div>
        </div>

        {/* Imagery & Spectral Analysis Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Simulated Satellite Viewport (2 Cols) */}
          <div className="md:col-span-2 relative h-72 bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col justify-between p-3 select-none">
            {/* Background Texture & Band Filter Representation */}
            <div
              className={`absolute inset-0 transition-all duration-500 opacity-90 ${
                bandMode === 'TRUE_COLOR'
                  ? 'bg-gradient-to-br from-amber-950/70 via-stone-900 to-slate-950'
                  : bandMode === 'SWIR_CAMO'
                  ? 'bg-gradient-to-br from-fuchsia-950/80 via-indigo-950 to-slate-950'
                  : 'bg-gradient-to-br from-emerald-950/80 via-lime-950/50 to-slate-950'
              }`}
            />

            {/* Target Overlay Marker on Satellite Pass */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
              <div
                className={`w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center transition-all ${
                  bandMode === 'SWIR_CAMO'
                    ? 'border-fuchsia-400 animate-spin bg-fuchsia-500/20 shadow-[0_0_20px_rgba(217,70,239,0.6)]'
                    : bandMode === 'NDVI_CHANGE'
                    ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.5)]'
                    : 'border-slate-500 bg-slate-700/20'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full ${
                    bandMode === 'SWIR_CAMO'
                      ? 'bg-fuchsia-400 animate-ping'
                      : bandMode === 'NDVI_CHANGE'
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-slate-400'
                  }`}
                />
              </div>
              <div className="mt-2 text-[10px] px-2 py-0.5 rounded bg-slate-950/90 border border-slate-700 text-slate-200">
                {bandMode === 'TRUE_COLOR' && 'Visible: Natural Mountain Shadow / Concealed'}
                {bandMode === 'SWIR_CAMO' && 'CRITICAL: Synthetic Polymer Reflectance Detected (Armor Camo Net)'}
                {bandMode === 'NDVI_CHANGE' && 'ANOMALY: Heavy Vehicle Soil Depaction (ΔNDVI: -0.41)'}
              </div>
            </div>

            {/* Grid Line Coordinates Overlay */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-4 grid-rows-3 opacity-20">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="border border-cyan-500/30" />
              ))}
            </div>

            {/* Top Pass Metadata */}
            <div className="relative z-10 flex justify-between items-center text-[10px] text-slate-300 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
              <span>S2B_MSIL2A_20261019T054521_N0510</span>
              <span className="text-cyan-400">RESOLUTION: 10m/px · SUN EL: 54.2°</span>
            </div>

            {/* Bottom Pass Legend */}
            <div className="relative z-10 flex justify-between items-center text-[10px] text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
              <span>ORBIT PASS: ASCENDING REL. 072</span>
              <span className="text-emerald-400">CLOUD COVERAGE: 1.2% (OPTIMAL)</span>
            </div>
          </div>

          {/* Technical Diagnostics & Camouflage Science (1 Col) */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between gap-3 text-xs font-sans">
            <div>
              <div className="flex items-center gap-1.5 font-mono font-bold text-slate-100 text-sm mb-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <span>SPECTRAL DECEPTION ANALYSIS</span>
              </div>

              {bandMode === 'TRUE_COLOR' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[11px] leading-relaxed">
                    <strong>Visible Spectrum (B4: 665nm, B3: 560nm, B2: 490nm):</strong>
                    <p className="mt-1 text-slate-400">
                      Standard RGB pass matches human vision. Adversary military vehicles use multi-spectral netting
                      and mountain clay paint, blending entirely with the surrounding barren scree slopes.
                    </p>
                  </div>
                </div>
              )}

              {bandMode === 'SWIR_CAMO' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded bg-fuchsia-950/70 border border-fuchsia-500/60 text-fuchsia-200 text-[11px] leading-relaxed">
                    <strong className="text-fuchsia-300 font-mono">CAMOUFLAGE NET PIERCED (SWIR-2):</strong>
                    <p className="mt-1">
                      Shortwave Infrared (B12: 2190nm & B8A: 865nm) detects molecular absorption dips of synthetic PVC
                      and nylon fibers. Natural rock reflects uniformly, while artificial military canvas creates an
                      unnatural reflectance spike.
                    </p>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 font-mono text-[10px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">SWIR Ratio (B12/B8A):</span>
                      <strong className="text-fuchsia-400">2.84 (Synthetic Alert)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Target Classification:</span>
                      <strong className="text-slate-100">Hidden Mobile Radar/C2 Unit</strong>
                    </div>
                  </div>
                </div>
              )}

              {bandMode === 'NDVI_CHANGE' && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded bg-emerald-950/70 border border-emerald-500/60 text-emerald-200 text-[11px] leading-relaxed">
                    <strong className="text-emerald-300 font-mono">SURFACE DISRUPTION / TRACK RUTS:</strong>
                    <p className="mt-1">
                      Normalized Difference Vegetation Index compares current pass against 5-day baseline. Crushed
                      alpine turf and disturbed aggregate reveal clandestine vehicle movement corridors through mountain
                      gullies.
                    </p>
                  </div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800 font-mono text-[10px] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Track Width:</span>
                      <strong className="text-emerald-400">3.4 m (Heavy Tracked)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Change Age:</span>
                      <strong className="text-slate-100">&lt; 18 hours (Fresh)</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800">
              <div className="flex items-center gap-1.5 text-cyan-400 text-[11px] font-mono">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>FUSED INTO DRISHTI KAFKA BUS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs font-sans text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Autonomous European Space Agency (ESA) CDSE OData synchronization active</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition"
          >
            Close Satellite Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
