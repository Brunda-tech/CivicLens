import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe2,
  Info,
  ShieldAlert,
  Wrench,
  XCircle,
} from 'lucide-react';
import { translateStatus, UI_LANGUAGES, type UiLangCode } from '../i18n/translations';
import { useLanguage } from '../context/LanguageContext';
import type { ComplaintSeverity, ComplaintStatus, PriorityBreakdown } from '../types/civiclens';

export function SeverityIndicator({ severity }: { severity: ComplaintSeverity }) {
  const { t } = useLanguage();

  const config: Record<
    ComplaintSeverity,
    { label: string; textClass: string; bgClass: string; Icon: typeof AlertOctagon }
  > = {
    CRITICAL: {
      label: t.severityCritical,
      textClass: 'text-rose-700',
      bgClass: 'bg-rose-50 border-rose-200',
      Icon: AlertOctagon,
    },
    HIGH: {
      label: t.severityHigh,
      textClass: 'text-orange-700',
      bgClass: 'bg-orange-50 border-orange-200',
      Icon: AlertTriangle,
    },
    MEDIUM: {
      label: t.severityMedium,
      textClass: 'text-amber-700',
      bgClass: 'bg-amber-50 border-amber-200',
      Icon: Info,
    },
    LOW: {
      label: t.severityLow,
      textClass: 'text-emerald-700',
      bgClass: 'bg-emerald-50 border-emerald-200',
      Icon: CheckCircle2,
    },
  };

  const { label, textClass, bgClass, Icon } = config[severity] ?? config.MEDIUM;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap shrink-0 ${bgClass} ${textClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function StatusLabel({ status }: { status: ComplaintStatus }) {
  const { t } = useLanguage();
  const config: Record<ComplaintStatus, { textClass: string; Icon: typeof Clock }> = {
    Open: { textClass: 'text-slate-700', Icon: Clock },
    'Under Review': { textClass: 'text-blue-700', Icon: Info },
    Assigned: { textClass: 'text-indigo-700', Icon: ShieldAlert },
    'In Progress': { textClass: 'text-amber-700', Icon: Wrench },
    Resolved: { textClass: 'text-emerald-700', Icon: CheckCircle2 },
    Rejected: { textClass: 'text-rose-700', Icon: XCircle },
  };

  const { textClass, Icon } = config[status] ?? config.Open;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${textClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{translateStatus(t, status)}</span>
    </span>
  );
}

export function PriorityBreakdownCard({
  breakdown,
  score,
  affectedPeople,
  hoursAffected,
  compact = false,
}: {
  breakdown?: PriorityBreakdown;
  score: number;
  affectedPeople?: number;
  hoursAffected?: number;
  compact?: boolean;
}) {
  const { t } = useLanguage();

  const factors = breakdown
    ? [
        {
          label: t.factorSeverity,
          value: breakdown.severityScore,
          max: 35,
          barColor: 'bg-rose-500',
          detail: t.aiHazardTier,
        },
        {
          label: t.factorCriticalArea,
          value: breakdown.criticalAreaScore,
          max: 25,
          barColor: 'bg-cyan-500',
          detail: breakdown.criticalAreaLabel,
        },
        {
          label: t.factorPeopleAffected,
          value: breakdown.peopleAffectedScore,
          max: 20,
          barColor: 'bg-violet-500',
          detail: affectedPeople ? `${affectedPeople} ${t.peopleUnit}` : t.populationImpact,
        },
        {
          label: t.factorHoursAffected,
          value: breakdown.hoursAffectedScore,
          max: 20,
          barColor: 'bg-amber-500',
          detail: hoursAffected !== undefined ? `${hoursAffected}${t.hoursElapsedSuffix}` : t.exposureWindow,
        },
      ]
    : [];

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/80 ${compact ? 'p-3.5' : 'p-4'} space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-900">{t.priorityFactorsTitle}</span>
        <span className="font-mono text-sm font-extrabold text-slate-950 tabular-nums">
          {score} / 100
        </span>
      </div>

      {factors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {factors.map((f) => {
            const pct = Math.min(100, Math.round((f.value / f.max) * 100));
            return (
              <div key={f.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">{f.label}</span>
                  <span className="font-mono text-slate-600 tabular-nums">
                    {f.value}/{f.max}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full rounded-full ${f.barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-slate-500 truncate">{f.detail}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LanguageSelector({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLanguage();

  return (
    <label className="inline-flex items-center gap-1.5 shrink-0">
      <Globe2 className={`w-3.5 h-3.5 shrink-0 ${dark ? 'text-cyan-400' : 'text-slate-500'}`} />
      <select
        aria-label="Select interface language"
        value={lang}
        onChange={(e) => setLang(e.target.value as UiLangCode)}
        className={`text-xs font-semibold rounded-lg px-2 py-1.5 border focus:outline-none cursor-pointer ${
          dark
            ? 'bg-slate-900 text-slate-100 border-white/15 hover:border-cyan-400/50'
            : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
        }`}
      >
        {UI_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TableSkeletonRows({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx} className="border-b border-slate-100 animate-pulse">
          {Array.from({ length: cols }).map((__, cIdx) => (
            <td key={cIdx} className="px-4 py-3.5">
              <div className="h-4 bg-slate-200/70 rounded w-full max-w-[140px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
