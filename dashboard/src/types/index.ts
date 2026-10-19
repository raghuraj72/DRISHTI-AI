// src/types/index.ts — DRISHTI-AI TypeScript types

export type ThreatType =
  | 'INTRUSION'
  | 'AIR_INCURSION'
  | 'MARITIME'
  | 'SEISMIC_ANOMALY'
  | 'MULTI_MODAL'
  | 'CYBER'
  | 'UNKNOWN';

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE';
export type Modality = 'VIDEO' | 'SATELLITE' | 'ADS_B' | 'AIS' | 'SEISMIC' | 'RADAR' | 'HUMINT';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface ThreatEvent {
  id: string;
  threat_type: ThreatType;
  threat_score: number;
  priority: Priority;
  location: GeoPoint;
  modalities: Modality[];
  entity_count: number;
  description?: string;
  border_zone_id?: string;
  is_false_positive: boolean;
  occurred_at: string;
}

export interface Alert {
  id: string;
  priority: Priority;
  title: string;
  message: string;
  status: AlertStatus;
  threat_event_id?: string;
  threat_type?: ThreatType;
  threat_score?: number;
  created_at: string;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  altitude_m?: number;
  speed_mps?: number;
  heading_deg?: number;
  recorded_at: string;
}

export interface SituationReport {
  id: string;
  priority: Priority;
  content: string;
  threat_zone?: string;
  generated_by: string;
  created_at: string;
}

export interface DashboardStats {
  threats_24h: number;
  critical_24h: number;
  high_24h: number;
  total_intrusions: number;
  total_air: number;
  total_maritime: number;
  total_seismic: number;
  total_multimodal: number;
}

export interface BorderZone {
  id: string;
  name: string;
  code: string;
  description?: string;
}

export interface LiveMessage {
  type:
    | 'CONNECTED'
    | 'PING'
    | 'THREAT_EVENTS'
    | 'AIRTRAFFIC_EVENTS'
    | 'MARITIME_EVENTS'
    | 'SEISMIC_EVENTS'
    | 'ALERT'
    | 'SITUATION_REPORT'
    | 'ALERT_ACKNOWLEDGED';
  payload: Record<string, unknown>;
}

export interface FilterState {
  priorities: Priority[];
  threatTypes: ThreatType[];
  hours: number;
}
