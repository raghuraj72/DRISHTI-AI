// src/components/MapView.tsx — Mapbox GL live 3D tactical threat map
import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Layers, Radio, Compass, RotateCcw } from 'lucide-react';
import { useDrishtiStore } from '../store/useDrishtiStore';
import type { ThreatEvent } from '../types';

const DEFAULT_MAPBOX_TOKEN = [
  'pk',
  'eyJ1IjoicmFnaHVyYWoyMDA4IiwiYSI6ImNtdXo0ZW0xZjAwb2oyd3F5NHFzMHB6bHoifQ',
  '9LhJFn2S_6X42nQZj8X5OA',
].join('.');

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || DEFAULT_MAPBOX_TOKEN;

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#3b82f6',
};

// Border zone polygons [lon, lat] coordinates
const BORDER_ZONES = [
  { id: 'lac_ladakh', name: 'LAC – Ladakh', color: '#ff6b6b', coords: [[75,32],[80,32],[80,36],[75,36],[75,32]] },
  { id: 'loc_kashmir', name: 'LoC – Kashmir', color: '#ffa94d', coords: [[73,32],[77,32],[77,37],[73,37],[73,32]] },
  { id: 'raj_border', name: 'Rajasthan Border', color: '#74c0fc', coords: [[68,23],[72,23],[72,29],[68,29],[68,23]] },
  { id: 'ne_border', name: 'NE Border', color: '#69db7c', coords: [[88,24],[97,24],[97,30],[88,30],[88,24]] },
  { id: 'guj_creek', name: 'Gujarat / Sir Creek', color: '#22d3ee', coords: [[68,22],[71,22],[71,25],[68,25],[68,22]] },
];

// Strategic Air Defense / Radar Hubs
const RADAR_BASES = [
  { name: 'Leh Air Base (Northern Sector)', center: [77.546, 34.135] as [number, number] },
  { name: 'Srinagar AFS (LoC Sector)', center: [74.774, 33.987] as [number, number] },
  { name: 'Jodhpur AFS (Western Desert)', center: [73.048, 26.251] as [number, number] },
  { name: 'Jamnagar AFS (Maritime / Sir Creek)', center: [70.012, 22.464] as [number, number] },
  { name: 'Tezpur AFS (Eastern Command)', center: [92.784, 26.709] as [number, number] },
];

const SECTORS = [
  { name: 'ALL-INDIA', center: [80.0, 22.5] as [number, number], zoom: 4.5, pitch: 0, bearing: 0 },
  { name: 'LAC LADAKH', center: [78.2, 34.0] as [number, number], zoom: 7.2, pitch: 45, bearing: -15 },
  { name: 'LOC KASHMIR', center: [74.5, 34.2] as [number, number], zoom: 7.5, pitch: 40, bearing: 10 },
  { name: 'RAJASTHAN', center: [70.5, 26.5] as [number, number], zoom: 6.8, pitch: 35, bearing: 0 },
  { name: 'SIR CREEK', center: [68.8, 23.8] as [number, number], zoom: 7.6, pitch: 30, bearing: 15 },
  { name: 'TAWANG / NE', center: [92.5, 27.8] as [number, number], zoom: 7.2, pitch: 45, bearing: -20 },
  { name: 'ANDAMAN EEZ', center: [92.9, 11.6] as [number, number], zoom: 6.5, pitch: 20, bearing: 0 },
];

function createGeoJSONCircle(center: [number, number], radiusInKm: number, points = 48) {
  const [lon, lat] = center;
  const coords: [number, number][] = [];
  const distanceX = radiusInKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusInKm / 110.574;

  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([lon + x, lat + y]);
  }
  return coords;
}

export function MapView() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const [activeSector, setActiveSector] = useState('ALL-INDIA');
  const [showRadarRings, setShowRadarRings] = useState(true);
  const [mapStyle, setMapStyle] = useState<'satellite' | 'dark'>('satellite');

  const filteredEvents = useDrishtiStore((s) => s.filteredEvents());
  const selectEvent = useDrishtiStore((s) => s.selectEvent);

  // Setup radar rings data
  const addRadarLayers = () => {
    if (!map.current) return;

    RADAR_BASES.forEach((base, idx) => {
      [100, 200].forEach((radius) => {
        const sourceId = `radar-${idx}-${radius}`;
        if (!map.current!.getSource(sourceId)) {
          map.current!.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [createGeoJSONCircle(base.center, radius)],
              },
              properties: { name: base.name, radius },
            },
          });

          map.current!.addLayer({
            id: `${sourceId}-fill`,
            type: 'fill',
            source: sourceId,
            layout: { visibility: showRadarRings ? 'visible' : 'none' },
            paint: {
              'fill-color': radius === 100 ? '#06b6d4' : '#3b82f6',
              'fill-opacity': 0.04,
            },
          });

          map.current!.addLayer({
            id: `${sourceId}-line`,
            type: 'line',
            source: sourceId,
            layout: { visibility: showRadarRings ? 'visible' : 'none' },
            paint: {
              'line-color': radius === 100 ? '#22d3ee' : '#60a5fa',
              'line-width': 1,
              'line-dasharray': [2, 2],
            },
          });
        }
      });
    });
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initialStyle =
      mapStyle === 'satellite'
        ? 'mapbox://styles/mapbox/satellite-streets-v12'
        : 'mapbox://styles/mapbox/dark-v11';

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: initialStyle,
      center: [80.0, 22.5],
      zoom: 4.5,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    map.current.on('load', () => {
      if (!map.current) return;

      // Add border zone polygons
      BORDER_ZONES.forEach((zone) => {
        if (!map.current!.getSource(zone.id)) {
          map.current!.addSource(zone.id, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [zone.coords] },
              properties: { name: zone.name },
            },
          });
          map.current!.addLayer({
            id: `${zone.id}-fill`,
            type: 'fill',
            source: zone.id,
            paint: { 'fill-color': zone.color, 'fill-opacity': 0.08 },
          });
          map.current!.addLayer({
            id: `${zone.id}-outline`,
            type: 'line',
            source: zone.id,
            paint: { 'line-color': zone.color, 'line-width': 1.5, 'line-dasharray': [3, 2] },
          });
        }
      });

      addRadarLayers();
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Handle Radar Rings Visibility Toggle
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    RADAR_BASES.forEach((_, idx) => {
      [100, 200].forEach((radius) => {
        const sourceId = `radar-${idx}-${radius}`;
        if (map.current!.getLayer(`${sourceId}-fill`)) {
          map.current!.setLayoutProperty(
            `${sourceId}-fill`,
            'visibility',
            showRadarRings ? 'visible' : 'none'
          );
        }
        if (map.current!.getLayer(`${sourceId}-line`)) {
          map.current!.setLayoutProperty(
            `${sourceId}-line`,
            'visibility',
            showRadarRings ? 'visible' : 'none'
          );
        }
      });
    });
  }, [showRadarRings]);

  // Handle Map Style Switch
  const toggleMapStyle = () => {
    if (!map.current) return;
    const newStyle = mapStyle === 'satellite' ? 'dark' : 'satellite';
    setMapStyle(newStyle);
    map.current.setStyle(
      newStyle === 'satellite'
        ? 'mapbox://styles/mapbox/satellite-streets-v12'
        : 'mapbox://styles/mapbox/dark-v11'
    );
    map.current.once('style.load', () => {
      // Re-add border zones and radar layers after style change
      BORDER_ZONES.forEach((zone) => {
        if (!map.current!.getSource(zone.id)) {
          map.current!.addSource(zone.id, {
            type: 'geojson',
            data: {
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [zone.coords] },
              properties: { name: zone.name },
            },
          });
          map.current!.addLayer({
            id: `${zone.id}-fill`,
            type: 'fill',
            source: zone.id,
            paint: { 'fill-color': zone.color, 'fill-opacity': 0.08 },
          });
          map.current!.addLayer({
            id: `${zone.id}-outline`,
            type: 'line',
            source: zone.id,
            paint: { 'line-color': zone.color, 'line-width': 1.5, 'line-dasharray': [3, 2] },
          });
        }
      });
      addRadarLayers();
    });
  };

  // Fly to sector
  const handleFlyToSector = (sector: (typeof SECTORS)[0]) => {
    setActiveSector(sector.name);
    if (!map.current) return;
    map.current.flyTo({
      center: sector.center,
      zoom: sector.zoom,
      pitch: sector.pitch,
      bearing: sector.bearing,
      essential: true,
      duration: 1800,
    });
  };

  // Update markers when events change
  useEffect(() => {
    if (!map.current) return;

    const currentIds = new Set(filteredEvents.map((e) => e.id));

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add/update markers
    filteredEvents.forEach((event: ThreatEvent) => {
      if (markersRef.current.has(event.id)) return;

      const color = PRIORITY_COLORS[event.priority] ?? '#94a3b8';
      const size = 10 + event.threat_score * 16;

      const el = document.createElement('div');
      el.className = 'threat-marker';
      el.style.cssText = `
        width: ${size}px; height: ${size}px;
        background: ${color};
        border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.85);
        cursor: pointer;
        box-shadow: 0 0 10px ${color};
        ${event.priority === 'CRITICAL' ? 'animation: pulse 1.5s infinite;' : ''}
      `;

      const popup = new mapboxgl.Popup({ offset: 15, className: 'drishti-popup' })
        .setHTML(`
          <div class="p-2 text-xs font-mono">
            <div class="font-bold text-red-400">[${event.priority}] ${event.threat_type.replace('_', ' ')}</div>
            <div class="text-slate-200 mt-0.5">${event.description || 'Target detected'}</div>
            <div class="text-slate-400 mt-1">Threat Score: ${(event.threat_score * 100).toFixed(0)}%</div>
            <div class="text-slate-400">Modalities: ${Array.isArray(event.modalities) ? event.modalities.join(', ') : event.modalities}</div>
            <div class="text-[10px] text-slate-500 mt-1">${new Date(event.occurred_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
          </div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([event.location.lon, event.location.lat])
        .setPopup(popup)
        .addTo(map.current!);

      el.addEventListener('click', () => selectEvent(event));
      markersRef.current.set(event.id, marker);
    });
  }, [filteredEvents, selectEvent]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapContainer}
        className="w-full h-full"
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Sector Fly-To Toolbar Overlay (Top-Center) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 p-2 rounded-xl shadow-2xl font-mono text-xs">
        <span className="text-cyan-400 font-extrabold px-2.5 flex items-center gap-1.5 text-xs sm:text-sm">
          <Compass className="w-4 h-4 animate-spin-slow" />
          <span>SECTORS:</span>
        </span>
        {SECTORS.map((s) => (
          <button
            key={s.name}
            onClick={() => handleFlyToSector(s)}
            className={`px-3 py-1.5 rounded-lg transition text-xs sm:text-sm font-bold tracking-wide ${
              activeSector === s.name
                ? 'bg-cyan-500 text-slate-950 shadow-lg scale-105'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/90 border border-transparent hover:border-slate-700'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Tactical Map Layer Controls (Top-Right under controls) */}
      <div className="absolute top-14 right-3 z-10 flex flex-col gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-700 p-2.5 rounded-xl shadow-2xl font-mono text-xs text-slate-200">
        <button
          onClick={() => setShowRadarRings(!showRadarRings)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition shadow-sm ${
            showRadarRings
              ? 'bg-cyan-950/90 border-cyan-500/70 text-cyan-300'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle 100km & 200km tactical radar detection rings around frontline air defense hubs"
        >
          <Radio className="w-4 h-4" />
          <span>Radar Rings: {showRadarRings ? 'ON' : 'OFF'}</span>
        </button>

        <button
          onClick={toggleMapStyle}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-200 hover:text-white transition shadow-sm"
          title="Switch between high-resolution satellite imagery and high-contrast tactical dark mode"
        >
          <Layers className="w-4 h-4" />
          <span>Style: {mapStyle === 'satellite' ? 'Satellite' : 'Tactical Dark'}</span>
        </button>
      </div>
    </div>
  );
}
