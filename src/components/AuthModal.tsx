import React, { useState } from 'react';
import { Building2, Lock, Mail, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import type { OfficerUser } from '../types/civiclens';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (officer: OfficerUser) => void;
}

const OFFICER_DEPARTMENTS = [
  'Central Municipal Command',
  'Public Works & Road Maintenance',
  'Electricity & Street Lighting',
  'Water Supply & Sewerage Board',
  'Stormwater & Drainage Authority',
  'Solid Waste & Sanitation',
  'Urban Forestry & Parks',
  'Municipal Safety & Enforcement',
];

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const { loginOfficer, registerOfficer } = useAuth();
  const { t } = useLanguage();
  const { pushToast } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState(OFFICER_DEPARTMENTS[0]);
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      let signedInOfficer: OfficerUser;
      if (mode === 'login') {
        signedInOfficer = await loginOfficer(email, password);
      } else {
        signedInOfficer = await registerOfficer({
          name,
          email,
          password,
          department,
          inviteCode,
        });
      }
      pushToast(
        `Officer Authenticated`,
        `Signed in as ${signedInOfficer.name} (${signedInOfficer.badge_id})`,
        'success'
      );
      onSuccess(signedInOfficer);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Officer authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoOfficerSignIn = async () => {
    setError(null);
    setEmail('officer@civiclens.demo');
    setPassword('Officer@2026');
    setMode('login');
    setSubmitting(true);

    try {
      const signedInOfficer = await loginOfficer('officer@civiclens.demo', 'Officer@2026');
      pushToast(
        `Welcome, ${signedInOfficer.name}`,
        'Demo Municipal Officer session active',
        'success'
      );
      onSuccess(signedInOfficer);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo officer login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-950 text-white">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h2 className="text-base font-bold font-display">
                  {mode === 'login' ? t.authModalLoginTitle : t.authModalRegTitle}
                </h2>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">{t.authModalSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close officer modal"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.authTabSignIn}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.authTabInviteReg}
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 leading-relaxed">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t.authNameLabel}</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Meera Rao"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t.authEmailLabel}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="officer@civiclens.demo"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{t.authPasswordLabel}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={mode === 'register' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                  />
                </div>
              </div>

              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{t.authDeptLabel}</label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                      >
                        {OFFICER_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">{t.authInviteLabel}</label>
                    <input
                      type="password"
                      required
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="OFFICER_INVITE_CODE"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-950 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors"
              >
                {submitting
                  ? t.authAuthenticating
                  : mode === 'login'
                  ? t.authSubmitLogin
                  : t.authSubmitReg}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">{t.authDemoAccess}</span>
                <span className="text-[11px] text-slate-400">{t.authOneClick}</span>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDemoOfficerSignIn}
                className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-cyan-400 hover:bg-cyan-50/40 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">{t.authDemoOfficerName}</p>
                  <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                    officer@civiclens.demo · Officer@2026
                  </p>
                </div>
                <span className="text-xs font-semibold text-cyan-700 whitespace-nowrap shrink-0">
                  {t.authSignInArrow}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
