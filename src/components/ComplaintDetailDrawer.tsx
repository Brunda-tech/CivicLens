import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  GitMerge,
  Image as ImageIcon,
  Languages,
  MapPin,
  ShieldAlert,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { translateCategory, translateSeverity, translateStatus } from '../i18n/translations';
import {
  CATEGORIES,
  FIELD_CREWS,
  SEVERITIES,
  STATUSES,
  type Complaint,
  type ComplaintUpdate,
  type DuplicateLink,
} from '../types/civiclens';
import {
  formatDateTime,
  PriorityBreakdownCard,
  SeverityIndicator,
  StatusLabel,
} from './StatusVisuals';

interface ComplaintDetailDrawerProps {
  complaintId: number | null;
  isOfficer: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function ComplaintDetailDrawer({
  complaintId,
  isOfficer,
  onClose,
  onUpdated,
}: ComplaintDetailDrawerProps) {
  const { t } = useLanguage();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [updates, setUpdates] = useState<ComplaintUpdate[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateLink[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState('');
  const [assignedCrew, setAssignedCrew] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDetail = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getComplaintDetail(id);
      setComplaint(data.complaint);
      setUpdates(data.updates);
      setDuplicates(data.duplicates);
      setStatus(data.complaint.status);
      setSeverity(data.complaint.severity);
      setCategory(data.complaint.category);
      setAssignedCrew(data.complaint.assigned_crew || '');
      setResolutionNote(data.complaint.resolution_note || '');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load complaint details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (complaintId) {
      loadDetail(complaintId);
    } else {
      setComplaint(null);
    }
  }, [complaintId]);

  if (!complaintId) return null;

  const handleSaveUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complaint) return;

    if (status === 'Resolved' && resolutionNote.trim().length < 5) {
      pushToast(
        'Resolution note required',
        'Please describe the resolution action before marking this ticket Resolved.',
        'error'
      );
      return;
    }

    setSaving(true);
    try {
      await api.updateComplaint(complaint.id, {
        status,
        severity,
        category,
        assigned_crew: assignedCrew.trim() || null,
        resolution_note: resolutionNote,
        note: note || undefined,
      });
      pushToast('Ticket updated', `${complaint.ticket_id} updated to ${status}`, 'success');
      await loadDetail(complaint.id);
      onUpdated();
    } catch (err) {
      pushToast('Update failed', err instanceof Error ? err.message : 'Could not save changes.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickMarkCompleted = async () => {
    if (!complaint) return;
    const finalNote =
      resolutionNote.trim().length >= 5
        ? resolutionNote.trim()
        : `${assignedCrew.trim() || complaint.assigned_crew || 'Field crew'} completed repair and verified site safety.`;

    setSaving(true);
    try {
      await api.updateComplaint(complaint.id, {
        status: 'Resolved',
        assigned_crew: assignedCrew.trim() || null,
        resolution_note: finalNote,
      });
      pushToast(`${complaint.ticket_id} · ${t.completedBadge}`, finalNote, 'success');
      await loadDetail(complaint.id);
      onUpdated();
    } catch (err) {
      pushToast('Completion failed', err instanceof Error ? err.message : 'Could not mark completed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateDecision = async (dupId: number, decision: 'confirmed' | 'dismissed') => {
    if (!complaint) return;
    try {
      await api.reviewDuplicate(dupId, decision);
      pushToast(
        decision === 'confirmed' ? 'Duplicate confirmed' : 'Duplicate dismissed',
        'Cluster impact count and priority score updated.',
        'success'
      );
      await loadDetail(complaint.id);
      onUpdated();
    } catch (err) {
      pushToast('Review failed', err instanceof Error ? err.message : 'Unable to update duplicate link.', 'error');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-[2px]">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl border-l border-slate-200 flex flex-col"
        >
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-sm font-bold text-slate-950 tabular-nums">
                  {complaint?.ticket_id || '...'}
                </span>
                {complaint && <SeverityIndicator severity={complaint.severity} />}
                {complaint && <StatusLabel status={complaint.status} />}
                {complaint?.is_suspected_duplicate === 1 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-xs font-semibold text-violet-700">
                    <GitMerge className="w-3 h-3" />
                    {t.drawerSuspectedDupBadge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">
                {complaint
                  ? `${complaint.ward} · ${complaint.city} · ${t.drawerReportedBy}: ${complaint.citizen_name}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close complaint details"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6 flex-1">
            {loading && (
              <div className="space-y-4 animate-pulse">
                <div className="h-6 bg-slate-200 rounded w-2/3" />
                <div className="h-24 bg-slate-100 rounded-xl" />
                <div className="h-32 bg-slate-100 rounded-xl" />
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                {error}
              </div>
            )}

            {!loading && complaint && (
              <>
                {complaint.is_escalated && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-rose-900">{t.drawerSlaEscalationTitle}</p>
                      <p className="text-xs text-rose-700 mt-0.5">
                        <span className="font-mono font-semibold tabular-nums">{complaint.hours_affected ?? 0}h</span>{' '}
                        (SLA: {complaint.sla_hours}h)
                      </p>
                    </div>
                  </div>
                )}

                {(complaint.is_suspected_duplicate === 1 || complaint.community_impact_count > 1) && (
                  <div className="p-3.5 rounded-xl bg-violet-50 border border-violet-200 flex items-start gap-3">
                    <Users className="w-5 h-5 text-violet-700 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-violet-950">
                        {complaint.community_impact_count} {t.clusterReportsSuffix} ·{' '}
                        {complaint.affected_people_count} {t.citizensAffectedReport}
                      </p>
                      <p className="text-xs text-violet-800 mt-0.5">
                        {t.priorityFactorsTitle}: {complaint.priority_score}/100
                      </p>
                    </div>
                  </div>
                )}

                <PriorityBreakdownCard
                  breakdown={complaint.priority_breakdown}
                  score={complaint.priority_score}
                  affectedPeople={complaint.affected_people_count}
                  hoursAffected={complaint.hours_affected}
                />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-200 text-xs">
                  <div>
                    <p className="text-slate-500">{t.assignedDepartment}</p>
                    <p className="font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                      <span>{complaint.department}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">{t.assignedCrewLabel}</p>
                    <p className="font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{complaint.assigned_crew || t.unassignedCrew}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">{t.drawerCriticalZoneFactor}</p>
                    <p className="font-semibold text-slate-900 mt-1">{complaint.critical_area_type}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-slate-500">{t.drawerSubmittedLabel}</p>
                      <p className="font-medium text-slate-900 mt-0.5 tabular-nums">
                        {formatDateTime(complaint.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-slate-500">{t.drawerLocationGridLabel}</p>
                    <p className="font-medium text-slate-900 mt-1 flex items-center gap-1.5 flex-wrap">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>
                        {complaint.street_landmark}, {complaint.ward}, {complaint.city}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        ({complaint.grid_x}, {complaint.grid_z})
                      </span>
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">{t.drawerCitizenSubmission}</h3>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Languages className="w-3.5 h-3.5" />
                      {t.drawerDetectedPrefix} {complaint.detected_language}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <p className="text-sm text-slate-800 leading-relaxed">{complaint.description}</p>
                    {complaint.translated_text &&
                      complaint.translated_text.trim() !== complaint.description.trim() && (
                        <div className="pt-2.5 border-t border-slate-200">
                          <p className="text-xs font-semibold text-slate-500">{t.drawerEnglishTranslation}</p>
                          <p className="text-sm text-slate-700 mt-1">{complaint.translated_text}</p>
                        </div>
                      )}
                    {complaint.citizen_reply_localized && (
                      <div className="pt-2.5 border-t border-slate-200">
                        <p className="text-xs font-semibold text-cyan-700">{t.localizedConfirmation}</p>
                        <p className="text-xs text-slate-700 mt-1">{complaint.citizen_reply_localized}</p>
                      </div>
                    )}
                  </div>
                </div>

                {complaint.image_path && (
                  <div className="space-y-2.5">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-slate-500" />
                      {t.drawerPhotoEvidence}
                    </h3>
                    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                      <img
                        src={complaint.image_path}
                        alt={`Evidence for ${complaint.ticket_id}`}
                        referrerPolicy="no-referrer"
                        className="w-full max-h-72 object-cover"
                      />
                      {complaint.image_analysis && (
                        <div className="p-3.5 bg-white border-t border-slate-200">
                          <p className="text-xs font-semibold text-slate-500">{t.drawerVisionAssessment}</p>
                          <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                            {complaint.image_analysis}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">{t.drawerAiTriagePlan}</h3>
                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                      <p className="text-xs font-semibold text-slate-500">{t.drawerExecSummary}</p>
                      <p className="text-slate-800 mt-1 leading-relaxed">{complaint.ai_summary}</p>
                    </div>
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                      <p className="text-xs font-semibold text-slate-500">{t.drawerSeverityJust}</p>
                      <p className="text-slate-800 mt-1 leading-relaxed">{complaint.severity_reason}</p>
                    </div>
                    <div className="p-3.5 rounded-xl border border-cyan-200 bg-cyan-50/50">
                      <p className="text-xs font-semibold text-cyan-900">{t.drawerSuggestedAction}</p>
                      <p className="text-cyan-950 mt-1 leading-relaxed">{complaint.suggested_action}</p>
                    </div>
                  </div>
                </div>

                {duplicates.length > 0 && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">{t.drawerDupReportsTitle}</h3>
                    <div className="space-y-2">
                      {duplicates.map((dup) => (
                        <div
                          key={dup.id}
                          className="p-3 rounded-xl border border-violet-200 bg-violet-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-mono font-semibold text-slate-900">
                                {dup.linked_ticket_id}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="font-semibold text-violet-700 tabular-nums">
                                {Math.round(dup.similarity_score * 100)}% {t.drawerOverlapLabel}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="capitalize text-slate-600">{dup.status}</span>
                            </div>
                            <p className="text-xs text-slate-700 mt-1 line-clamp-2">{dup.linked_summary}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{dup.similarity_reason}</p>
                          </div>
                          {isOfficer && dup.status === 'suspected' && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDuplicateDecision(dup.id, 'confirmed')}
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg inline-flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {t.drawerConfirmBtn}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateDecision(dup.id, 'dismissed')}
                                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg"
                              >
                                {t.drawerDismissBtn}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {complaint.resolution_note && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-900">{t.officialResolutionNote}</p>
                    <p className="text-sm text-emerald-950 mt-1 leading-relaxed">{complaint.resolution_note}</p>
                    {complaint.resolved_at && (
                      <p className="text-xs text-emerald-700 mt-1.5 tabular-nums">
                        {formatDateTime(complaint.resolved_at)}
                      </p>
                    )}
                  </div>
                )}

                {isOfficer && (
                  <form
                    onSubmit={handleSaveUpdate}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-cyan-600" />
                      <h3 className="text-sm font-semibold text-slate-900">{t.drawerOfficerControlTitle}</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">{t.colStatus}</label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white"
                        >
                          {STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {translateStatus(t, st)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">{t.colSeverity}</label>
                        <select
                          value={severity}
                          onChange={(e) => setSeverity(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white"
                        >
                          {SEVERITIES.map((sv) => (
                            <option key={sv} value={sv}>
                              {translateSeverity(t, sv)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">{t.allCategories}</label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {translateCategory(t, cat)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {t.assignedCrewLabel}
                      </label>
                      <select
                        value={assignedCrew}
                        onChange={(e) => {
                          const nextCrew = e.target.value;
                          setAssignedCrew(nextCrew);
                          if (nextCrew && (status === 'Open' || status === 'Under Review')) {
                            setStatus('Assigned');
                          }
                        }}
                        className="w-full px-2.5 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="">{t.unassignedCrew}</option>
                        {assignedCrew && !FIELD_CREWS.includes(assignedCrew) && (
                          <option value={assignedCrew}>{assignedCrew}</option>
                        )}
                        {FIELD_CREWS.map((crew) => (
                          <option key={crew} value={crew}>
                            {crew}
                          </option>
                        ))}
                      </select>
                    </div>

                    {status === 'Resolved' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          {t.drawerResolutionRequired}
                        </label>
                        <textarea
                          required
                          rows={2}
                          value={resolutionNote}
                          onChange={(e) => setResolutionNote(e.target.value)}
                          placeholder={t.drawerResolutionPlaceholder}
                          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {t.drawerActivityNoteLabel}
                      </label>
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t.drawerActivityPlaceholder}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {complaint.status !== 'Resolved' && complaint.status !== 'Rejected' && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleQuickMarkCompleted}
                          className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.markCompletedBtn}</span>
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors"
                      >
                        {saving ? t.drawerSaving : t.drawerSaveUpdate}
                      </button>
                    </div>
                  </form>
                )}

                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-500" />
                    {t.drawerActivityHistory}
                  </h3>
                  <div className="space-y-3">
                    {updates.map((upd) => (
                      <div key={upd.id} className="flex items-start gap-3 text-xs">
                        <div className="w-2 h-2 rounded-full bg-cyan-600 mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0 pb-3 border-b border-slate-100 last:border-b-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900">
                              {translateStatus(t, upd.new_status)}
                            </span>
                            <span className="text-slate-400 tabular-nums">{formatDateTime(upd.created_at)}</span>
                          </div>
                          <p className="text-slate-600 mt-0.5 leading-relaxed">{upd.note}</p>
                          {upd.updated_by_name && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {t.drawerByPrefix} {upd.updated_by_name}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
