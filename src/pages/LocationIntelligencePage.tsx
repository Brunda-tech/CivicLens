import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertOctagon, GitMerge, MapPin, RefreshCw, Users } from 'lucide-react';
import { api, subscribeToLiveEvents } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { SmartGrid3DMap } from '../components/SmartGrid3DMap';
import { RealTimeGooglePriorityMap } from '../components/RealTimeGooglePriorityMap';
import { SeverityIndicator, StatusLabel } from '../components/StatusVisuals';
import type { Complaint, WardSector } from '../types/civiclens';

interface LocationIntelligencePageProps {
  isOfficer?: boolean;
  onInspectComplaint?: (id: number) => void;
  refreshTrigger?: number;
}

export function LocationIntelligencePage({
  isOfficer = false,
  onInspectComplaint,
  refreshTrigger = 0,
}: LocationIntelligencePageProps) {
  const { t } = useLanguage();
  const { pushToast } = useToast();

  const [nodes, setNodes] = useState<Complaint[]>([]);
  const [sectors, setSectors] = useState<WardSector[]>([]);
  const [includeDemo, setIncludeDemo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [mapViewMode, setMapViewMode] = useState<'both' | '3d' | 'google'>('both');

  const loadGrid = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getLiveGrid(includeDemo);
      setNodes(res.nodes);
      setSectors(res.sectors);
    } catch (err) {
      pushToast('Grid load error', err instanceof Error ? err.message : 'Unable to load 3D grid.', 'error');
    } finally {
      setLoading(false);
    }
  }, [includeDemo, pushToast]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid, refreshTrigger]);

  useEffect(() => {
    return subscribeToLiveEvents(() => {
      loadGrid();
    });
  }, [loadGrid]);

  const wardSummaries = useMemo(() => {
    return sectors.map((sec) => {
      const wardNodes = nodes.filter((n) => n.ward === sec.ward);
      const openNodes = wardNodes.filter((n) => n.status !== 'Resolved' && n.status !== 'Rejected');
      const criticalOpen = openNodes.filter((n) => n.severity === 'CRITICAL').length;
      const duplicates = openNodes.filter((n) => n.is_suspected_duplicate === 1 || n.community_impact_count > 1).length;
      const topPriority = wardNodes.reduce((max, n) => Math.max(max, n.priority_score), 0);
      const peopleAffected = wardNodes.reduce((sum, n) => sum + (n.affected_people_count || 0), 0);

      return {
        sector: sec,
        total: wardNodes.length,
        openCount: openNodes.length,
        criticalOpen,
        duplicates,
        topPriority,
        peopleAffected,
        topNodes: wardNodes.slice(0, 3),
      };
    });
  }, [nodes, sectors]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 font-display">
            {t.gridTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">{t.gridSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5 gap-0.5">
            {(
              [
                { id: 'both', label: t.dualViewBoth },
                { id: '3d', label: t.view3DOnly },
                { id: 'google', label: t.viewGoogleMapOnly },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMapViewMode(opt.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mapViewMode === opt.id
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDemo}
              onChange={(e) => setIncludeDemo(e.target.checked)}
              className="rounded border-slate-300 text-cyan-600"
            />
            <span>{t.includeSampleGrid}</span>
          </label>
          <button
            type="button"
            onClick={loadGrid}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t.refresh}</span>
          </button>
        </div>
      </div>

      <div
        className={`grid gap-5 ${
          mapViewMode === 'both' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {(mapViewMode === 'both' || mapViewMode === '3d') && (
          <SmartGrid3DMap
            nodes={nodes}
            sectors={sectors}
            selectedNodeId={selectedNodeId}
            onSelectNode={(node) => setSelectedNodeId(node.id)}
            heightClass="h-[540px]"
          />
        )}
        {(mapViewMode === 'both' || mapViewMode === 'google') && (
          <RealTimeGooglePriorityMap
            nodes={nodes}
            sectors={sectors}
            selectedNodeId={selectedNodeId}
            onSelectNode={(node) => setSelectedNodeId(node.id)}
            heightClass="h-[540px]"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {wardSummaries.map((w) => (
          <div key={w.sector.ward} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-cyan-600 shrink-0" />
                  <h2 className="text-base font-bold text-slate-950">{w.sector.ward}</h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {w.sector.zoneLabel} · ({w.sector.gridX}, {w.sector.gridZ})
                </p>
              </div>

              {w.criticalOpen > 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  <AlertOctagon className="w-3.5 h-3.5" />
                  {w.criticalOpen} {t.criticalOpenBadge}
                </span>
              ) : w.openCount > 0 ? (
                <span className="text-xs font-semibold text-orange-700">{t.activePriorityBadge}</span>
              ) : (
                <span className="text-xs font-medium text-emerald-700">{t.clearBadge}</span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-3 py-3 border-y border-slate-100 text-xs">
              <div>
                <p className="text-slate-500">{t.topScoreLabel}</p>
                <p className="font-mono font-bold text-slate-950 text-sm tabular-nums">{w.topPriority}/100</p>
              </div>
              <div>
                <p className="text-slate-500">{t.openLabel}</p>
                <p className="font-bold text-blue-700 text-sm tabular-nums">{w.openCount}</p>
              </div>
              <div>
                <p className="text-slate-500">{t.duplicatesLabel}</p>
                <p className="font-bold text-violet-700 text-sm tabular-nums">{w.duplicates}</p>
              </div>
              <div>
                <p className="text-slate-500">{t.peopleLabel}</p>
                <p className="font-bold text-slate-950 text-sm tabular-nums">{w.peopleAffected}</p>
              </div>
            </div>

            {w.topNodes.length > 0 && (
              <div className="space-y-2">
                {w.topNodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => {
                      setSelectedNodeId(node.id);
                      if (isOfficer && onInspectComplaint) {
                        onInspectComplaint(node.id);
                      }
                    }}
                    className={`flex items-center justify-between gap-2 text-xs p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      selectedNodeId === node.id
                        ? 'bg-cyan-50 border-cyan-300'
                        : 'bg-slate-50 border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{node.street_landmark}</p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="font-mono tabular-nums">{node.ticket_id}</span>
                        <span>·</span>
                        <span className="font-mono font-semibold text-slate-700 tabular-nums">
                          {node.priority_score}/100
                        </span>
                        {(node.is_suspected_duplicate === 1 || node.community_impact_count > 1) && (
                          <>
                            <span>·</span>
                            <span className="text-violet-700 font-semibold inline-flex items-center gap-0.5">
                              <GitMerge className="w-3 h-3" />
                              {node.community_impact_count}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span className="inline-flex items-center gap-0.5 tabular-nums">
                          <Users className="w-3 h-3" />
                          {node.affected_people_count}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <SeverityIndicator severity={node.severity} />
                      <StatusLabel status={node.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
