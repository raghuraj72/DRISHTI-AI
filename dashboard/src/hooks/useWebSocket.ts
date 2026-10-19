// src/hooks/useWebSocket.ts — Auto-reconnecting WebSocket hook
import { useEffect, useRef, useState, useCallback } from 'react';
import { useDrishtiStore } from '../store/useDrishtiStore';
import { playTacticalPing } from '../utils/audioAlert';
import type { LiveMessage, ThreatEvent, Alert, SituationReport } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/live';
const MAX_RECONNECT_DELAY = 30000;

export type WsState = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(2000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const [connectionState, setConnectionState] = useState<WsState>('DISCONNECTED');

  const { addEvent, addAlert, setLatestReport, setWsConnected } = useDrishtiStore();

  const handleMessage = useCallback((msg: LiveMessage) => {
    switch (msg.type) {
      case 'THREAT_EVENTS':
      case 'AIRTRAFFIC_EVENTS':
      case 'MARITIME_EVENTS':
      case 'SEISMIC_EVENTS': {
        // Payload may be a raw ingestion event — map to ThreatEvent if threat_score present
        const p = msg.payload as Partial<ThreatEvent>;
        if (p.threat_score !== undefined && p.location) {
          addEvent(p as ThreatEvent);
        }
        break;
      }
      case 'ALERT': {
        const alertData = msg.payload as unknown as Alert;
        addAlert(alertData);
        if (alertData.priority === 'CRITICAL') {
          playTacticalPing('CRITICAL');
        } else if (alertData.priority === 'HIGH') {
          playTacticalPing('HIGH');
        }
        break;
      }
      case 'SITUATION_REPORT':
        setLatestReport(msg.payload as unknown as SituationReport);
        break;
      case 'ALERT_ACKNOWLEDGED': {
        const { alert_id } = msg.payload as { alert_id: string };
        useDrishtiStore.getState().acknowledgeAlert(alert_id);
        break;
      }
      case 'PING':
        ws.current?.send(JSON.stringify({ type: 'PONG' }));
        break;
      default:
        break;
    }
  }, [addEvent, addAlert, setLatestReport]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setConnectionState('CONNECTING');
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      setConnectionState('CONNECTED');
      setWsConnected(true);
      reconnectDelay.current = 2000;
      console.log('[DRISHTI-WS] Connected');
    };

    socket.onmessage = (event) => {
      try {
        const msg: LiveMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    socket.onclose = () => {
      setConnectionState('RECONNECTING');
      setWsConnected(false);
      console.log(`[DRISHTI-WS] Disconnected. Reconnecting in ${reconnectDelay.current}ms`);
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY);
        connect();
      }, reconnectDelay.current);
    };

    socket.onerror = () => {
      socket.close();
    };

    ws.current = socket;
  }, [handleMessage, setWsConnected]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  return { connectionState, isConnected: connectionState === 'CONNECTED' };
}
