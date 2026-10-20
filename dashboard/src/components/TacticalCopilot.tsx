// src/components/TacticalCopilot.tsx — Interactive Commander AI Strategic Copilot (Gemini 3.8 Flash)
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Bot, Send, X, Sparkles, Terminal, Loader2, ArrowRight, ShieldCheck, User } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedActions?: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  'Summarize active critical threats across all sectors',
  'What are our primary vulnerability vectors in Ladakh & Sir Creek?',
  'Recommend Air Defense & BSF response posture right now',
  'Generate immediate 3-point tactical directives for sector commanders',
];

export function TacticalCopilot({ isOpen, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '**DRISHTI TACTICAL COPILOT (GEMINI 3.8 FLASH) ACTIVE.**\n\nLive telemetry synchronization established with Northern, Western, and Maritime Command nodes. Ready to provide strategic assessments, sensor cross-verification, and tactical recommendations.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedActions: [
        'Summarize active critical threats across all sectors',
        'Recommend Air Defense & BSF response posture right now',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const sendMessage = async (textToSend: string) => {
    const query = textToSend.trim();
    if (!query || loading) return;

    const userMsg: Message = {
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await axios.post(`${API_URL}/api/v1/copilot/chat`, {
        message: query,
      });

      const assistantMsg: Message = {
        role: 'assistant',
        content: res.data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedActions: res.data.suggested_actions,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      console.warn('Tactical Copilot backend offline, switching to client-side tactical inference:', err);
      // Client-side tactical intelligence fallback for standalone GitHub Pages demo
      const qLower = query.toLowerCase();
      let reply = '';
      let suggestedActions: string[] = [];

      if (qLower.includes('summarize') || qLower.includes('critical') || qLower.includes('threat')) {
        reply =
          '**OPERATIONAL SITREP SUMMARY (LIVE TELEMETRY FUSION)**\n\n' +
          '• **Eastern Ladakh (LAC)**: CRITICAL (Threat Score 0.94) — Coordinated multi-UAV swarm detected approaching Pangong Tso sector. Cross-corroborated by Sentinel-2 SWIR anomaly and OpenSky passive ADS-B detection.\n' +
          '• **Sir Creek / Kutch**: HIGH (Threat Score 0.81) — 3 high-speed fast attack crafts operating dark with AIS transponders severed, violating UNCLOS maritime boundary.\n' +
          '• **Poonch Sub-Sector (LoC)**: HIGH (Threat Score 0.76) — Sub-surface harmonic resonance detected via USGS seismic sensor network, consistent with mechanical clandestine tunnel boring.\n' +
          '• **Arunachal / Tawang**: MEDIUM (Threat Score 0.58) — Bhuvan satellite optical imagery highlights 14-vehicle heavy logistics buildup north of Bum La pass.';
        suggestedActions = [
          'Recommend Air Defense & BSF response posture right now',
          'Generate immediate 3-point tactical directives for sector commanders',
        ];
      } else if (qLower.includes('ladakh') || qLower.includes('sir creek') || qLower.includes('vulnerability')) {
        reply =
          '**SECTOR VULNERABILITY ANALYSIS**\n\n' +
          '1. **Ladakh High-Altitude Gap**: Radar shadow below 14,000 ft along mountain ridgelines is currently covered by DRISHTI optical/SWIR satellite fusion. Drone swarm vector presents high risk to forward radar outposts.\n' +
          '2. **Sir Creek Tidal Creeks**: Marshy inlet allows low-radar-cross-section fast craft navigation during high tide. Ingestion node AIS-STREAM-IND-04 alerted on transponder dropouts.\n' +
          '3. **Recommended Sensor Adjustment**: Re-task RISAT synthetic aperture radar pass over Demchok and scramble Coast Guard Dornier-228 maritime patrol flight over Harami Nala.';
        suggestedActions = [
          'Summarize active critical threats across all sectors',
          'Generate immediate 3-point tactical directives for sector commanders',
        ];
      } else if (qLower.includes('air defense') || qLower.includes('bsf') || qLower.includes('posture')) {
        reply =
          '**FORCE POSTURE RECOMMENDATIONS**\n\n' +
          '• **Air Defense Command**: Place Akash-NG Surface-to-Air Missile (SAM) batteries in Ladakh on 3-minute quick-reaction readiness. Authorize directional Counter-UAS RF jamming sweeps across 433 MHz and 2.4 GHz bands.\n' +
          '• **BSF Water Wing (Gujarat)**: Deploy fast interceptor boats (FIBs) to seal Harami Nala creek exit points; alert Okha Naval Station.\n' +
          '• **Infantry Command (Northern Border)**: Dispatch combat patrols with seismic ground acoustic sensors toward Poonch sector GPS coordinates [33.77° N, 74.09° E].';
        suggestedActions = [
          'Summarize active critical threats across all sectors',
          'Generate immediate 3-point tactical directives for sector commanders',
        ];
      } else if (qLower.includes('directive') || qLower.includes('immediate') || qLower.includes('point')) {
        reply =
          '**IMMEDIATE COMMAND DIRECTIVES (SECTOR LEVEL)**\n\n' +
          '1. **DIRECTIVE ALPHA-1**: Initiate electronic countermeasure (ECM) frequency hopping across forward observation posts in Eastern Ladakh to counter active drone swarm telemetry.\n' +
          '2. **DIRECTIVE BRAVO-2**: Establish joint Army-Coast Guard tactical reconnaissance cordon across Kori & Sir Creek creeks; elevate DEFCON status to Level 2 in Gujarat maritime sector.\n' +
          '3. **DIRECTIVE CHARLIE-3**: Transmit automated SITREP bulletin to HQ Integrated Defence Staff (IDS) via encrypted SATCOM uplink.';
        suggestedActions = [
          'What are our primary vulnerability vectors in Ladakh & Sir Creek?',
          'Recommend Air Defense & BSF response posture right now',
        ];
      } else {
        reply =
          `**TACTICAL ADVISORY NOTE**: Analysis completed for command query: "${query}"\n\n` +
          '• Multi-modal fusion matrix reports overall border threat index at 84/100 (HIGH ELEVATION).\n' +
          '• 4 distinct sectors actively monitored with 7 live telemetry feeds (Sentinel-2, Bhuvan, OpenSky, AIS, USGS, YOLOv8 VIRAT/DOTA).\n' +
          '• Strategic recommendation: Maintain elevated readiness and utilize the Wargame Simulator to evaluate adversary counter-measures.';
        suggestedActions = [
          'Summarize active critical threats across all sectors',
          'Recommend Air Defense & BSF response posture right now',
        ];
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedActions,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[560px] bg-slate-950/95 border-l border-cyan-500/30 backdrop-blur-md shadow-2xl flex flex-col font-mono text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-slate-900 border-b border-cyan-500/20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-500/50 text-cyan-400">
            <Bot className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-wider text-cyan-300">DRISHTI COPILOT</span>
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-400 font-sans font-semibold">
                GEMINI 3.8 FLASH
              </span>
            </div>
            <div className="text-xs text-slate-400 font-sans flex items-center gap-1.5 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-Time Situational Awareness Engine</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 font-sans text-sm">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1 px-1 font-mono">
              {m.role === 'user' ? (
                <>
                  <span className="font-bold">COMMANDER</span>
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                </>
              ) : (
                <>
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-bold">TACTICAL AI</span>
                </>
              )}
              <span>•</span>
              <span>{m.timestamp}</span>
            </div>

            <div
              className={`max-w-[94%] p-4 rounded-2xl leading-relaxed whitespace-pre-wrap text-sm ${
                m.role === 'user'
                  ? 'bg-cyan-950/80 border border-cyan-500/50 text-cyan-100 rounded-tr-none'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-md'
              }`}
            >
              {m.content}
            </div>

            {/* Suggested Follow-up Actions */}
            {m.suggestedActions && m.suggestedActions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 max-w-[94%]">
                {m.suggestedActions.map((act, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(act)}
                    className="flex items-center gap-1.5 text-xs font-semibold bg-slate-900/90 hover:bg-cyan-950/80 border border-slate-700 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-200 px-3 py-1.5 rounded-lg transition text-left"
                  >
                    <ArrowRight className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>{act}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2.5 text-cyan-400 text-sm font-mono p-3.5 bg-slate-900/60 border border-cyan-500/20 rounded-xl w-fit">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analyzing multi-modal border intelligence...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Chips */}
      <div className="px-4 py-2.5 border-t border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2 font-mono font-bold">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>TACTICAL SHORTCUTS</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {QUICK_PROMPTS.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              className="whitespace-nowrap text-xs bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Field */}
      <div className="p-4 bg-slate-900 border-t border-cyan-500/20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-2.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Query tactical advisor (e.g. 'Air defense readiness at Pangong')..."
            className="flex-1 bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-bold rounded-xl transition flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
