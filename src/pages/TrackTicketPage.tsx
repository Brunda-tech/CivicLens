import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, Clock, GitMerge, MapPin, Radio, Search, Users, Wrench } from 'lucide-react';
import { api, subscribeToLiveEvents } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { translateStatus } from '../i18n/translations';
import type { Complaint, ComplaintUpdate } from '../types/civiclens';
import {
  formatDateTime,
  PriorityBreakdownCard,
  SeverityIndicator,
  StatusLabel,
} from '../components/StatusVisuals';

const PIPELINE_STEPS = ['Open', 'Under Review', 'Assigned', 'In Progress', 'Resolved'] as const;

interface TrackTicketPageProps {
  initialTicketId?: string;
}

export function TrackTicketPage({ initialTicketId = '' }: TrackTicketPageProps) {
  const { t } = useLanguage();
  const { pushToast } = useToast();
  const [queryId, setQueryId] = useState(initialTicketId);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<Complaint | null>(null);
  const [timeline, setTimeline] = useState<ComplaintUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const performLookup = useCallback(async (idToLookup: string, silent = false) => {
    const trimmed = idToLookup.trim();
    if (!trimmed) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api.trackTicket(trimmed);
      setTicket(res.ticket);
      setTimeline(res.timeline);
    } catch (err) {
      if (!silent) {
        setTicket(null);
        setTimeline([]);
        setError(err instanceof Error ? err.message : 'Ticket not found.');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialTicketId) {
      setQueryId(initialTicketId);
      performLookup(initialTicketId);
    }
  }, [initialTicketId, performLookup]);

  useEffect(() => {
    if (!ticket?.ticket_id) return;
    const trackedUpper = ticket.ticket_id.toUpperCase();
    return subscribeToLiveEvents((event) => {
      if (event.ticket_id?.toUpperCase() === trackedUpper || event.type === 'demo_reset') {
        performLookup(trackedUpper, true);
        if (event.ticket_id?.toUpperCase() === trackedUpper && event.note) {
          pushToast(`${t.liveIndicator}: ${trackedUpper}`, event.note, 'info');
        }
      }
    });
  }, [ticket?.ticket_id, performLookup, pushToast, t.liveIndicator]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLookup(queryId);
  };

  const activeStepIndex = ticket
    ? ticket.status === 'Rejected'
      ? -1
      : PIPELINE_STEPS.indexOf(ticket.status as (typeof PIPELINE_STEPS)[number])
    : -1;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 font-display">
          {t.trackTitle}
        </h1>
        <p className="text-sm text-slate-600 mt-1">{t.trackSubtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryId}
              onChange={(e) => setQueryId(e.target.value)}
              placeholder={t.trackPlaceholder}
              className="w-full pl-10 pr-4 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !queryId.trim()}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-950 hover:bg-slate-800 disabled:opacity-60 rounded-lg whitespace-nowrap shrink-0"
          >
            {loading ? t.searching : t.trackButton}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{t.sampleTicketsLabel}</span>
          {['CL-2026-1001', 'CL-2026-1002', 'CL-2026-1004', 'CL-2026-1009'].map((sampleId) => (
            <button
              key={sampleId}
              type="button"
              onClick={() => {
                setQueryId(sampleId);
                performLookup(sampleId);
              }}
              className="font-mono px-2.5 py-1 rounded-md bg-slate-100 hover:bg-cyan-50 text-slate-700 hover:text-cyan-800 transition-colors"
            >
              {sampleId}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          {error}
        </div>
      )}

      {ticket && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-lg font-bold text-slate-950 tabular-nums">
                  {ticket.ticket_id}
                </span>
                <SeverityIndicator severity={ticket.severity} />
                <StatusLabel status={ticket.status} />
                {ticket.is_suspected_duplicate === 1 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 border border-violet-200 text-xs font-semibold text-violet-700">
                    <GitMerge className="w-3 h-3" />
                    {t.drawerSuspectedDupBadge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {ticket.street_landmark}, {ticket.ward}, {ticket.city}
                </span>
              </p>
            </div>
            <div className="text-left sm:text-right text-xs space-y-2">
              <div>
                <p className="text-slate-500">{t.assignedDepartment}</p>
                <p className="font-semibold text-slate-900 mt-0.5 flex sm:justify-end items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-cyan-600" />
                  <span>{ticket.department}</span>
                </p>
              </div>
              <div>
                <p className="text-slate-500">{t.assignedCrewLabel}</p>
                <p className="font-semibold text-slate-900 mt-0.5 flex sm:justify-end items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{ticket.assigned_crew || t.unassignedCrew}</span>
                </p>
              </div>
              <div className="inline-flex sm:justify-end items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>{t.liveIndicator}</span>
              </div>
            </div>
          </div>

          {ticket.status !== 'Rejected' ? (
            <div className="py-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {PIPELINE_STEPS.map((step, idx) => {
                  const completed = idx <= activeStepIndex;
                  const current = idx === activeStepIndex;
                  return (
                    <div
                      key={step}
                      className={`p-3 rounded-xl border ${
                        current
                          ? 'border-cyan-600 bg-cyan-50/70'
                          : completed
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-slate-500">0{idx + 1}</span>
                        {completed && (
                          <CheckCircle2
                            className={`w-4 h-4 ${current ? 'text-cyan-600' : 'text-emerald-600'}`}
                          />
                        )}
                      </div>
                      <p
                        className={`mt-1.5 text-xs font-semibold ${
                          completed ? 'text-slate-950' : 'text-slate-400'
                        }`}
                      >
                        {translateStatus(t, step)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {t.rejectedNotice}
            </div>
          )}

          <PriorityBreakdownCard
            breakdown={ticket.priority_breakdown}
            score={ticket.priority_score}
            affectedPeople={ticket.affected_people_count}
            hoursAffected={ticket.hours_affected}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500">
                {t.issueSummaryLabel} ({ticket.detected_language})
              </p>
              <p className="text-sm text-slate-900 mt-1 leading-relaxed">{ticket.ai_summary}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500">{t.submittedImpactLabel}</p>
              <p className="text-sm text-slate-900 mt-1 tabular-nums">{formatDateTime(ticket.created_at)}</p>
              <p className="text-xs text-cyan-800 font-medium mt-1.5 flex items-center gap-1 tabular-nums">
                <Users className="w-3.5 h-3.5" />
                {ticket.affected_people_count} {t.citizensAffectedReport} · {ticket.community_impact_count}
              </p>
            </div>
          </div>

          {ticket.resolution_note && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-900">{t.officialResolutionNote}</p>
              <p className="text-sm text-emerald-950 mt-1 leading-relaxed">{ticket.resolution_note}</p>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>{t.detailedTimelineTitle}</span>
            </h2>
            <div className="space-y-3">
              {timeline.map((item) => (
                <div key={item.id} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-cyan-600 mt-1.5 shrink-0" />
                  <div className="flex-1 pb-3 border-b border-slate-100 last:border-b-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">
                        {translateStatus(t, item.new_status)}
                      </span>
                      <span className="text-slate-400 tabular-nums">{formatDateTime(item.created_at)}</span>
                    </div>
                    <p className="text-slate-600 mt-0.5 leading-relaxed">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
