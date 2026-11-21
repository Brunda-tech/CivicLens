import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  APILoadingStatus,
  CollisionBehavior,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { Compass, MapPin, Radio, ShieldAlert, Users, Wrench } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { translateCategory, translateSeverity, translateStatus } from '../i18n/translations';
import type { Complaint, WardSector } from '../types/civiclens';

interface RealTimeGooglePriorityMapProps {
  nodes: Complaint[];
  sectors: WardSector[];
  selectedNodeId?: number | null;
  onSelectNode?: (node: Complaint) => void;
  heightClass?: string;
}

type MapFilterMode = 'ALL' | 'HIGH_RED' | 'CRITICAL' | 'DUPLICATES';

const BENGALURU_CENTER = { lat: 12.963, lng: 77.638 };
const DEFAULT_ZOOM = 12;

function getPriorityPinPalette(node: Complaint): {
  background: string;
  borderColor: string;
  glyphColor: string;
  scale: number;
  glyph: string;
} {
  const isClosed = node.status === 'Resolved' || node.status === 'Rejected';
  if (isClosed) {
    return {
      background: '#10B981',
      borderColor: '#065F46',
      glyphColor: '#FFFFFF',
      scale: 0.92,
      glyph: '✓',
    };
  }
  if (node.severity === 'CRITICAL') {
    return {
      background: '#DC2626',
      borderColor: '#7F1D1D',
      glyphColor: '#FFFFFF',
      scale: 1.32,
      glyph: '!',
    };
  }
  if (node.severity === 'HIGH' || node.priority_score >= 65) {
    return {
      background: '#EF4444',
      borderColor: '#991B1B',
      glyphColor: '#FFFFFF',
      scale: 1.18,
      glyph: String(Math.min(99, node.priority_score)),
    };
  }
  if (node.severity === 'MEDIUM') {
    return {
      background: '#F59E0B',
      borderColor: '#92400E',
      glyphColor: '#111827',
      scale: 1.02,
      glyph: String(Math.min(99, node.priority_score)),
    };
  }
  return {
    background: '#10B981',
    borderColor: '#065F46',
    glyphColor: '#FFFFFF',
    scale: 0.95,
    glyph: String(Math.min(99, node.priority_score)),
  };
}

interface PriorityMarkerProps {
  node: Complaint;
  isSelected: boolean;
  zIndex: number;
  onSelectMarker: (node: Complaint, marker: google.maps.marker.AdvancedMarkerElement) => void;
}

function PriorityAdvancedMarker({
  node,
  isSelected,
  zIndex,
  onSelectMarker,
}: PriorityMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const palette = getPriorityPinPalette(node);
  const position = useMemo(
    () => ({
      lat: typeof node.lat === 'number' ? node.lat : BENGALURU_CENTER.lat,
      lng: typeof node.lng === 'number' ? node.lng : BENGALURU_CENTER.lng,
    }),
    [node.lat, node.lng]
  );

  const isDuplicate = node.is_suspected_duplicate === 1 || node.community_impact_count > 1;
  const ringOutline = isSelected
    ? '#22D3EE'
    : isDuplicate
    ? '#A78BFA'
    : palette.borderColor;

  return (
    <AdvancedMarker
      ref={markerRef}
      position={position}
      zIndex={isSelected ? 2000 : zIndex}
      title={`${node.ticket_id} · ${node.severity} (${node.priority_score}/100)`}
      collisionBehavior={
        node.severity === 'CRITICAL' || node.severity === 'HIGH'
          ? CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
          : CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
      }
      onClick={() => {
        if (marker) {
          onSelectMarker(node, marker);
        }
      }}
    >
      <Pin
        background={palette.background}
        borderColor={ringOutline}
        glyphColor={palette.glyphColor}
        scale={isSelected ? Math.max(1.38, palette.scale + 0.14) : palette.scale}
      >
        <span style={{ fontWeight: 800, fontSize: '10px', lineHeight: 1 }}>{palette.glyph}</span>
      </Pin>
    </AdvancedMarker>
  );
}

function MapCameraSync({
  selectedNode,
  resetCounter,
}: {
  selectedNode: Complaint | null;
  resetCounter: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !selectedNode) return;
    if (typeof selectedNode.lat === 'number' && typeof selectedNode.lng === 'number') {
      map.panTo({ lat: selectedNode.lat, lng: selectedNode.lng });
      const currentZoom = map.getZoom() ?? DEFAULT_ZOOM;
      if (currentZoom < 14) {
        map.setZoom(14);
      }
    }
  }, [map, selectedNode]);

  useEffect(() => {
    if (!map || resetCounter === 0) return;
    map.panTo(BENGALURU_CENTER);
    map.setZoom(DEFAULT_ZOOM);
  }, [map, resetCounter]);

  return null;
}

function MapInnerContent({
  filteredNodes,
  selectedNode,
  activeAnchor,
  onSelectMarker,
  onCloseInfoWindow,
  resetCounter,
}: {
  filteredNodes: Complaint[];
  selectedNode: Complaint | null;
  activeAnchor: google.maps.marker.AdvancedMarkerElement | null;
  onSelectMarker: (node: Complaint, marker: google.maps.marker.AdvancedMarkerElement) => void;
  onCloseInfoWindow: () => void;
  resetCounter: number;
}) {
  const { t } = useLanguage();
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/95 p-6 text-center z-20">
        <div className="max-w-sm space-y-2">
          <MapPin className="w-7 h-7 text-rose-400 mx-auto" />
          <p className="text-sm font-bold text-white">Google Maps failed to load</p>
          <p className="text-xs text-slate-400">
            Verify API key access and network connectivity to render live map tiles.
          </p>
        </div>
      </div>
    );
  }

  // Sort high-priority nodes last so red critical/high pins render cleanly on top
  const orderedNodes = [...filteredNodes].sort((a, b) => a.priority_score - b.priority_score);

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={BENGALURU_CENTER}
      defaultZoom={DEFAULT_ZOOM}
      gestureHandling="greedy"
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={true}
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{ width: '100%', height: '100%' }}
    >
      <MapCameraSync selectedNode={selectedNode} resetCounter={resetCounter} />

      {orderedNodes.map((node, index) => (
        <PriorityAdvancedMarker
          key={node.id}
          node={node}
          isSelected={selectedNode?.id === node.id}
          zIndex={
            node.severity === 'CRITICAL'
              ? 500 + index
              : node.severity === 'HIGH'
              ? 300 + index
              : index
          }
          onSelectMarker={onSelectMarker}
        />
      ))}

      {selectedNode && activeAnchor && (
        <InfoWindow anchor={activeAnchor} maxWidth={290} onCloseClick={onCloseInfoWindow}>
          <div className="text-slate-900 space-y-1.5 p-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-slate-950">
                {selectedNode.ticket_id}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                  selectedNode.severity === 'CRITICAL' || selectedNode.severity === 'HIGH'
                    ? 'bg-rose-100 text-rose-800'
                    : selectedNode.severity === 'MEDIUM'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {translateSeverity(t, selectedNode.severity)} · {selectedNode.priority_score}/100
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-900 leading-snug">
              {selectedNode.ai_summary}
            </p>
            <p className="text-[11px] text-slate-600">
              {selectedNode.ward} · {selectedNode.street_landmark}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700 pt-1 border-t border-slate-200">
              <span>{translateCategory(t, selectedNode.category)}</span>
              <span>·</span>
              <span className="font-semibold">{translateStatus(t, selectedNode.status)}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <Users className="w-3 h-3" />
                {selectedNode.affected_people_count}
              </span>
            </div>
            {selectedNode.assigned_crew && (
              <p className="text-[11px] text-cyan-800 font-medium inline-flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                <span>{selectedNode.assigned_crew}</span>
              </p>
            )}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

export function RealTimeGooglePriorityMap({
  nodes,
  selectedNodeId,
  onSelectNode,
  heightClass = 'h-[520px]',
}: RealTimeGooglePriorityMapProps) {
  const { lang, t } = useLanguage();
  const [filterMode, setFilterMode] = useState<MapFilterMode>('ALL');
  const [activeMarkerNodeId, setActiveMarkerNodeId] = useState<number | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<google.maps.marker.AdvancedMarkerElement | null>(
    null
  );
  const [resetCounter, setResetCounter] = useState(0);

  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (filterMode === 'CRITICAL') {
        return node.severity === 'CRITICAL' && node.status !== 'Resolved';
      }
      if (filterMode === 'HIGH_RED') {
        return (
          (node.severity === 'CRITICAL' || node.severity === 'HIGH') &&
          node.status !== 'Resolved'
        );
      }
      if (filterMode === 'DUPLICATES') {
        return node.is_suspected_duplicate === 1 || node.community_impact_count > 1;
      }
      return true;
    });
  }, [nodes, filterMode]);

  const activeSelectedNode = useMemo(() => {
    const idToFind = selectedNodeId ?? activeMarkerNodeId;
    if (!idToFind) return null;
    return filteredNodes.find((n) => n.id === idToFind) ?? nodes.find((n) => n.id === idToFind) ?? null;
  }, [selectedNodeId, activeMarkerNodeId, filteredNodes, nodes]);

  const redPriorityCount = useMemo(
    () =>
      nodes.filter(
        (n) =>
          (n.severity === 'CRITICAL' || n.severity === 'HIGH') &&
          n.status !== 'Resolved' &&
          n.status !== 'Rejected'
      ).length,
    [nodes]
  );

  const handleSelectMarker = useCallback(
    (node: Complaint, marker: google.maps.marker.AdvancedMarkerElement) => {
      setActiveMarkerNodeId(node.id);
      setActiveAnchor(marker);
      onSelectNode?.(node);
    },
    [onSelectNode]
  );

  const handleCloseInfoWindow = useCallback(() => {
    setActiveMarkerNodeId(null);
    setActiveAnchor(null);
  }, []);

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-800 bg-[#070D1C] text-slate-100 shadow-sm flex flex-col">
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-slate-800/90 bg-[#0B1226] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse inline-block" />
            <h3 className="text-sm font-bold tracking-tight text-white">
              {t.googlePriorityMapTitle}
            </h3>
          </div>
          <span className="text-[11px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded inline-flex items-center gap-1 tabular-nums">
            <Radio className="w-3 h-3 animate-pulse" />
            {filteredNodes.length} {t.nodesCount}
          </span>
          <span className="text-[11px] font-mono text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded inline-flex items-center gap-1 tabular-nums">
            <ShieldAlert className="w-3 h-3" />
            {redPriorityCount} Red Priority
          </span>
        </div>

        {/* Legend & Fit City Button */}
        <div className="flex items-center gap-2.5 text-[11px] text-slate-300 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
            {t.googleMapLegendHigh}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            {t.googleMapLegendMed}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            {t.googleMapLegendLow}
          </span>
          <button
            type="button"
            onClick={() => {
              setActiveMarkerNodeId(null);
              setActiveAnchor(null);
              setResetCounter((c) => c + 1);
            }}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 inline-flex items-center gap-1 border border-slate-700"
          >
            <Compass className="w-3 h-3 text-cyan-300" />
            <span>{t.googleMapRecenter}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-2 border-b border-slate-800/80 bg-[#090F20] flex flex-wrap items-center gap-1.5">
        {(
          [
            { id: 'ALL', label: t.filterAllZones },
            { id: 'HIGH_RED', label: t.filterHighCritical },
            { id: 'CRITICAL', label: t.filterCriticalRed },
            { id: 'DUPLICATES', label: t.filterDuplicateClusters },
          ] as Array<{ id: MapFilterMode; label: string }>
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilterMode(item.id)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              filterMode === item.id
                ? item.id === 'CRITICAL' || item.id === 'HIGH_RED'
                  ? 'bg-rose-500 text-white'
                  : 'bg-cyan-400 text-slate-950'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Map Viewport (explicit height prevents 0x0 collapse) */}
      <div className={`relative w-full ${heightClass} bg-slate-950`}>
        {!apiKey ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-slate-950">
            <div className="max-w-md space-y-2">
              <MapPin className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-sm font-bold text-white">{t.googlePriorityMapTitle}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{t.googleMapMissingKey}</p>
            </div>
          </div>
        ) : (
          <APIProvider apiKey={apiKey} libraries={['marker']} language={lang} region="IN">
            <MapInnerContent
              filteredNodes={filteredNodes}
              selectedNode={activeSelectedNode}
              activeAnchor={activeAnchor}
              onSelectMarker={handleSelectMarker}
              onCloseInfoWindow={handleCloseInfoWindow}
              resetCounter={resetCounter}
            />
          </APIProvider>
        )}
      </div>
    </div>
  );
}
