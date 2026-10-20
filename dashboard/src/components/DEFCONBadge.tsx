// src/components/DEFCONBadge.tsx — Dynamic Defense Readiness Condition Indicator
import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useDrishtiStore } from '../store/useDrishtiStore';

export function DEFCONBadge() {
  const stats = useDrishtiStore((s) => s.stats);
  const critical = stats.critical_24h || 0;
  const high = stats.high_24h || 0;

  let defcon = 5;
  let statusText = 'DEFCON 5 — NORMAL';
  let badgeColor = 'bg-emerald-950/80 border-emerald-500 text-emerald-400';
  let dotColor = 'bg-emerald-400';

  if (critical >= 2) {
    defcon = 1;
    statusText = 'DEFCON 1 — MAXIMUM ALERT';
    badgeColor = 'bg-red-950/90 border-red-500 text-red-300 animate-pulse';
    dotColor = 'bg-red-500';
  } else if (critical >= 1 || high >= 15) {
    defcon = 2;
    statusText = 'DEFCON 2 — ARMED FORCES READY';
    badgeColor = 'bg-orange-950/90 border-orange-500 text-orange-300';
    dotColor = 'bg-orange-400';
  } else if (high >= 5) {
    defcon = 3;
    statusText = 'DEFCON 3 — AIR DEFENSE SURGE';
    badgeColor = 'bg-amber-950/90 border-amber-500 text-amber-300';
    dotColor = 'bg-amber-400';
  } else if (stats.threats_24h > 0) {
    defcon = 4;
    statusText = 'DEFCON 4 — HEIGHTENED WATCH';
    badgeColor = 'bg-blue-950/90 border-blue-500 text-blue-300';
    dotColor = 'bg-blue-400';
  }

  return (
    <div
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-xs sm:text-sm font-mono tracking-wider font-bold shadow-md ${badgeColor}`}
      title="Dynamic Defense Readiness Condition computed from live multi-modal border threats"
    >
      <span className={`w-2.5 h-2.5 rounded-full ${dotColor} ${defcon <= 2 ? 'animate-ping' : ''}`} />
      {defcon <= 2 ? <ShieldAlert className="w-4 h-4 text-red-400" /> : <ShieldCheck className="w-4 h-4" />}
      <span>{statusText}</span>
    </div>
  );
}
