// src/components/SituationReport.tsx — Collapsible AI-generated NL briefing
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChevronUp, ChevronDown, FileText, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import axios from 'axios';
import { useDrishtiStore } from '../store/useDrishtiStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: 'bg-red-600 text-white',
  HIGH:     'bg-orange-600 text-white',
  MEDIUM:   'bg-yellow-500 text-black',
  LOW:      'bg-blue-600 text-white',
};

export function SituationReport() {
  const [collapsed, setCollapsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const latestReport = useDrishtiStore((s) => s.latestReport);
  const alerts = useDrishtiStore((s) => s.alerts);

  async function handleGenerate() {
    const activeAlert = alerts.find((a) => a.status === 'ACTIVE');
    if (!activeAlert) return;
    setGenerating(true);
    try {
      await axios.post(`${API_URL}/api/v1/reports/generate?alert_id=${activeAlert.id}`);
    } catch {
      // report will arrive via WebSocket
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className={clsx(
      'bg-slate-900/95 border-t border-slate-700 transition-all duration-300',
      collapsed ? 'h-9' : 'h-56'
    )}>
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer border-b border-slate-700 hover:bg-slate-800/50"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">AI SITUATION REPORT</span>
          {latestReport && (
            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded', PRIORITY_LABEL[latestReport.priority])}>
              {latestReport.priority}
            </span>
          )}
          {latestReport && (
            <span className="text-[10px] text-slate-500">
              {formatDistanceToNow(new Date(latestReport.created_at), { addSuffix: true })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            disabled={generating}
            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={11} className={generating ? 'animate-spin' : ''} />
            Generate
          </button>
          {collapsed ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </div>

      {/* Report content */}
      {!collapsed && (
        <div className="h-44 overflow-y-auto px-4 py-2">
          {latestReport ? (
            <div className="prose prose-invert prose-sm max-w-none text-slate-300">
              <ReactMarkdown>{latestReport.content}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              No situation report yet — alerts will auto-generate reports for HIGH/CRITICAL threats.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
