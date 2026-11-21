import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Clock,
  Download,
  GitMerge,
  Globe2,
  Mic,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import { motion } from 'motion/react';
import { api, subscribeToLiveEvents } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { formatDateTime, LanguageSelector } from '../components/StatusVisuals';
import { SmartGrid3DMap } from '../components/SmartGrid3DMap';
import { RealTimeGooglePriorityMap } from '../components/RealTimeGooglePriorityMap';
import { translateStatus } from '../i18n/translations';
import type { Complaint, OfficerUser, PublicLiveUpdate, PublicStats, WardSector } from '../types/civiclens';

interface LandingPageProps {
  officer: OfficerUser | null;
  onReportIssue: () => void;
  onOpenGrid: () => void;
  onOpenTrack: (ticketId?: string) => void;
  onOpenOfficerConsole: () => void;
}

function AnimatedStat({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    let frame = 0;
    const totalFrames = 24;
    const timer = window.setInterval(() => {
      frame++;
      const progress = Math.min(1, frame / totalFrames);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(target * eased));
      if (frame >= totalFrames) window.clearInterval(timer);
    }, 18);
    return () => window.clearInterval(timer);
  }, [target]);

  return (
    <span className="tabular-nums">
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

export function LandingPage({
  officer,
  onReportIssue,
  onOpenGrid,
  onOpenTrack,
  onOpenOfficerConsole,
}: LandingPageProps) {
  const { t } = useLanguage();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [gridNodes, setGridNodes] = useState<Complaint[]>([]);
  const [gridSectors, setGridSectors] = useState<WardSector[]>([]);
  const [liveUpdates, setLiveUpdates] = useState<PublicLiveUpdate[]>([]);
  const [mapViewMode, setMapViewMode] = useState<'both' | '3d' | 'google'>('both');
  const [selectedMapNodeId, setSelectedMapNodeId] = useState<number | null>(null);
  const [carouselHeight, setCarouselHeight] = useState<number>(660);

  const loadHomepageLiveData = useCallback(async () => {
    try {
      const [statsRes, gridRes, updatesRes] = await Promise.all([
        api.getPublicStats(),
        api.getLiveGrid(true),
        api.getPublicUpdates(),
      ]);
      setStats(statsRes);
      setGridNodes(gridRes.nodes);
      setGridSectors(gridRes.sectors);
      setLiveUpdates(updatesRes.updates);
    } catch {
      // Keep previous data on transient error
    }
  }, []);

  useEffect(() => {
    loadHomepageLiveData();
    return subscribeToLiveEvents(() => {
      loadHomepageLiveData();
    });
  }, [loadHomepageLiveData]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') {
        return;
      }
      const payload = event.data as { type?: string; ticketId?: string; height?: number };
      if (payload.type === 'CIVICLENS_TRACK_TICKET' && typeof payload.ticketId === 'string') {
        onOpenTrack(payload.ticketId);
      } else if (
        payload.type === 'CIVICLENS_CAROUSEL_HEIGHT' &&
        typeof payload.height === 'number' &&
        payload.height >= 640 &&
        payload.height <= 1400
      ) {
        setCarouselHeight(Math.ceil(payload.height));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onOpenTrack]);

  return (
    <div className="min-h-screen bg-[#070B19] text-slate-100">
      <header className="sticky top-0 z-40 bg-[#070B19]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <a
            href="#top"
            className="text-lg font-extrabold tracking-tight text-white font-display whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block" />
            <span>CivicLens</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-300">
            <button
              type="button"
              onClick={onReportIssue}
              className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navReport}
            </button>
            <a
              href="#smart-3d-grid"
              className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navGrid}
            </a>
            <button
              type="button"
              onClick={() => onOpenTrack()}
              className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navTrack}
            </button>
            <a
              href="#priority-formula"
              className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navPriorityMatrix}
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <LanguageSelector dark />
            <button
              type="button"
              onClick={onOpenOfficerConsole}
              className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{officer ? t.navOfficer : t.heroCtaOfficer}</span>
            </button>
          </div>
        </div>
      </header>

      <section id="top" className="relative overflow-hidden border-b border-white/10">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(129,140,248,0.18),transparent_50%)]"
        />

        <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-22">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl flex flex-col justify-center"
          >
            <p className="text-xs font-semibold text-cyan-300 tracking-wide">{t.noLoginNotice}</p>
            <h1
              className="mt-3 font-extrabold tracking-tight text-white leading-[1.06]"
              style={{ fontSize: 'clamp(2.25rem, 4.2vw, 3.6rem)', textWrap: 'balance' }}
            >
              {t.heroTitle}
            </h1>
            <p className="mt-5 text-base text-slate-300 leading-relaxed max-w-2xl">{t.heroSubtitle}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={onReportIssue}
                className="px-5 py-3 text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <span>{t.heroCtaReport}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onOpenGrid}
                className="px-5 py-3 text-sm font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Box className="w-4 h-4 text-cyan-300" />
                <span>{t.heroCtaGrid}</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenTrack()}
                className="px-4 py-3 text-sm font-medium text-cyan-300 hover:text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>{t.navTrack}</span>
              </button>
            </div>
          </motion.div>

          <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-slate-400">{t.kpiTotalTickets}</p>
              <p className="mt-1 text-3xl font-extrabold text-white font-display">
                <AnimatedStat target={stats?.totalComplaints ?? 0} />
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">{t.kpiOpenCritical}</p>
              <p className="mt-1 text-3xl font-extrabold text-rose-400 font-display">
                <AnimatedStat target={stats?.activeCritical ?? 0} />
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">{t.kpiDuplicateClusters}</p>
              <p className="mt-1 text-3xl font-extrabold text-violet-400 font-display">
                <AnimatedStat target={stats?.suspectedDuplicates ?? 0} />
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">{t.kpiCitizensImpacted}</p>
              <p className="mt-1 text-3xl font-extrabold text-cyan-300 font-display">
                <AnimatedStat target={stats?.totalPeopleImpacted ?? 0} />
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Interactive Smart 3D City Grid & Real-Time Citizen Updates directly on Homepage */}
      <section id="smart-3d-grid" className="max-w-7xl mx-auto px-6 pt-14 pb-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>{t.homeGridEyebrow}</span>
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-display">
              {t.homeGridTitle}
            </h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">{t.homeGridSubtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg bg-[#0B1124] border border-white/10 p-1 gap-1">
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
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    mapViewMode === opt.id
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenGrid}
              className="px-4 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Box className="w-3.5 h-3.5 text-cyan-300" />
              <span>{t.openFullGridBtn}</span>
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
              nodes={gridNodes}
              sectors={gridSectors}
              selectedNodeId={selectedMapNodeId}
              onSelectNode={(node) => setSelectedMapNodeId(node.id)}
              heightClass="h-[520px]"
            />
          )}
          {(mapViewMode === 'both' || mapViewMode === 'google') && (
            <RealTimeGooglePriorityMap
              nodes={gridNodes}
              sectors={gridSectors}
              selectedNodeId={selectedMapNodeId}
              onSelectNode={(node) => setSelectedMapNodeId(node.id)}
              heightClass="h-[520px]"
            />
          )}
        </div>

        {/* Live Citizen Updates Feed */}
        <div className="rounded-2xl border border-white/10 bg-[#0B1124] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>{t.liveUpdatesTitle}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">{t.liveUpdatesSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenTrack()}
              className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{t.navTrack}</span>
            </button>
          </div>

          {liveUpdates.length === 0 ? (
            <div className="px-6 py-8 text-xs text-slate-400 text-center">{t.noLiveUpdatesYet}</div>
          ) : (
            <div className="divide-y divide-white/10">
              {liveUpdates.slice(0, 6).map((item) => {
                const isDone = item.new_status === 'Resolved';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenTrack(item.ticket_id)}
                    className="w-full text-left px-6 py-3.5 hover:bg-white/5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-cyan-300 tabular-nums">
                          {item.ticket_id}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span
                          className={`font-semibold inline-flex items-center gap-1 ${
                            isDone ? 'text-emerald-300' : 'text-amber-300'
                          }`}
                        >
                          {isDone && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {translateStatus(t, item.new_status)}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-300">{item.ward}</span>
                        {item.assigned_crew && (
                          <>
                            <span className="text-slate-500">·</span>
                            <span className="text-cyan-200 inline-flex items-center gap-1">
                              <Wrench className="w-3 h-3" />
                              {item.assigned_crew}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-1">{item.note}</p>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                      {formatDateTime(item.created_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Highlighting the 5 Core AI Ticket Triage Capabilities */}
      <section className="max-w-7xl mx-auto px-6 pt-10 pb-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">{t.pillarsEyebrow}</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-display">
              {t.pillarsTitle}
            </h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onReportIssue}
              className="px-4 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap"
            >
              {t.navReport}
            </button>
            <button
              type="button"
              onClick={onOpenOfficerConsole}
              className="px-4 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-lg transition-colors whitespace-nowrap"
            >
              {t.navOfficer}
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { title: t.pillar1Title, desc: t.pillar1Desc, accent: 'border-cyan-500/30 text-cyan-300' },
            { title: t.pillar2Title, desc: t.pillar2Desc, accent: 'border-blue-500/30 text-blue-300' },
            { title: t.pillar3Title, desc: t.pillar3Desc, accent: 'border-rose-500/30 text-rose-300' },
            { title: t.pillar4Title, desc: t.pillar4Desc, accent: 'border-violet-500/30 text-violet-300' },
            { title: t.pillar5Title, desc: t.pillar5Desc, accent: 'border-emerald-500/30 text-emerald-300' },
          ].map((item) => (
            <div
              key={item.title}
              className={`p-5 rounded-2xl bg-[#0B1124] border ${item.accent.split(' ')[0]} flex flex-col justify-between`}
            >
              <div>
                <h3 className={`text-sm font-bold ${item.accent.split(' ')[1]}`}>{item.title}</h3>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Standalone 3D Department Routing Carousel Ring */}
      <section className="max-w-7xl mx-auto px-6 py-10">
        <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#070d1c]">
          <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-[#0B1124]">
            <div>
              <p className="text-xs font-mono text-violet-300 uppercase tracking-wider">
                3D Department Carousel
              </p>
              <p className="text-sm font-bold text-white">
                Roads · Waste · Water · Electricity · Trees · Drainage
              </p>
            </div>
            <a
              href="/civiclens-carousel.html"
              download="civiclens-carousel.html"
              className="px-3.5 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Single HTML</span>
            </a>
          </div>
          <iframe
            src="/civiclens-carousel.html"
            title="CivicLens Interactive 3D Rotating Carousel Ring"
            style={{ height: `${carouselHeight}px` }}
            className="w-full border-0 block bg-[#070d1c] transition-[height] duration-300"
          />
        </div>
      </section>

      <section id="priority-formula" className="max-w-7xl mx-auto px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">{t.matrixEyebrow}</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white font-display">
            {t.matrixTitle}
          </h2>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">{t.matrixSubtitle}</p>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-2xl bg-[#0B1124] border border-white/10">
            <div className="flex items-center justify-between">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <span className="font-mono text-xs font-bold text-rose-300 tabular-nums">{t.max35Pts}</span>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">{t.factorSeverity}</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{t.factorSeverityDesc}</p>
          </div>

          <div className="p-5 rounded-2xl bg-[#0B1124] border border-white/10">
            <div className="flex items-center justify-between">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <span className="font-mono text-xs font-bold text-cyan-300 tabular-nums">{t.max25Pts}</span>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">{t.factorCriticalArea}</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{t.factorCriticalAreaDesc}</p>
          </div>

          <div className="p-5 rounded-2xl bg-[#0B1124] border border-white/10">
            <div className="flex items-center justify-between">
              <Users className="w-5 h-5 text-violet-400" />
              <span className="font-mono text-xs font-bold text-violet-300 tabular-nums">{t.max20Pts}</span>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">{t.factorPeopleAffected}</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{t.factorPeopleAffectedDesc}</p>
          </div>

          <div className="p-5 rounded-2xl bg-[#0B1124] border border-white/10">
            <div className="flex items-center justify-between">
              <Clock className="w-5 h-5 text-amber-400" />
              <span className="font-mono text-xs font-bold text-amber-300 tabular-nums">{t.max20Pts}</span>
            </div>
            <h3 className="mt-4 text-base font-bold text-white">{t.factorHoursAffected}</h3>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{t.factorHoursAffectedDesc}</p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#0B1124] border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-cyan-300">
                <Globe2 className="w-5 h-5" />
                <Mic className="w-4 h-4" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">{t.featureLangTitle}</h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">{t.featureLangDesc}</p>
            </div>
            <button
              type="button"
              onClick={onReportIssue}
              className="mt-6 text-xs font-bold text-cyan-300 hover:text-cyan-200 text-left"
            >
              {t.featureLangCta}
            </button>
          </div>

          <div className="p-6 rounded-2xl bg-[#0B1124] border border-white/10 flex flex-col justify-between">
            <div>
              <GitMerge className="w-5 h-5 text-violet-400" />
              <h3 className="mt-4 text-lg font-bold text-white">{t.featureDupTitle}</h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">{t.featureDupDesc}</p>
            </div>
            <button
              type="button"
              onClick={onOpenOfficerConsole}
              className="mt-6 text-xs font-bold text-violet-300 hover:text-violet-200 text-left"
            >
              {t.featureDupCta}
            </button>
          </div>

          <div className="p-6 rounded-2xl bg-[#0B1124] border border-white/10 flex flex-col justify-between">
            <div>
              <Box className="w-5 h-5 text-emerald-400" />
              <h3 className="mt-4 text-lg font-bold text-white">{t.featureGridTitle}</h3>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">{t.featureGridDesc}</p>
            </div>
            <button
              type="button"
              onClick={onOpenGrid}
              className="mt-6 text-xs font-bold text-emerald-300 hover:text-emerald-200 text-left"
            >
              {t.featureGridCta}
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#050813]">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white font-display">CivicLens</span>
            <span>·</span>
            <span>{t.brandTagline}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={onReportIssue} className="hover:text-white">
              {t.navReport}
            </button>
            <button type="button" onClick={onOpenGrid} className="hover:text-white">
              {t.navGrid}
            </button>
            <button type="button" onClick={() => onOpenTrack()} className="hover:text-white">
              {t.navTrack}
            </button>
            <button type="button" onClick={onOpenOfficerConsole} className="hover:text-white">
              {t.navOfficer}
            </button>
            <a
              href="/civiclens-website.zip"
              download="civiclens-website.zip"
              className="px-3 py-1.5 rounded-lg bg-cyan-400/15 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400 hover:text-slate-950 font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Website ZIP</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
