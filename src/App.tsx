import { useEffect, useState } from 'react';
import {
  BarChart3,
  Bot,
  Box,
  FilePlus2,
  Home,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthModal } from './components/AuthModal';
import { ComplaintDetailDrawer } from './components/ComplaintDetailDrawer';
import { LanguageSelector } from './components/StatusVisuals';
import { LandingPage } from './pages/LandingPage';
import { ReportComplaintPage } from './pages/ReportComplaintPage';
import { TrackTicketPage } from './pages/TrackTicketPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { LocationIntelligencePage } from './pages/LocationIntelligencePage';
import { AiAssistantPage } from './pages/AiAssistantPage';

type AppView =
  | 'landing'
  | 'report'
  | 'grid'
  | 'track'
  | 'admin-dashboard'
  | 'analytics'
  | 'locations'
  | 'assistant';

function CivicLensShell() {
  const { officer, loading, logoutOfficer } = useAuth();
  const { t } = useLanguage();
  const { pushToast } = useToast();

  const [view, setView] = useState<AppView>('landing');
  const [trackInitialId, setTrackInitialId] = useState('');
  const [selectedComplaintId, setSelectedComplaintId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingOfficerView, setPendingOfficerView] = useState<AppView | null>(null);

  const openOfficerLogin = (nextView: AppView = 'admin-dashboard') => {
    if (officer) {
      setView(nextView);
      return;
    }
    setPendingOfficerView(nextView);
    setAuthModalOpen(true);
  };

  const navigateView = (targetView: AppView) => {
    setMobileMenuOpen(false);
    const officerOnlyViews: AppView[] = ['admin-dashboard', 'analytics', 'locations', 'assistant'];
    if (officerOnlyViews.includes(targetView) && !officer) {
      openOfficerLogin(targetView);
      return;
    }
    setView(targetView);
  };

  const handleLogout = async () => {
    await logoutOfficer();
    setSelectedComplaintId(null);
    setView('landing');
    pushToast('Officer Signed Out', 'Your officer session has been closed.', 'info');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070B19] flex items-center justify-center text-white">
        <div className="text-center space-y-2">
          <p className="text-lg font-extrabold font-display">CivicLens</p>
          <p className="text-xs text-slate-400">{t.initializingApp}</p>
        </div>
      </div>
    );
  }

  if (view === 'landing') {
    return (
      <>
        <LandingPage
          officer={officer}
          onReportIssue={() => setView('report')}
          onOpenGrid={() => setView('grid')}
          onOpenTrack={(ticketId?: string) => {
            setTrackInitialId(ticketId || '');
            setView('track');
          }}
          onOpenOfficerConsole={() => openOfficerLogin('admin-dashboard')}
        />
        <AuthModal
          open={authModalOpen}
          onClose={() => {
            setAuthModalOpen(false);
            setPendingOfficerView(null);
          }}
          onSuccess={() => {
            setView(pendingOfficerView || 'admin-dashboard');
            setPendingOfficerView(null);
          }}
        />
      </>
    );
  }

  const navItems: Array<{
    id: AppView;
    label: string;
    icon: typeof FilePlus2;
    visible: boolean;
  }> = [
    { id: 'report', label: t.navReport, icon: FilePlus2, visible: true },
    { id: 'grid', label: t.navGrid, icon: Box, visible: true },
    { id: 'track', label: t.navTrack, icon: Search, visible: true },
    { id: 'admin-dashboard', label: t.navOfficerQueue, icon: ShieldCheck, visible: Boolean(officer) },
    { id: 'analytics', label: t.navAnalytics, icon: BarChart3, visible: Boolean(officer) },
    { id: 'locations', label: t.navOfficerGrid, icon: Box, visible: Boolean(officer) },
    { id: 'assistant', label: t.navAiAssistant, icon: Bot, visible: Boolean(officer) },
  ];

  const renderWorkspaceContent = () => {
    switch (view) {
      case 'report':
        return (
          <ReportComplaintPage
            onOpenGrid={() => setView('grid')}
            onTrackTicket={(ticketId) => {
              setTrackInitialId(ticketId);
              setView('track');
            }}
          />
        );
      case 'grid':
        return (
          <LocationIntelligencePage
            isOfficer={Boolean(officer)}
            onInspectComplaint={(id) => {
              if (officer) setSelectedComplaintId(id);
            }}
            refreshTrigger={refreshTrigger}
          />
        );
      case 'track':
        return <TrackTicketPage initialTicketId={trackInitialId} />;
      case 'admin-dashboard':
        return (
          <AdminDashboard
            onSelectComplaint={(id) => setSelectedComplaintId(id)}
            onOpen3DGrid={() => setView('locations')}
            refreshTrigger={refreshTrigger}
          />
        );
      case 'analytics':
        return <AnalyticsPage />;
      case 'locations':
        return (
          <LocationIntelligencePage
            isOfficer={true}
            onInspectComplaint={(id) => setSelectedComplaintId(id)}
            refreshTrigger={refreshTrigger}
          />
        );
      case 'assistant':
        return <AiAssistantPage />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#070B19] text-white px-4 h-14 flex items-center justify-between border-b border-white/10">
        <button
          type="button"
          onClick={() => setView('landing')}
          className="text-base font-extrabold tracking-tight font-display flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-sm bg-cyan-400 inline-block" />
          <span>CivicLens</span>
        </button>
        <div className="flex items-center gap-2">
          <LanguageSelector dark />
          {!officer && (
            <button
              type="button"
              onClick={() => openOfficerLogin('admin-dashboard')}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-md whitespace-nowrap"
            >
              {t.officerShort}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'
        } lg:sticky lg:top-0 lg:h-screen lg:flex w-64 shrink-0 bg-[#070B19] text-slate-200 flex-col justify-between border-r border-white/10`}
      >
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setView('landing');
              }}
              className="text-lg font-extrabold tracking-tight text-white font-display flex items-center gap-2"
            >
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block" />
              <span>CivicLens</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setView('landing');
              }}
              title={t.backToHome}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-1">
            <LanguageSelector dark />
          </div>

          <nav className="space-y-1">
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateView(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
          </nav>
        </div>

        {/* Officer Footer */}
        <div className="p-4 border-t border-white/10 space-y-3">
          {officer ? (
            <>
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-400/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{officer.name}</p>
                  <p className="text-[11px] font-mono text-cyan-300 truncate">{officer.badge_id}</p>
                  <p className="text-[10px] text-slate-400 truncate">{officer.department}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.signOutOfficer}</span>
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {t.sidebarCitizenNote}
              </p>
              <button
                type="button"
                onClick={() => openOfficerLogin('admin-dashboard')}
                className="w-full py-2 px-3 rounded-lg text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{t.heroCtaOfficer}</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-5 sm:p-8 max-w-[1360px] w-full mx-auto">
        {renderWorkspaceContent()}
      </main>

      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setPendingOfficerView(null);
        }}
        onSuccess={() => {
          setView(pendingOfficerView || 'admin-dashboard');
          setPendingOfficerView(null);
        }}
      />

      <ComplaintDetailDrawer
        complaintId={selectedComplaintId}
        isOfficer={Boolean(officer)}
        onClose={() => setSelectedComplaintId(null)}
        onUpdated={() => setRefreshTrigger((n) => n + 1)}
      />
    </div>
  );
}

export default function App() {
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  return (
    <ToastProvider>
      <LanguageProvider>
        <AuthProvider>
          {mapsQuotaExceeded && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
              <span>
                Google Maps Platform quota reached. If you are the app owner, visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-amber-950 hover:text-amber-800"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          )}
          <CivicLensShell />
        </AuthProvider>
      </LanguageProvider>
    </ToastProvider>
  );
}
