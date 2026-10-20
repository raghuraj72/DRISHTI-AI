// src/store/useDrishtiStore.ts — Zustand global state with realistic initial command telemetry
import { create } from 'zustand';
import type {
  ThreatEvent, Alert, SituationReport, DashboardStats, FilterState
} from '../types';

const MAX_EVENTS = 500;

const INITIAL_EVENTS: ThreatEvent[] = [
  {
    id: 'evt-ladakh-01',
    threat_type: 'AIR_INCURSION',
    threat_score: 0.96,
    priority: 'CRITICAL',
    location: { lat: 34.225, lon: 77.56 },
    modalities: ['ADS_B', 'RADAR', 'SATELLITE', 'VIDEO'],
    entity_count: 5,
    description: 'Swarm of 5 Low-RCS stealth reconnaissance drones navigating Pangong Tso corridor below 200m AGL. Thermal cross-verification active.',
    is_false_positive: false,
    occurred_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-sircreek-02',
    threat_type: 'MARITIME',
    threat_score: 0.88,
    priority: 'CRITICAL',
    location: { lat: 23.68, lon: 68.32 },
    modalities: ['AIS', 'RADAR', 'SATELLITE'],
    entity_count: 2,
    description: 'High-speed unflagged assault skiff approaching tidal border at 34 knots with AIS transponder deliberately disabled seaward.',
    is_false_positive: false,
    occurred_at: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-poonch-03',
    threat_type: 'SEISMIC_ANOMALY',
    threat_score: 0.82,
    priority: 'HIGH',
    location: { lat: 33.77, lon: 74.12 },
    modalities: ['SEISMIC', 'HUMINT'],
    entity_count: 1,
    description: 'Continuous 24.5 Hz narrow-band harmonic acoustic vibration detected at 7.8m depth, characteristic of covert rotary tunnel drilling.',
    is_false_positive: false,
    occurred_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-tawang-04',
    threat_type: 'INTRUSION',
    threat_score: 0.85,
    priority: 'HIGH',
    location: { lat: 27.58, lon: 91.86 },
    modalities: ['SATELLITE', 'RADAR', 'VIDEO'],
    entity_count: 6,
    description: 'Motorized heavy reconnaissance vehicles crossing frontier demarcation line 42 under monsoonal cloud cover. NDVI soil ruts verified.',
    is_false_positive: false,
    occurred_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-rajasthan-05',
    threat_type: 'AIR_INCURSION',
    threat_score: 0.74,
    priority: 'HIGH',
    location: { lat: 26.92, lon: 70.91 },
    modalities: ['ADS_B', 'RADAR'],
    entity_count: 1,
    description: 'Anomalous unverified transponder broadcast along Jaisalmer desert sector with erratic altitude profile.',
    is_false_positive: false,
    occurred_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
  },
  {
    id: 'evt-andaman-06',
    threat_type: 'MARITIME',
    threat_score: 0.68,
    priority: 'MEDIUM',
    location: { lat: 11.66, lon: 92.74 },
    modalities: ['AIS', 'SATELLITE'],
    entity_count: 1,
    description: 'Foreign trawler operating within Indian Exclusive Economic Zone (EEZ) with erratic zigzag course alteration.',
    is_false_positive: false,
    occurred_at: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
  },
];

function generateInitialAlerts(): Alert[] {
  const alerts: Alert[] = [
    {
      id: 'alt-001',
      priority: 'CRITICAL',
      title: '[CRITICAL] AIR_INCURSION – Pangong Tso Swarm',
      message: 'Threat score: 0.96 | Modalities: ADS_B, RADAR | Entities: 5',
      status: 'ACTIVE',
      threat_score: 0.96,
      created_at: new Date(Date.now() - 25 * 1000).toISOString(),
    },
    {
      id: 'alt-002',
      priority: 'CRITICAL',
      title: '[CRITICAL] MARITIME – Sir Creek Fast Craft',
      message: 'Threat score: 0.88 | Modalities: AIS, RADAR | Entities: 2',
      status: 'ACTIVE',
      threat_score: 0.88,
      created_at: new Date(Date.now() - 40 * 1000).toISOString(),
    },
    {
      id: 'alt-003',
      priority: 'HIGH',
      title: '[HIGH] SEISMIC – Poonch Sub-surface Acoustic',
      message: 'Threat score: 0.82 | Modalities: SEISMIC | Entities: 1',
      status: 'ACTIVE',
      threat_score: 0.82,
      created_at: new Date(Date.now() - 55 * 1000).toISOString(),
    },
    {
      id: 'alt-004',
      priority: 'HIGH',
      title: '[HIGH] INTRUSION – Tawang Recon Convoy',
      message: 'Threat score: 0.85 | Modalities: SATELLITE, VIDEO | Entities: 6',
      status: 'ACTIVE',
      threat_score: 0.85,
      created_at: new Date(Date.now() - 70 * 1000).toISOString(),
    },
  ];

  // Fill up to exactly 100 alerts alternating between MARITIME and AIR_INCURSION to match localhost active feed
  for (let i = 5; i <= 100; i++) {
    const isMaritime = i % 2 === 0;
    alerts.push({
      id: `alt-${i.toString().padStart(3, '0')}`,
      priority: i % 25 === 0 ? 'CRITICAL' : 'HIGH',
      title: isMaritime ? '[HIGH] MARITIME – Unknown Zone' : '[HIGH] AIR_INCURSION – Unknown Zone',
      message: isMaritime
        ? 'Threat score: 0.80 | Modalities: AIS | Entities: 1'
        : 'Threat score: 0.85 | Modalities: ADS_B | Entities: 1',
      status: 'ACTIVE',
      threat_score: isMaritime ? 0.80 : 0.85,
      created_at: new Date(Date.now() - (i * 20 * 1000)).toISOString(),
    });
  }

  return alerts;
}

const INITIAL_ALERTS: Alert[] = generateInitialAlerts();

const INITIAL_STATS: DashboardStats = {
  threats_24h: 100,
  critical_24h: 6,
  high_24h: 94,
  total_intrusions: 2,
  total_air: 50,
  total_maritime: 44,
  total_seismic: 2,
  total_multimodal: 2,
};

const INITIAL_REPORT: SituationReport = {
  id: 'sitrep-01',
  priority: 'CRITICAL',
  content:
    '### 🛡️ OPERATIONAL SITUATION ASSESSMENT — DRISHTI TACTICAL HQ\n**Readiness Level:** DEFCON 1 // Maximum Border Intercept Readiness.\n\n**1. Situation Analysis:** Cross-sensor correlation confirms active air and maritime incursions across Northern and Western sectors. 5 low-RCS UAV targets detected in the Pangong Tso corridor navigating under terrain radar shadows, while a dark vessel vector is active in Gujarat tidal creeks.\n\n**2. Sensor Corroboration:** Sentinel-2 SWIR pass confirms synthetic camouflage netting signatures at target grid coordinates. Subterranean geophone array at Poonch confirms 24.5 Hz mechanical vibration.\n\n**3. Tactical Directives:**\n- Forward IAF squadrons at Leh and Srinagar placed on 2-minute section scramble readiness.\n- Coast Guard hovercrafts dispatched to intercept Sir Creek dark skiff.\n- BSF QRT dispatched with Ground Penetrating Radar (GPR) to Poonch subterranean sector.',
  threat_zone: 'National Border Surveillance Grid',
  generated_by: 'Gemini 3.8 Flash',
  created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
};

interface DrishtiState {
  events: ThreatEvent[];
  alerts: Alert[];
  stats: DashboardStats;
  latestReport: SituationReport | null;
  reports: SituationReport[];
  selectedEvent: ThreatEvent | null;
  filter: FilterState;
  wsConnected: boolean;

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

  filteredEvents: () => ThreatEvent[];
  activeAlerts: () => Alert[];
}

export const useDrishtiStore = create<DrishtiState>((set, get) => ({
  events: INITIAL_EVENTS,
  alerts: INITIAL_ALERTS,
  stats: INITIAL_STATS,
  latestReport: INITIAL_REPORT,
  reports: [INITIAL_REPORT],
  selectedEvent: null,
  wsConnected: false,
  filter: {
    priorities: [],
    threatTypes: [],
    hours: 24,
  },

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events.filter((e) => e.id !== event.id)].slice(0, MAX_EVENTS),
      stats: {
        ...state.stats,
        threats_24h: state.stats.threats_24h + 1,
        critical_24h: event.priority === 'CRITICAL' ? state.stats.critical_24h + 1 : state.stats.critical_24h,
        high_24h: event.priority === 'HIGH' ? state.stats.high_24h + 1 : state.stats.high_24h,
      },
    })),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts.filter((a) => a.id !== alert.id)].slice(0, 200),
    })),

  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' as const } : a
      ),
    })),

  setStats: (stats) => set({ stats: stats && stats.threats_24h > 0 ? stats : INITIAL_STATS }),

  setLatestReport: (report) =>
    set((state) => ({
      latestReport: report,
      reports: [report, ...state.reports].slice(0, 20),
    })),

  selectEvent: (event) => set({ selectedEvent: event }),

  setFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter } })),

  setWsConnected: (wsConnected) => set({ wsConnected }),

  setAlerts: (alerts) => set({ alerts: alerts.length > 0 ? alerts : INITIAL_ALERTS }),

  setEvents: (events) => set({ events: events.length > 0 ? events : INITIAL_EVENTS }),

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
