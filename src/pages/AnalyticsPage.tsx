import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { translateCategory, translateSeverity } from '../i18n/translations';
import type { AnalyticsOverview } from '../types/civiclens';

const CATEGORY_COLORS = [
  '#06B6D4',
  '#8B5CF6',
  '#2563EB',
  '#F97316',
  '#10B981',
  '#F59E0B',
  '#F43F5E',
  '#64748B',
];

export function AnalyticsPage() {
  const { t } = useLanguage();
  const { pushToast } = useToast();
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [includeDemo, setIncludeDemo] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getAnalyticsOverview(includeDemo)
      .then(setData)
      .catch((err) => {
        pushToast('Analytics error', err instanceof Error ? err.message : 'Could not load analytics.', 'error');
      })
      .finally(() => setLoading(false));
  }, [includeDemo, pushToast]);

  const stats = data?.stats;
  const localizedCategories = (data?.byCategory ?? []).map((item) => ({
    ...item,
    name: translateCategory(t, item.name),
  }));
  const localizedSeverities = (data?.bySeverity ?? []).map((item) => ({
    ...item,
    name: translateSeverity(t, item.name),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 font-display">
            {t.analyticsTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {t.analyticsSubtitle}
          </p>
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer self-start sm:self-auto">
          <input
            type="checkbox"
            checked={includeDemo}
            onChange={(e) => setIncludeDemo(e.target.checked)}
            className="rounded border-slate-300 text-cyan-600"
          />
          <span>{t.includeSampleData}</span>
        </label>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">{t.resolutionRateLabel}</p>
          <p className="mt-1.5 text-3xl font-extrabold text-emerald-700 tabular-nums font-display">
            {stats ? `${stats.resolutionRate}%` : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {stats ? `${stats.resolved} / ${stats.total} ${t.ticketsClosedSub}` : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">{t.kpiSuspectedDuplicates}</p>
          <p className="mt-1.5 text-3xl font-extrabold text-violet-700 tabular-nums font-display">
            {stats ? stats.suspectedDuplicates : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">{t.kpiDuplicateClusters}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">{t.kpiOpenCritical}</p>
          <p className="mt-1.5 text-3xl font-extrabold text-rose-600 tabular-nums font-display">
            {stats ? stats.criticalOpen : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {stats ? `${stats.totalPeopleAffected.toLocaleString()} ${t.citizensAffectedReport}` : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">{t.slaEscalationsLabel}</p>
          <p className="mt-1.5 text-3xl font-extrabold text-orange-600 tabular-nums font-display">
            {stats ? stats.escalatedCount : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {t.avgClosurePrefix} {stats ? `${stats.avgResolutionHours}h` : '—'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl h-80 animate-pulse p-6" />
          ))}
        </div>
      ) : !data || data.stats.total === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-sm font-semibold text-slate-900">{t.noAnalyticsData}</p>
          <p className="text-xs text-slate-500 mt-1">
            {t.noAnalyticsSub}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900">{t.chartByCategoryTitle}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.chartByCategorySub}</p>
            <div className="h-72 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={localizedCategories}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {localizedCategories.map((entry, idx) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900">{t.chartBySeverityTitle}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.chartBySeveritySub}</p>
            <div className="h-72 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={localizedSeverities}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="open" name={t.statusOpen} stackId="a" fill="#06B6D4" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="resolved" name={t.statusResolved} stackId="a" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900">{t.chartOverTimeTitle}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.chartOverTimeSub}</p>
            <div className="h-72 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.overTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="submitted" name={t.colTotalTickets} stroke="#06B6D4" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="resolved" name={t.statusResolved} stroke="#10B981" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-bold text-slate-900">{t.chartByWardTitle}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t.chartByWardSub}</p>
            <div className="h-72 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byWard} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="ward" type="category" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="total" name={t.colTotalTickets} fill="#0F172A" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="open_count" name={t.openLabel} fill="#F97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">{t.deptTableTitle}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.deptTableSub}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="px-5 py-3">{t.colDepartment}</th>
                    <th className="px-5 py-3 text-right">{t.colTotalTickets}</th>
                    <th className="px-5 py-3 text-right">{t.colOpenQueue}</th>
                    <th className="px-5 py-3 text-right">{t.colResolved}</th>
                    <th className="px-5 py-3 text-right">{t.colResolutionRate}</th>
                    <th className="px-5 py-3 text-right">{t.colAvgResolution}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byDepartment.map((dept) => {
                    const rate = dept.total > 0 ? Math.round((dept.resolved / dept.total) * 100) : 0;
                    return (
                      <tr key={dept.name} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-semibold text-slate-900">{dept.name}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{dept.total}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-amber-700 font-semibold">
                          {dept.open}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-emerald-700 font-semibold">
                          {dept.resolved}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums font-semibold">{rate}%</td>
                        <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                          {dept.avg_hours !== null ? `${dept.avg_hours}h` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

