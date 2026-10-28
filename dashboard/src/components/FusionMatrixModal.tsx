// src/components/FusionMatrixModal.tsx — Multi-Modal Cross-Attention Fusion Visualizer
import React, { useState } from 'react';
import {
  X,
  Layers,
  Cpu,
  Zap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const MODALITIES = ['VIDEO', 'SATELLITE', 'ADS_B', 'AIS', 'SEISMIC', 'RADAR', 'HUMINT'];

// Simulated cross-attention weights matrix (7x7) for live critical threat
const ATTENTION_MATRIX: number[][] = [
  //  VID   SAT   ADSB  AIS   SEIS  RAD   HUM
  [0.85, 0.72, 0.65, 0.22, 0.18, 0.81, 0.54], // VIDEO
  [0.72, 0.94, 0.78, 0.45, 0.29, 0.84, 0.62], // SATELLITE
  [0.65, 0.78, 0.91, 0.38, 0.12, 0.88, 0.49], // ADS_B
  [0.22, 0.45, 0.38, 0.89, 0.15, 0.64, 0.40], // AIS
  [0.18, 0.29, 0.12, 0.15, 0.95, 0.32, 0.58], // SEISMIC
  [0.81, 0.84, 0.88, 0.64, 0.32, 0.93, 0.67], // RADAR
  [0.54, 0.62, 0.49, 0.40, 0.58, 0.67, 0.82], // HUMINT
];

export function FusionMatrixModal({ isOpen, onClose }: Props) {
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>({ r: 1, c: 2 });

  if (!isOpen) return null;

  const activeWeight = selectedCell
    ? ATTENTION_MATRIX[selectedCell.r]![selectedCell.c]!
    : 0.85;
  const modA = selectedCell ? MODALITIES[selectedCell.r]! : 'SATELLITE';
  const modB = selectedCell ? MODALITIES[selectedCell.c]! : 'ADS_B';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-950 border-2 border-purple-500/50 rounded-3xl shadow-2xl max-w-4xl w-full p-7 text-slate-100 flex flex-col gap-5 font-mono my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-950 border border-purple-500/60 text-purple-400">
              <Layers className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wider text-purple-400 uppercase">
                  CROSS-MODAL ATTENTION FUSION MATRIX (EXPLAINABLE AI)
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-950 border border-purple-500 text-purple-300 font-bold">
                  TRANSFORMER 256-D
                </span>
              </div>
              <div className="text-xs text-slate-400 font-sans mt-0.5">
                Real-Time Attention Interconnection Weights Between Disparate Defence Telemetry Feeds
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mathematical Foundation Banner */}
        <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs">
          <div className="space-y-1">
            <div className="text-purple-300 font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Cross-Attention Score Formulation:</span>
            </div>
            <p className="text-slate-400 font-sans text-xs">
              Attention(Q_i, K_j, V_j) = softmax( (Q_i · K_j^T) / √d_k ) · V_j
            </p>
          </div>
          <div className="text-right text-slate-300 font-mono text-[11px] shrink-0 border-l border-slate-800 pl-4">
            <div>Embedding Dim: <strong>256</strong></div>
            <div>Attention Heads: <strong>8</strong></div>
            <div>Latency: <strong>3.2 ms</strong></div>
          </div>
        </div>

        {/* Heatmap Matrix Grid */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold text-slate-200">INTER-MODALITY CORRELATION HEATMAP (Click cell to inspect)</span>
            <span className="text-[10px] text-purple-400">Scale: 0.0 (Decoupled) → 1.0 (Direct Corroboration)</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr>
                  <th className="p-2 text-xs text-slate-500 text-left">MODALITY</th>
                  {MODALITIES.map((m) => (
                    <th key={m} className="p-2 text-[10px] font-bold text-slate-400">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODALITIES.map((rowName, r) => (
                  <tr key={rowName}>
                    <td className="p-2 text-xs font-bold text-slate-300 text-left font-mono">{rowName}</td>
                    {MODALITIES.map((_, c) => {
                      const val = ATTENTION_MATRIX[r]![c]!;
                      const isSelected = selectedCell?.r === r && selectedCell?.c === c;

                      // Color interpolation based on weight
                      const bgOpacity = Math.max(0.15, val * 0.85);

                      return (
                        <td key={c} className="p-1">
                          <button
                            onClick={() => setSelectedCell({ r, c })}
                            className={`w-full py-2 px-1 rounded-lg text-[11px] font-bold transition font-mono ${
                              isSelected
                                ? 'ring-2 ring-purple-400 shadow-lg text-white font-black'
                                : 'text-slate-200 hover:scale-105'
                            }`}
                            style={{
                              backgroundColor: `rgba(168, 85, 247, ${bgOpacity})`,
                            }}
                          >
                            {(val * 100).toFixed(0)}%
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Interconnection Insight Card */}
        {selectedCell && (
          <div className="bg-purple-950/40 border border-purple-500/50 rounded-2xl p-4 flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-purple-300">
                <span>{modA}</span>
                <ArrowRight className="w-4 h-4 text-purple-400" />
                <span>{modB}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-900/80 border border-purple-500 text-white font-mono ml-2">
                  Correlation: {(activeWeight * 100).toFixed(1)}%
                </span>
              </div>
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>

            <p className="text-slate-300 font-sans leading-relaxed text-xs mt-1">
              {modA === 'SATELLITE' && modB === 'ADS_B' ? (
                <>
                  High cross-attention correlation detected: An aircraft transponder cutoff in OpenSky ADS-B coincides with a fresh SWIR optical reflectance anomaly from Sentinel-2 pass within a 2.4 km spatial envelope, triggering an immediate CRITICAL threat escalation.
                </>
              ) : modA === 'VIDEO' && modB === 'RADAR' ? (
                <>
                  Ground radar target reflection at 3.8 km confirmed by Edge YOLOv8 FLIR drone feed, eliminating atmospheric radar false positives and identifying targets as a coordinated UAV swarm.
                </>
              ) : (
                <>
                  Cross-attention weights demonstrate strong multi-sensor corroboration between {modA} and {modB}, ensuring high confidence and preventing single-modality false alarms from escalating to command HQ.
                </>
              )}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs text-slate-400 font-sans">
          <span>Explainability Module: PyTorch Cross-Modal Transformer Layer Norm + Scaled Dot-Product</span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition"
          >
            Close Fusion Matrix
          </button>
        </div>
      </div>
    </div>
  );
}
