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
      console.error('Tactical Copilot error:', err);
      const errMsg: Message = {
        role: 'assistant',
        content:
          '⚠️ **COMMUNICATION RELAY DELAY**: Tactical intelligence fallback engine engaged. Please retry or inspect telemetry directly on the map HUD.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-slate-950/95 border-l border-cyan-500/30 backdrop-blur-md shadow-2xl flex flex-col font-mono text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-cyan-500/20">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-500/50 text-cyan-400">
            <Bot className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-wider text-cyan-300">DRISHTI COPILOT</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-400 font-sans">
                GEMINI 3.8 FLASH
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-sans flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Real-Time Situational Awareness Engine</span>
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

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans text-xs">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1 font-mono">
              {m.role === 'user' ? (
                <>
                  <span>COMMANDER</span>
                  <User className="w-3 h-3 text-cyan-400" />
                </>
              ) : (
                <>
                  <Terminal className="w-3 h-3 text-cyan-400" />
                  <span>TACTICAL AI</span>
                </>
              )}
              <span>•</span>
              <span>{m.timestamp}</span>
            </div>

            <div
              className={`max-w-[92%] p-3.5 rounded-xl leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-cyan-950/80 border border-cyan-500/50 text-cyan-100 rounded-tr-none'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow'
              }`}
            >
              {m.content}
            </div>

            {/* Suggested Follow-up Actions */}
            {m.suggestedActions && m.suggestedActions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-[92%]">
                {m.suggestedActions.map((act, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(act)}
                    className="flex items-center gap-1 text-[11px] bg-slate-900/90 hover:bg-cyan-950/80 border border-slate-700 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-200 px-2.5 py-1 rounded-md transition text-left"
                  >
                    <ArrowRight className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>{act}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono p-3 bg-slate-900/60 border border-cyan-500/20 rounded-xl w-fit">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analyzing multi-modal border intelligence...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Chips */}
      <div className="px-3 py-2 border-t border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1.5 font-mono">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span>TACTICAL SHORTCUTS</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {QUICK_PROMPTS.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              className="whitespace-nowrap text-[10px] bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 px-2 py-1 rounded transition"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Field */}
      <div className="p-3 bg-slate-900 border-t border-cyan-500/20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Query tactical advisor (e.g. 'Air defense readiness at Pangong')..."
            className="flex-1 bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-bold rounded-lg transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
