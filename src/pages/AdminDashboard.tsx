import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Building2,
  CheckCircle2,
  Filter,
  GitMerge,
  RotateCcw,
  Search,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { api, subscribeToLiveEvents } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  translateCategory,
  translateSeverity,
  translateStatus,
} from '../i18n/translations';
import {
  CATEGORIES,
  FIELD_CREWS,
  SEVERITIES,
  STATUSES,
  type AnalyticsOverview,
  type Complaint,
  type DepartmentStat,
} from '../types/civiclens';
import {
  formatShortDate,
  SeverityIndicator,
  StatusLabel,
  TableSkeletonRows,
} from '../components/StatusVisuals';

interface AdminDashboardProps {
  onSelectComplaint: (id: number) => void;
  onOpen3DGrid: () => void;
  refreshTrigger: number;
}

export function AdminDashboard({
  onSelectComplaint,
  onOpen3DGrid,
  refreshTrigger,
}: AdminDashboardProps) {
  const { t } = useLanguage();
  const { pushToast } = useToast();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [departments, setDepartments] = useState<DepartmentStat[]>([]);
  const [loading, setLoading] = useState(true);

  const [includeDemo, setIncludeDemo] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubView, setActiveSubView] = useState<'queue' | 'departments'>('queue');
  const [updatingCrewId, setUpdatingCrewId] = useState<number | null>(null);
  const [completingTicket, setCompletingTicket] = useState<Complaint | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [submittingComplete, setSubmittingComplete] = useState(false);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, analyticsRes, deptRes] = await Promise.all([
        api.getComplaints({
          includeDemo,
          category: categoryFilter,
          severity: severityFilter,
          department: departmentFilter,
          status: statusFilter,
          duplicatesOnly,
          search: searchQuery || undefined,
        }),
        api.getAnalyticsOverview(includeDemo),
        api.getDepartments(),
      ]);
      setComplaints(compRes.complaints);
      setOverview(analyticsRes);
      setDepartments(deptRes.departments);
    } catch (err) {
      pushToast('Load failed', err instanceof Error ? err.message : 'Unable to fetch officer queue.', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    includeDemo,
    categoryFilter,
    severityFilter,
    departmentFilter,
    statusFilter,
    duplicatesOnly,
    searchQuery,
    pushToast,
  ]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData, refreshTrigger]);

  useEffect(() => {
    return subscribeToLiveEvents(() => {
      loadAdminData();
    });
  }, [loadAdminData]);

  const handleQuickAssignCrew = async (complaint: Complaint, crewName: string) => {
    setUpdatingCrewId(complaint.id);
    try {
      await api.updateComplaint(complaint.id, {
        assigned_crew: crewName || null,
      });
      pushToast(
        complaint.ticket_id,
        crewName ? `${t.assignedCrewLabel}: ${crewName}` : t.unassignedCrew,
        'success'
      );
      await loadAdminData();
    } catch (err) {
      pushToast('Crew assignment failed', err instanceof Error ? err.message : 'Unable to assign crew.', 'error');
    } finally {
      setUpdatingCrewId(null);
    }
  };

  const handleConfirmComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTicket) return;
    const trimmedNote = completionNote.trim();
    if (trimmedNote.length < 5) {
      pushToast('Note required', 'Please enter at least 5 characters describing the completed work.', 'error');
      return;
    }

    setSubmittingComplete(true);
    try {
      await api.updateComplaint(completingTicket.id, {
        status: 'Resolved',
        resolution_note: trimmedNote,
      });
      pushToast(
        `${completingTicket.ticket_id} · ${t.completedBadge}`,
        trimmedNote,
        'success'
      );
      setCompletingTicket(null);
      setCompletionNote('');
      await loadAdminData();
    } catch (err) {
      pushToast('Completion failed', err instanceof Error ? err.message : 'Unable to mark completed.', 'error');
    } finally {
      setSubmittingComplete(false);
    }
  };

  const handleRestoreDemo = async () => {
    try {
      const res = await api.resetDemoData();
      pushToast(t.restoreSamples, res.message, 'success');
      loadAdminData();
    } catch (err) {
      pushToast('Reset failed', err instanceof Error ? err.message : 'Unable to reset sample data.', 'error');
    }
  };

  const resetFilters = () => {
    setCategoryFilter('ALL');
    setSeverityFilter('ALL');
    setDepartmentFilter('ALL');
    setStatusFilter('ALL');
    setDuplicatesOnly(false);
    setSearchQuery('');
  };

  const stats = overview?.stats;
  const escalated = overview?.escalatedTickets ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 font-display">
            {t.officerConsoleTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {t.officerConsoleSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpen3DGrid}
            className="px-3 py-1.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Box className="w-3.5 h-3.5" />
            <span>{t.open3DGridBtn}</span>
          </button>
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDemo}
              onChange={(e) => setIncludeDemo(e.target.checked)}
              className="rounded border-slate-300 text-cyan-600"
            />
            <span>{t.includeSampleData}</span>
          </label>
          <button
            type="button"
            onClick={handleRestoreDemo}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.restoreSamples}</span>
          </button>
        </div>
      </div>

      {/* 6 Officer KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">{t.kpiPendingTickets}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-slate-950 tabular-nums font-display">
            {stats ? stats.total : '—'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-rose-700">{t.kpiOpenCritical}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-rose-600 tabular-nums font-display">
            {stats ? stats.criticalOpen : '—'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-violet-700">{t.kpiSuspectedDuplicates}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-violet-600 tabular-nums font-display">
            {stats ? stats.suspectedDuplicates : '—'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-cyan-700">{t.kpiPeopleAffected}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-cyan-700 tabular-nums font-display">
            {stats ? stats.totalPeopleAffected.toLocaleString() : '—'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">{t.kpiInProgress}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-amber-700 tabular-nums font-display">
            {stats ? stats.inProgress : '—'}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">{t.kpiResolved}</p>
          <p className="mt-1.5 text-2xl font-extrabold text-emerald-700 tabular-nums font-display">
            {stats ? stats.resolved : '—'}
          </p>
        </div>
      </div>

      {escalated.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <h2 className="text-sm font-bold">
                {t.slaAlertTitle} ({escalated.length})
              </h2>
            </div>
            <span className="text-xs text-rose-700">{t.slaAlertHint}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {escalated.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectComplaint(item.id)}
                className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 hover:border-rose-400 text-xs text-left transition-colors"
              >
                <span className="font-mono font-semibold text-rose-900 tabular-nums">{item.ticket_id}</span>
                <span className="text-slate-400 mx-1.5">·</span>
                <span className="font-semibold text-slate-800 tabular-nums">
                  {t.priorityLabel} {item.priority_score}
                </span>
                <span className="text-slate-400 mx-1.5">·</span>
                <span className="text-rose-700 font-semibold tabular-nums">
                  {item.hours_affected ?? 0}{t.hoursOpenSuffix}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveSubView('queue')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeSubView === 'queue'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            {t.tabPrioritizedQueue} ({complaints.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubView('departments')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeSubView === 'departments'
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            {t.tabDepartments} ({departments.length})
          </button>
        </div>
      </div>

      {activeSubView === 'departments' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {departments.map((dept) => {
            const resRate =
              dept.total_tickets > 0 ? Math.round((dept.resolved_tickets / dept.total_tickets) * 100) : 0;
            return (
              <div
                key={dept.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <Building2 className="w-5 h-5 text-cyan-600 shrink-0" />
                    <span className="text-xs font-mono text-slate-500 tabular-nums">SLA {dept.sla_hours}h</span>
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-slate-950">{dept.name}</h3>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{dept.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">{t.colTotalTickets}</p>
                      <p className="font-bold text-slate-900 tabular-nums">{dept.total_tickets}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">{t.openLabel}</p>
                      <p className="font-bold text-amber-700 tabular-nums">{dept.open_tickets}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">{t.deptRate}</p>
                      <p className="font-bold text-emerald-700 tabular-nums">{resRate}%</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDepartmentFilter(dept.name);
                      setActiveSubView('queue');
                    }}
                    className="w-full py-2 text-xs font-semibold text-cyan-800 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors"
                  >
                    {t.filterDeptQueueBtn}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Filter className="w-3.5 h-3.5 text-cyan-600" />
                <span>{t.filterQueueTitle}</span>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-medium text-cyan-700 hover:text-cyan-900"
              >
                {t.resetFilters}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
              <div className="relative lg:col-span-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchQueuePlaceholder}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                />
              </div>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="ALL">{t.allSeverities}</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {translateSeverity(t, s)}
                  </option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="ALL">{t.allCategories}</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {translateCategory(t, c)}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="ALL">{t.allStatuses}</option>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {translateStatus(t, st)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setDuplicatesOnly((prev) => !prev)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                  duplicatesOnly
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-violet-50 hover:text-violet-800'
                }`}
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>{t.suspectedDuplicatesBtn}</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600">
                    <th className="px-4 py-3 whitespace-nowrap">{t.colPriority}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t.colTicketId}</th>
                    <th className="px-4 py-3">{t.colSummaryFactors}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t.colSeverity}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t.colLocation}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t.colDepartment}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t.colCrew}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t.colStatus}</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">{t.colAction}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <TableSkeletonRows rows={6} cols={9} />
                  ) : complaints.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                        {t.noComplaintsMatch}
                      </td>
                    </tr>
                  ) : (
                    complaints.map((c, idx) => (
                      <tr
                        key={c.id}
                        onClick={() => onSelectComplaint(c.id)}
                        className="hover:bg-cyan-50/35 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap align-top">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-[11px] font-bold text-cyan-700 tabular-nums">
                              #{idx + 1}
                            </span>
                            <span className="font-mono text-sm font-extrabold text-slate-950 tabular-nums">
                              {c.priority_score}
                            </span>
                            <span className="text-[10px] font-normal text-slate-400">/100</span>
                          </div>
                          <div className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                            {c.hours_affected ?? 0}h · {c.affected_people_count} {t.pplShort}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap align-top">
                          <div className="font-mono font-semibold text-slate-900 tabular-nums">
                            {c.ticket_id}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            {formatShortDate(c.created_at)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                              {translateCategory(t, c.category)}
                            </span>
                            {c.image_path && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700">
                                {t.photoAttachedTag}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 max-w-sm align-top">
                          <p className="font-semibold text-slate-900 line-clamp-2 leading-snug">
                            {c.ai_summary}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                            <span className="text-slate-500 font-medium">{c.detected_language}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-cyan-800 font-medium">{c.critical_area_type}</span>
                            {(c.is_suspected_duplicate === 1 || c.community_impact_count > 1) && (
                              <span className="text-violet-700 font-semibold inline-flex items-center gap-1">
                                <GitMerge className="w-3 h-3" />
                                {c.community_impact_count} {t.clusterReportsSuffix}
                              </span>
                            )}
                            {c.community_impact_count <= 1 && c.affected_people_count >= 50 && (
                              <span className="text-slate-600 inline-flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {c.affected_people_count} {t.affectedSuffix}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top max-w-[230px]">
                          <SeverityIndicator severity={c.severity} />
                          <p className="mt-1.5 text-[11px] text-slate-700 leading-snug line-clamp-2">
                            {c.severity_reason}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top max-w-[160px]">
                          <p className="font-medium text-slate-800 truncate">{c.ward}</p>
                          <p className="text-[11px] text-slate-500 truncate">{c.street_landmark}</p>
                        </td>
                        <td className="px-4 py-3.5 align-top max-w-[180px]">
                          <div className="inline-flex items-start gap-1.5 text-slate-800 font-medium">
                            <Building2 className="w-3.5 h-3.5 text-cyan-600 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{c.department}</span>
                          </div>
                        </td>
                        <td
                          className="px-4 py-3.5 align-top min-w-[175px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <select
                              aria-label={`Assign crew for ${c.ticket_id}`}
                              disabled={updatingCrewId === c.id || c.status === 'Resolved' || c.status === 'Rejected'}
                              value={c.assigned_crew || ''}
                              onChange={(e) => handleQuickAssignCrew(c, e.target.value)}
                              className="w-full max-w-[165px] px-2 py-1 text-[11px] font-medium border border-slate-200 rounded-md bg-white text-slate-800 disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                            >
                              <option value="">{t.assignCrewPlaceholder}</option>
                              {c.assigned_crew && !FIELD_CREWS.includes(c.assigned_crew) && (
                                <option value={c.assigned_crew}>{c.assigned_crew}</option>
                              )}
                              {FIELD_CREWS.map((crew) => (
                                <option key={crew} value={crew}>
                                  {crew}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap align-top">
                          <StatusLabel status={c.status} />
                        </td>
                        <td
                          className="px-4 py-3.5 whitespace-nowrap align-top text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            {c.status !== 'Resolved' && c.status !== 'Rejected' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCompletingTicket(c);
                                  setCompletionNote(
                                    c.resolution_note ||
                                      `${c.assigned_crew ? `${c.assigned_crew} completed field repair` : 'Field crew completed repair'} and verified site safety.`
                                  );
                                }}
                                className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md inline-flex items-center gap-1 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{t.markCompletedBtn}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectComplaint(c.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-cyan-800 hover:bg-cyan-100/70 rounded-md transition-colors"
                            >
                              {t.inspectBtn}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Quick Mark Completed Modal */}
      {completingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]">
          <form
            onSubmit={handleConfirmComplete}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono font-bold text-emerald-700">{completingTicket.ticket_id}</p>
                <h2 className="text-lg font-extrabold text-slate-950 font-display">
                  {t.completeTicketTitle}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {completingTicket.ward} · {completingTicket.assigned_crew || completingTicket.department}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompletingTicket(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t.completeNoteLabel}
              </label>
              <textarea
                required
                rows={3}
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder={t.drawerResolutionPlaceholder}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCompletingTicket(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingComplete}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{submittingComplete ? t.drawerSaving : t.confirmCompleteBtn}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

