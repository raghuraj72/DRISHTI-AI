// src/components/ThreatTimeline.tsx — 24h event timeline chart
import { useState } from 'react';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import clsx from 'clsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const THREAT_COLORS: Record<string, string> = {
  INTRUSION:      '#ef4444',
  AIR_INCURSION:  '#f97316',
  MARITIME:       '#3b82f6',
  SEISMIC_ANOMALY:'#eab308',
  MULTI_MODAL:    '#a855f7',
};

interface TimelineRow {
  hour: string;
  threat_type: string;
  count: number;
}

function buildChartData(rows: TimelineRow[]) {
  const hourMap: Record<string, Record<string, number>> = {};
  const types = new Set<string>();

  rows.forEach(({ hour, threat_type, count }) => {
    const h = new Date(hour).getHours().toString().padStart(2, '0') + ':00';
    if (!hourMap[h]) hourMap[h] = {};
    hourMap[h][threat_type] = (hourMap[h][threat_type] ?? 0) + count;
    types.add(threat_type);
  });

  return {
    data: Object.entries(hourMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, counts]) => ({ hour, ...counts })),
    types: Array.from(types),
  };
}

const DEFAULT_TIMELINE_ROWS: TimelineRow[] = [
  { hour: new Date(Date.now() - 21 * 3600000).toISOString(), threat_type: 'AIR_INCURSION', count: 180 },
  { hour: new Date(Date.now() - 21 * 3600000).toISOString(), threat_type: 'MARITIME', count: 120 },
  { hour: new Date(Date.now() - 20 * 3600000).toISOString(), threat_type: 'AIR_INCURSION', count: 320 },
  { hour: new Date(Date.now() - 20 * 3600000).toISOString(), threat_type: 'MARITIME', count: 240 },
  { hour: new Date(Date.now() - 18 * 3600000).toISOString(), threat_type: 'AIR_INCURSION', count: 540 },
  { hour: new Date(Date.now() - 18 * 3600000).toISOString(), threat_type: 'MARITIME', count: 390 },
  { hour: new Date(Date.now() - 17 * 3600000).toISOString(), threat_type: 'AIR_INCURSION', count: 720 },
  { hour: new Date(Date.now() - 17 * 3600000).toISOString(), threat_type: 'MARITIME', count: 480 },
  { hour: new Date(Date.now() - 16 * 3600000).toISOString(), threat_type: 'AIR_INCURSION', count: 650 },
  { hour: new Date(Date.now() - 16 * 3600000).toISOString(), threat_type: 'MARITIME', count: 410 },
  { hour: new Date(Date.now() - 3 * 3600000).toISOString(), threat_type: 'AIR_INCURSION', count: 290 },
  { hour: new Date(Date.now() - 3 * 3600000).toISOString(), threat_type: 'MARITIME', count: 180 },
  { hour: new Date(Date.now() - 2 * 3600000).toISOString(), threat_type: 'AIR_INCURSION', count: 440 },
  { hour: new Date(Date.now() - 2 * 3600000).toISOString(), threat_type: 'MARITIME', count: 320 },
  { hour: new Date(Date.now() - 1 * 3600000).toISOString(), threat_type: 'AIR_INCURSION', count: 810 },
  { hour: new Date(Date.now() - 1 * 3600000).toISOString(), threat_type: 'MARITIME', count: 620 },
  { hour: new Date().toISOString(), threat_type: 'AIR_INCURSION', count: 490 },
  { hour: new Date().toISOString(), threat_type: 'MARITIME', count: 380 },
];

export function ThreatTimeline() {
  const [collapsed, setCollapsed] = useState(false);

  const { data: rows = [] } = useQuery<TimelineRow[]>({
    queryKey: ['timeline'],
    queryFn: () => axios.get(`${API_URL}/api/v1/stats/timeline?hours=24`).then((r) => r.data),
    refetchInterval: 60_000,
    retry: false,
  });

  const effectiveRows = rows.length > 0 ? rows : DEFAULT_TIMELINE_ROWS;
  const { data: chartData, types } = buildChartData(effectiveRows);

  return (
    <div className={clsx(
      'bg-slate-900/95 border-t border-slate-700 transition-all duration-300',
      collapsed ? 'h-9' : 'h-44'
    )}>
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer border-b border-slate-700 hover:bg-slate-800/50"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-purple-400" />
          <span className="text-xs font-semibold text-slate-200">THREAT TIMELINE (24H)</span>
        </div>
        {collapsed ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </div>

      {!collapsed && (
        <div className="h-32 px-2 py-1">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
              No data yet — events will appear as they are detected.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                {types.map((type) => (
                  <Area
                    key={type}
                    type="monotone"
                    dataKey={type}
                    stackId="1"
                    stroke={THREAT_COLORS[type] ?? '#64748b'}
                    fill={THREAT_COLORS[type] ?? '#64748b'}
                    fillOpacity={0.3}
                    strokeWidth={1.5}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
