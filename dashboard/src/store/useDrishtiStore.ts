// src/store/useDrishtiStore.ts — Zustand global state
import { create } from 'zustand';
import type {
  ThreatEvent, Alert, SituationReport, DashboardStats, FilterState, Priority, ThreatType
} from '../types';

const MAX_EVENTS = 500;

interface DrishtiState {
  // Data
  events: ThreatEvent[];
  alerts: Alert[];
  stats: DashboardStats;
  latestReport: SituationReport | null;
  reports: SituationReport[];
  selectedEvent: ThreatEvent | null;
  filter: FilterState;
  wsConnected: boolean;

  // Actions
  addEvent: (event: ThreatEvent) => void;
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (alertId: string) => void;
  setStats: (stats: DashboardStats) => void;
  setLatestReport: (report: SituationReport) => void;
  selectEvent: (event: ThreatEvent | null) => void;
  setFilter: (filter: Partial<FilterState>) => void;
  setWsConnected: (connected: boolean) => void;
  setAlerts: (alerts: Alert[]) => void;
  setEvents: (events: ThreatEvent[]) => void;

  // Computed
  filteredEvents: () => ThreatEvent[];
  activeAlerts: () => Alert[];
}

const DEFAULT_STATS: DashboardStats = {
  threats_24h: 0, critical_24h: 0, high_24h: 0,
  total_intrusions: 0, total_air: 0, total_maritime: 0,
  total_seismic: 0, total_multimodal: 0,
};

export const useDrishtiStore = create<DrishtiState>((set, get) => ({
  events: [],
  alerts: [],
  stats: DEFAULT_STATS,
  latestReport: null,
  reports: [],
  selectedEvent: null,
  wsConnected: false,
  filter: {
    priorities: [],
    threatTypes: [],
    hours: 24,
  },

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_EVENTS),
    })),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 200),
    })),

  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' as const } : a
      ),
    })),

  setStats: (stats) => set({ stats }),

  setLatestReport: (report) =>
    set((state) => ({
      latestReport: report,
      reports: [report, ...state.reports].slice(0, 20),
    })),

  selectEvent: (event) => set({ selectedEvent: event }),

  setFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter } })),

  setWsConnected: (wsConnected) => set({ wsConnected }),

  setAlerts: (alerts) => set({ alerts }),

  setEvents: (events) => set({ events }),

  filteredEvents: () => {
    const { events, filter } = get();
    return events.filter((e) => {
      if (filter.priorities.length > 0 && !filter.priorities.includes(e.priority)) return false;
      if (filter.threatTypes.length > 0 && !filter.threatTypes.includes(e.threat_type)) return false;
      return true;
    });
  },

  activeAlerts: () => get().alerts.filter((a) => a.status === 'ACTIVE'),
}));
