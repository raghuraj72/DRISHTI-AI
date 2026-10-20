// src/pages/Dashboard.tsx — Main command layout
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { MapView } from '../components/MapView';
import { AlertPanel } from '../components/AlertPanel';
import { StatsBar } from '../components/StatsBar';
import { SituationReport } from '../components/SituationReport';
import { ThreatTimeline } from '../components/ThreatTimeline';
import { EventDetailModal } from '../components/EventDetailModal';
import { WargameSimulator } from '../components/WargameSimulator';
import { TacticalCopilot } from '../components/TacticalCopilot';
import { SitrepExportModal } from '../components/SitrepExportModal';
import { SensorGridModal } from '../components/SensorGridModal';
import { SeismicSpectrogramModal } from '../components/SeismicSpectrogramModal';
import { SatellitePassModal } from '../components/SatellitePassModal';
import { useWebSocket } from '../hooks/useWebSocket';
import { useDrishtiStore } from '../store/useDrishtiStore';
import type { ThreatEvent, Alert, DashboardStats } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function Dashboard() {
  const { isConnected } = useWebSocket();
  const { setEvents, setAlerts, setStats, selectEvent } = useDrishtiStore();

  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isSitrepOpen, setIsSitrepOpen] = useState(false);
  const [isSensorsOpen, setIsSensorsOpen] = useState(false);
  const [isSeismicOpen, setIsSeismicOpen] = useState(false);
  const [isSatelliteOpen, setIsSatelliteOpen] = useState(false);

  // Initial data fetch
  const { data: events } = useQuery<ThreatEvent[]>({
    queryKey: ['events'],
    queryFn: () => axios.get(`${API_URL}/api/v1/events?limit=100&hours=24`).then((r) => r.data),
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: () => axios.get(`${API_URL}/api/v1/alerts?status=ACTIVE&limit=100`).then((r) => r.data),
    refetchInterval: 15_000,
    retry: false,
  });

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: () => axios.get(`${API_URL}/api/v1/stats`).then((r) => r.data),
    refetchInterval: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (events && events.length > 0) setEvents(events);
  }, [events, setEvents]);

  useEffect(() => {
    if (alerts && alerts.length > 0) setAlerts(alerts);
  }, [alerts, setAlerts]);

  useEffect(() => {
    if (stats && stats.threats_24h > 0) setStats(stats);
  }, [stats, setStats]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectEvent(null);
        setIsSimulatorOpen(false);
        setIsCopilotOpen(false);
        setIsSitrepOpen(false);
        setIsSensorsOpen(false);
        setIsSeismicOpen(false);
        setIsSatelliteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectEvent]);

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans">
      {/* Top Tactical Command Bar */}
      <StatsBar
        isConnected={isConnected}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onOpenCopilot={() => setIsCopilotOpen(true)}
        onOpenSitrep={() => setIsSitrepOpen(true)}
        onOpenSensors={() => setIsSensorsOpen(true)}
        onOpenSeismic={() => setIsSeismicOpen(true)}
        onOpenSatellite={() => setIsSatelliteOpen(true)}
      />

      {/* Main Tactical Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Map & Bottom Telemetry */}
        <div className="relative flex-1 flex flex-col">
          {/* Map View */}
          <div className="relative flex-1">
            <MapView />
          </div>

          {/* Bottom Telemetry & Sitrep Strip */}
          <div className="flex border-t border-slate-800/80 bg-slate-950/90 backdrop-blur z-10">
            <div className="w-1/2 border-r border-slate-800/80">
              <ThreatTimeline />
            </div>
            <div className="w-1/2">
              <SituationReport />
            </div>
          </div>
        </div>

        {/* Right Alert Queue Sidebar */}
        <div className="w-80 shrink-0 border-l border-slate-800/80 bg-slate-950/95 overflow-hidden z-10">
          <AlertPanel />
        </div>
      </div>

      {/* Selected Map Marker Details Modal with Tactical Intercept Calculator */}
      <EventDetailModal />

      {/* Advanced Interactive Features Modals & Drawers */}
      <WargameSimulator
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
      />

      <TacticalCopilot
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
      />

      <SitrepExportModal
        isOpen={isSitrepOpen}
        onClose={() => setIsSitrepOpen(false)}
      />

      <SensorGridModal
        isOpen={isSensorsOpen}
        onClose={() => setIsSensorsOpen(false)}
      />

      <SeismicSpectrogramModal
        isOpen={isSeismicOpen}
        onClose={() => setIsSeismicOpen(false)}
      />

      <SatellitePassModal
        isOpen={isSatelliteOpen}
        onClose={() => setIsSatelliteOpen(false)}
      />
    </div>
  );
}
