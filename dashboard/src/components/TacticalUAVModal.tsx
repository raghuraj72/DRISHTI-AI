// src/components/TacticalUAVModal.tsx — Real-Time Tactical UAV Reconnaissance Camera (EO/IR FLIR Simulator)
import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Crosshair,
  Maximize2,
  Minimize2,
  Video,
  Layers,
  Compass,
  Radio,
  Eye,
  ShieldAlert,
  Zap,
  Target,
  Download,
} from 'lucide-react';
import { playTacticalPing } from '../utils/audioAlert';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Palette = 'WHITE_HOT' | 'BLACK_HOT' | 'IRONBOW' | 'NIGHT_VISION';

interface UAVFeed {
  id: string;
  name: string;
  sector: string;
  coords: string;
  altitude: string;
  speed: string;
  targets: Array<{
    label: string;
    conf: number;
    box: [number, number, number, number]; // [xNorm, yNorm, wNorm, hNorm]
    range: string;
    speed: string;
  }>;
}

const FEEDS: UAVFeed[] = [
  {
    id: 'ladakh_flir',
    name: 'HERON-MK2 // LAC NORTH',
    sector: 'Eastern Ladakh (Pangong Ridge 4)',
    coords: '33.7482°N, 78.8912°E',
    altitude: '18,400 FT AGL',
    speed: '195 KM/H',
    targets: [
      { label: 'STEALTH_UAV_SWARM', conf: 0.94, box: [0.38, 0.32, 0.18, 0.14], range: '1,840 m', speed: '142 km/h' },
      { label: 'MILITARY_CAMO_POST', conf: 0.88, box: [0.65, 0.58, 0.15, 0.12], range: '2,610 m', speed: 'STATIC' },
    ],
  },
  {
    id: 'sir_creek_marine',
    name: 'SEA-GUARDIAN-01 // KUTCH',
    sector: 'Gujarat Coast (Sir Creek Tidal Frontier)',
    coords: '23.8214°N, 68.7410°E',
    altitude: '6,200 FT AGL',
    speed: '230 KM/H',
    targets: [
      { label: 'DARK_VESSEL_FAST_CRAFT', conf: 0.91, box: [0.42, 0.44, 0.22, 0.16], range: '980 m', speed: '34 KNOTS' },
    ],
  },
  {
    id: 'loc_thermal',
    name: 'DRONA-QRT // POONCH',
    sector: 'Line of Control (Pir Panjal Range)',
    coords: '33.7712°N, 74.1205°E',
    altitude: '11,500 FT AGL',
    speed: '120 KM/H',
    targets: [
      { label: 'SUBTERRANEAN_BORING_RIG', conf: 0.86, box: [0.32, 0.48, 0.20, 0.18], range: '640 m', speed: 'ROTARY DRILL' },
      { label: 'ARMORED_CONVOY_BMP', conf: 0.93, box: [0.58, 0.36, 0.24, 0.15], range: '1,420 m', speed: '28 KM/H' },
    ],
  },
  {
    id: 'tawang_eo',
    name: 'NETRA-AEW&C // TAWANG',
    sector: 'Northeast Frontier (Bum La Pass)',
    coords: '27.7840°N, 91.9210°E',
    altitude: '24,000 FT AGL',
    speed: '380 KM/H',
    targets: [
      { label: 'HEAVY_LOGISTICS_COLUMN', conf: 0.89, box: [0.45, 0.40, 0.25, 0.20], range: '3,200 m', speed: '35 KM/H' },
    ],
  },
];

export function TacticalUAVModal({ isOpen, onClose }: Props) {
  const [activeFeedId, setActiveFeedId] = useState<string>('ladakh_flir');
  const [palette, setPalette] = useState<Palette>('IRONBOW');
  const [zoom, setZoom] = useState<number>(1);
  const [lockedOn, setLockedOn] = useState<boolean>(false);
  const [capturedNotice, setCapturedNotice] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeFeed = FEEDS.find((f) => f.id === activeFeedId) || FEEDS[0]!;

  // Animation frame loop rendering FLIR HUD & live bounding boxes
  useEffect(() => {
    if (!isOpen) return;

    let animId: number;
    let t = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      t += 0.03;

      // Background color based on thermal palette
      let bgGrad: CanvasGradient;
      if (palette === 'IRONBOW') {
        bgGrad = ctx.createLinearGradient(0, 0, w, h);
        bgGrad.addColorStop(0, '#0a051b');
        bgGrad.addColorStop(0.5, '#2e0854');
        bgGrad.addColorStop(0.8, '#800e3f');
        bgGrad.addColorStop(1, '#ff8c00');
      } else if (palette === 'NIGHT_VISION') {
        bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#021808');
        bgGrad.addColorStop(1, '#053412');
      } else if (palette === 'WHITE_HOT') {
        bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#10151c');
        bgGrad.addColorStop(1, '#1e2836');
      } else {
        // BLACK_HOT
        bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#e2e8f0');
        bgGrad.addColorStop(1, '#cbd5e1');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Render terrain horizon lines
      ctx.strokeStyle = palette === 'BLACK_HOT' ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < w; x += 15) {
        const y = h * 0.55 + Math.sin((x + t * 40) * 0.015) * 25 + Math.cos(x * 0.03) * 15;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Scanlines effect
      ctx.fillStyle = palette === 'BLACK_HOT' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.03)';
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 1.5);
      }

      // HUD Color
      const hudColor =
        palette === 'NIGHT_VISION'
          ? '#22c55e'
          : palette === 'BLACK_HOT'
          ? '#0f172a'
          : '#38bdf8';

      // Pitch Ladder & Reticle Center
      ctx.strokeStyle = hudColor;
      ctx.lineWidth = 1.5;

      const cx = w / 2;
      const cy = h / 2;

      // Center crosshair
      ctx.beginPath();
      ctx.moveTo(cx - 24, cy);
      ctx.lineTo(cx - 8, cy);
      ctx.moveTo(cx + 8, cy);
      ctx.lineTo(cx + 24, cy);
      ctx.moveTo(cx, cy - 24);
      ctx.lineTo(cx, cy - 8);
      ctx.moveTo(cx, cy + 8);
      ctx.lineTo(cx, cy + 24);
      ctx.stroke();

      // Pitch rungs
      [-60, -30, 30, 60].forEach((offset) => {
        ctx.beginPath();
        ctx.moveTo(cx - 40, cy + offset);
        ctx.lineTo(cx - 20, cy + offset);
        ctx.moveTo(cx + 20, cy + offset);
        ctx.lineTo(cx + 40, cy + offset);
        ctx.stroke();
      });

      // Target Bounding Boxes (YOLOv8 simulated tracking)
      activeFeed.targets.forEach((tgt, i) => {
        // Slight organic tracking drift
        const dx = Math.sin(t * 1.5 + i) * 6;
        const dy = Math.cos(t * 1.2 + i) * 4;

        const bx = tgt.box[0] * w + dx;
        const by = tgt.box[1] * h + dy;
        const bw = tgt.box[2] * w;
        const bh = tgt.box[3] * h;

        const boxColor = lockedOn ? '#ef4444' : tgt.conf >= 0.9 ? '#ef4444' : '#f97316';

        ctx.strokeStyle = boxColor;
        ctx.lineWidth = lockedOn ? 2.5 : 2;

        // Corner brackets style
        const cl = 16;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(bx, by + cl);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + cl, by);
        // Top-right
        ctx.moveTo(bx + bw - cl, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw, by + cl);
        // Bottom-left
        ctx.moveTo(bx, by + bh - cl);
        ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx + cl, by + bh);
        // Bottom-right
        ctx.moveTo(bx + bw - cl, by + bh);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx + bw, by + bh - cl);
        ctx.stroke();

        // Target Label Banner
        ctx.fillStyle = boxColor;
        ctx.fillRect(bx, by - 24, bw, 22);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(
          `${tgt.label} [${(tgt.conf * 100).toFixed(0)}%]`,
          bx + 6,
          by - 8
        );

        // Distance & Speed tag
        ctx.fillStyle = palette === 'BLACK_HOT' ? '#0f172a' : '#f1f5f9';
        ctx.font = '10px monospace';
        ctx.fillText(`RNG: ${tgt.range} | SPD: ${tgt.speed}`, bx, by + bh + 16);

        // If target locked on, draw target diamond and vector
        if (lockedOn) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(bx + bw / 2, by + bh / 2, 28, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('TARGET LOCKED [FIRE SOLUTION ACTIVE]', bx + bw / 2 - 95, by + bh / 2 - 36);
        }
      });

      // Azimuth Compass Tape (Top)
      ctx.fillStyle = hudColor;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`AZ: 042° NE // EL: -14.2° // FOV: ${(35 / zoom).toFixed(1)}°`, 24, 32);
      ctx.fillText(`LASER DESIGNATOR: ${lockedOn ? 'EMITTING [PRN-114]' : 'STANDBY'}`, 24, 52);

      // System Telemetry (Bottom)
      ctx.fillText(`DRISHTI OPTICAL/FLIR ENGINE // YOLOv8m (14.2 ms)`, 24, h - 24);
      ctx.fillText(`GPS: ${activeFeed.coords} | ALT: ${activeFeed.altitude}`, w - 380, h - 24);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, activeFeed, palette, zoom, lockedOn]);

  if (!isOpen) return null;

  const handleToggleLock = () => {
    const next = !lockedOn;
    setLockedOn(next);
    if (next) {
      playTacticalPing('LOCK_ON');
    } else {
      playTacticalPing('SIMULATE');
    }
  };

  const handleCaptureSnapshot = () => {
    setCapturedNotice('Intel Snapshot Logged & Appended to SITREP Repository (PNG 1080p).');
    playTacticalPing('DISPATCH');
    setTimeout(() => setCapturedNotice(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-950 border-2 border-cyan-500/50 rounded-3xl shadow-2xl max-w-5xl w-full p-6 text-slate-100 flex flex-col gap-4 font-mono">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-500/60 text-cyan-400">
              <Camera className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-wider text-cyan-300 uppercase">
                  TACTICAL UAV RECONNAISSANCE GIMBAL (EO/IR FLIR)
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-950 border border-red-500 text-red-400 font-bold animate-pulse">
                  ● LIVE FEED
                </span>
              </div>
              <div className="text-xs text-slate-400 font-sans mt-0.5">
                Frontline UAV Electro-Optical / Thermal Target Tracking & Laser Designation
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

        {/* Camera Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex gap-2">
            {FEEDS.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setActiveFeedId(f.id);
                  playTacticalPing('RADAR');
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeFeedId === f.id
                    ? 'bg-cyan-600 text-slate-950 shadow-md font-black'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>{f.name}</span>
              </button>
            ))}
          </div>

          {/* Palette Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-bold mr-1">PALETTE:</span>
            {(['IRONBOW', 'WHITE_HOT', 'BLACK_HOT', 'NIGHT_VISION'] as Palette[]).map((p) => (
              <button
                key={p}
                onClick={() => setPalette(p)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${
                  palette === p
                    ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Video Canvas Container */}
        <div className="relative w-full h-[400px] bg-black rounded-2xl overflow-hidden border border-cyan-500/30 shadow-2xl">
          <canvas
            ref={canvasRef}
            width={960}
            height={540}
            className="w-full h-full object-cover"
          />

          {/* Bottom Controls Overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur border border-slate-700/80 p-1.5 rounded-xl text-xs">
              <span className="text-slate-400 font-bold px-2">ZOOM:</span>
              {[1, 2, 4, 10].map((z) => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition ${
                    zoom === z
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {z}x
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCaptureSnapshot}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl transition shadow"
              >
                <Download className="w-4 h-4 text-cyan-400" />
                <span>Save Intel Frame</span>
              </button>

              <button
                onClick={handleToggleLock}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black tracking-wider transition shadow-lg ${
                  lockedOn
                    ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950'
                }`}
              >
                <Target className="w-4 h-4" />
                <span>{lockedOn ? 'DISENGAGE TARGET LOCK' : 'LOCK TARGET / LASER DESIGNATE'}</span>
              </button>
            </div>
          </div>
        </div>

        {capturedNotice && (
          <div className="bg-emerald-950/90 border border-emerald-500 text-emerald-300 text-xs px-4 py-2.5 rounded-xl font-mono">
            {capturedNotice}
          </div>
        )}

        {/* Telemetry Summary Footer */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/80 border border-slate-800 p-3 rounded-2xl text-xs font-mono">
          <div>
            <span className="text-slate-400">SURVEILLANCE SECTOR</span>
            <div className="font-bold text-slate-200 mt-0.5">{activeFeed.sector}</div>
          </div>
          <div>
            <span className="text-slate-400">GIMBAL AZIMUTH</span>
            <div className="font-bold text-cyan-300 mt-0.5">042.8° TRUE NORTH</div>
          </div>
          <div>
            <span className="text-slate-400">GIMBAL PITCH</span>
            <div className="font-bold text-emerald-400 mt-0.5">-14.2° DEPRESSION</div>
          </div>
          <div>
            <span className="text-slate-400">INFERENCE ENGINE</span>
            <div className="font-bold text-purple-400 mt-0.5">ONNX TENSORRT FP16 (30 FPS)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
