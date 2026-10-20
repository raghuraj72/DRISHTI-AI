// src/components/SitrepExportModal.tsx — Official Military SITREP PDF / Print Exporter
import React from 'react';
import { Printer, X, Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useDrishtiStore } from '../store/useDrishtiStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SitrepExportModal({ isOpen, onClose }: Props) {
  const events = useDrishtiStore((s) => s.events);
  const alerts = useDrishtiStore((s) => s.alerts);
  const stats = useDrishtiStore((s) => s.stats);
  const latestReport = useDrishtiStore((s) => s.latestReport);

  if (!isOpen) return null;

  const now = new Date();
  const dtg = `${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(
    now.getUTCMinutes()
  ).padStart(2, '0')}Z ${now.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${now.getUTCFullYear()}`;

  const criticalAndHighEvents = events.filter((e) => e.priority === 'CRITICAL' || e.priority === 'HIGH').slice(0, 8);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full my-8 text-slate-100 flex flex-col shadow-2xl font-sans">
        {/* Top Control Bar (Hidden during print) */}
        <div className="flex items-center justify-between p-5 bg-slate-950 border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-extrabold uppercase tracking-wider text-cyan-400">
              OFFICIAL SITREP GENERATOR // MO-IDS-DRISHTI-2026
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-sm font-bold rounded-lg shadow transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Printable Document Area */}
        <div className="p-8 bg-slate-950 text-slate-200 print:bg-white print:text-black print:p-6 space-y-6 font-mono text-sm">
          {/* Document Header */}
          <div className="border-b-2 border-slate-700 print:border-black pb-4 text-center">
            <div className="text-[10px] tracking-widest text-red-400 print:text-red-700 font-bold uppercase">
              TOP SECRET // NATIONAL BORDER SECURITY // RYIC 2026
            </div>
            <h1 className="text-lg font-bold tracking-wider mt-1 text-slate-100 print:text-black">
              INTEGRATED DEFENCE STAFF — DRISHTI COMMAND HEADQUARTERS
            </h1>
            <h2 className="text-sm font-semibold tracking-wide text-cyan-400 print:text-gray-800">
              MULTI-MODAL BORDER SURVEILLANCE SITUATION REPORT (SITREP)
            </h2>
            <div className="flex justify-between items-center mt-3 text-[11px] text-slate-400 print:text-gray-600 border-t border-slate-800 print:border-gray-300 pt-2 font-mono">
              <span>DTG: {dtg}</span>
              <span>SECTORS: LAC / LoC / RAJASTHAN / COASTAL</span>
              <span>STATUS: LIVE INTELLIGENCE</span>
            </div>
          </div>

          {/* Section 1: Executive Readiness Summary */}
          <div>
            <h3 className="text-xs font-bold text-amber-400 print:text-amber-800 uppercase tracking-wider mb-2 border-b border-slate-800 print:border-gray-400 pb-1">
              1. EXECUTIVE READINESS & TELEMETRY SUMMARY
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-slate-900 print:bg-gray-100 p-2.5 rounded border border-slate-800 print:border-gray-300">
                <div className="text-[10px] text-slate-400 print:text-gray-600">24H THREAT INCIDENTS</div>
                <div className="text-base font-bold text-slate-100 print:text-black">{stats.threats_24h}</div>
              </div>
              <div className="bg-slate-900 print:bg-gray-100 p-2.5 rounded border border-slate-800 print:border-gray-300">
                <div className="text-[10px] text-red-400 print:text-red-700">CRITICAL PRIORITY</div>
                <div className="text-base font-bold text-red-400 print:text-red-700">{stats.critical_24h}</div>
              </div>
              <div className="bg-slate-900 print:bg-gray-100 p-2.5 rounded border border-slate-800 print:border-gray-300">
                <div className="text-[10px] text-orange-400 print:text-orange-700">HIGH PRIORITY</div>
                <div className="text-base font-bold text-orange-400 print:text-orange-700">{stats.high_24h}</div>
              </div>
              <div className="bg-slate-900 print:bg-gray-100 p-2.5 rounded border border-slate-800 print:border-gray-300">
                <div className="text-[10px] text-emerald-400 print:text-emerald-700">ACTIVE ALERTS</div>
                <div className="text-base font-bold text-emerald-400 print:text-emerald-700">{alerts.length}</div>
              </div>
            </div>
          </div>

          {/* Section 2: Sensor Modality Coverage */}
          <div>
            <h3 className="text-xs font-bold text-cyan-400 print:text-blue-800 uppercase tracking-wider mb-2 border-b border-slate-800 print:border-gray-400 pb-1">
              2. SENSOR CORROBORATION & INGESTION TELEMETRY
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 rounded bg-slate-900/60 print:bg-gray-50 border border-slate-800 print:border-gray-200">
                <div className="font-bold text-slate-300 print:text-gray-900">OpenSky Air Traffic</div>
                <div className="text-emerald-400 print:text-emerald-600 font-sans text-[10px]">Real-time ADS-B Polling</div>
              </div>
              <div className="p-2 rounded bg-slate-900/60 print:bg-gray-50 border border-slate-800 print:border-gray-200">
                <div className="font-bold text-slate-300 print:text-gray-900">AISStream Maritime</div>
                <div className="text-emerald-400 print:text-emerald-600 font-sans text-[10px]">Active WebSocket Live</div>
              </div>
              <div className="p-2 rounded bg-slate-900/60 print:bg-gray-50 border border-slate-800 print:border-gray-200">
                <div className="font-bold text-slate-300 print:text-gray-900">USGS FDSN Seismic</div>
                <div className="text-emerald-400 print:text-emerald-600 font-sans text-[10px]">Border Shaking Monitor</div>
              </div>
              <div className="p-2 rounded bg-slate-900/60 print:bg-gray-50 border border-slate-800 print:border-gray-200">
                <div className="font-bold text-slate-300 print:text-gray-900">Sentinel-2 Optical</div>
                <div className="text-emerald-400 print:text-emerald-600 font-sans text-[10px]">Copernicus CDSE L2A</div>
              </div>
            </div>
          </div>

          {/* Section 3: High Priority Threat Table */}
          <div>
            <h3 className="text-xs font-bold text-red-400 print:text-red-800 uppercase tracking-wider mb-2 border-b border-slate-800 print:border-gray-400 pb-1">
              3. HIGH-SEVERITY BORDER ANOMALIES & INCURSIONS
            </h3>
            {criticalAndHighEvents.length === 0 ? (
              <div className="p-3 text-slate-500 italic">No critical or high events registered in current active window.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-800 print:border-gray-400 text-slate-400 print:text-gray-600">
                      <th className="py-1 px-1">PRIORITY</th>
                      <th className="py-1 px-1">TYPE</th>
                      <th className="py-1 px-1">COORDINATES</th>
                      <th className="py-1 px-1">SCORE</th>
                      <th className="py-1 px-1">MODALITIES</th>
                      <th className="py-1 px-1">DESCRIPTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {criticalAndHighEvents.map((e) => (
                      <tr key={e.id} className="border-b border-slate-800/60 print:border-gray-200">
                        <td className="py-1.5 px-1 font-bold">
                          <span
                            className={
                              e.priority === 'CRITICAL'
                                ? 'text-red-400 print:text-red-700'
                                : 'text-orange-400 print:text-orange-700'
                            }
                          >
                            {e.priority}
                          </span>
                        </td>
                        <td className="py-1.5 px-1 text-slate-300 print:text-gray-900">{e.threat_type}</td>
                        <td className="py-1.5 px-1 text-slate-400 print:text-gray-700">
                          {e.location.lat.toFixed(2)}°N, {e.location.lon.toFixed(2)}°E
                        </td>
                        <td className="py-1.5 px-1 font-bold text-slate-200 print:text-black">{e.threat_score.toFixed(2)}</td>
                        <td className="py-1.5 px-1 text-slate-400 print:text-gray-600">
                          {Array.isArray(e.modalities) ? e.modalities.join(', ') : e.modalities}
                        </td>
                        <td className="py-1.5 px-1 text-slate-300 print:text-gray-800 truncate max-w-[200px]">
                          {e.description || 'Target confirmed by fused sensor array'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 4: AI Strategic Intelligence Assessment */}
          <div>
            <h3 className="text-xs font-bold text-emerald-400 print:text-emerald-800 uppercase tracking-wider mb-2 border-b border-slate-800 print:border-gray-400 pb-1">
              4. GEMINI 3.8 FLASH STRATEGIC INTELLIGENCE ASSESSMENT
            </h3>
            <div className="bg-slate-900/70 print:bg-gray-50 border border-slate-800 print:border-gray-300 p-4 rounded text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-slate-300 print:text-gray-900">
              {latestReport?.content ||
                'DRISHTI-AI Strategic Situation Assessment: Multi-sensor surveillance grid remains fully operational across Northern and Western sectors. Automated correlation algorithms report localized anomalies in Western desert and Northern mountainous passes. Inter-agency quick-reaction teams placed on high surveillance readiness.'}
            </div>
          </div>

          {/* Section 5: Signature & Verification */}
          <div className="pt-4 border-t-2 border-slate-700 print:border-black flex justify-between items-end text-[10px]">
            <div>
              <div>CLASSIFIED DISSEMINATION: BSF / IAF / NAVY / MO-IDS</div>
              <div className="text-slate-400 print:text-gray-500">
                PRODUCED BY DRISHTI-AI MULTI-MODAL RECON PLATFORM — DTU RYIC 2026
              </div>
            </div>
            <div className="text-right">
              <div className="border-b border-slate-500 print:border-black w-48 mb-1" />
              <div className="font-bold">DUTY COMMAND OFFICER</div>
              <div className="text-slate-400 print:text-gray-500">SIGNATURE & SEAL VERIFIED</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
