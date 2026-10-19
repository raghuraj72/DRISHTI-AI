// src/hooks/useApi.ts — TanStack Query hooks for REST API
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type { ThreatEvent, Alert, SituationReport, DashboardStats, TrackPoint } from '../types';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: BASE });

export function useEvents(hours = 24, limit = 100) {
  return useQuery<ThreatEvent[]>({
    queryKey: ['events', hours, limit],
    queryFn: () => api.get(`/api/v1/events?hours=${hours}&limit=${limit}`).then((r) => r.data),
    refetchInterval: 30_000,
  });
}

export function useAlerts(status = 'ACTIVE', limit = 100) {
  return useQuery<Alert[]>({
    queryKey: ['alerts', status],
    queryFn: () => api.get(`/api/v1/alerts?status=${status}&limit=${limit}`).then((r) => r.data),
    refetchInterval: 15_000,
  });
}

export function useStats() {
  return useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: () => api.get('/api/v1/stats').then((r) => r.data),
    refetchInterval: 60_000,
  });
}

export function useReports(limit = 10) {
  return useQuery<SituationReport[]>({
    queryKey: ['reports'],
    queryFn: () => api.get(`/api/v1/reports?limit=${limit}`).then((r) => r.data),
    refetchInterval: 60_000,
  });
}

export function useTrack(entityId: string | null, hours = 6) {
  return useQuery<TrackPoint[]>({
    queryKey: ['track', entityId, hours],
    queryFn: () => api.get(`/api/v1/tracks/${entityId}?hours=${hours}`).then((r) => r.data),
    enabled: !!entityId,
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, operator }: { alertId: string; operator: string }) =>
      api.patch(`/api/v1/alerts/${alertId}/acknowledge`, { acknowledged_by: operator }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      api.post(`/api/v1/reports/generate?alert_id=${alertId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}
