import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Building2,
  Camera,
  CarFront,
  CheckCircle2,
  Droplets,
  FileText,
  GitMerge,
  Globe2,
  HelpCircle,
  Languages,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  Trees,
  Upload,
  User as UserIcon,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { translateCategory } from '../i18n/translations';
import {
  BENGALURU_WARDS,
  CATEGORIES,
  SAMPLE_MULTILINGUAL_PROMPTS,
  type Complaint,
  type ComplaintCategory,
} from '../types/civiclens';
import {
  PriorityBreakdownCard,
  SeverityIndicator,
  StatusLabel,
} from '../components/StatusVisuals';

interface ReportComplaintPageProps {
  onOpenGrid: () => void;
  onTrackTicket: (ticketId: string) => void;
}

interface SpeechRecLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const VOICE_LOCALE_MAP: Record<string, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
  te: 'te-IN',
  ta: 'ta-IN',
  es: 'es-ES',
  fr: 'fr-FR',
  ar: 'ar-SA',
};

export function ReportComplaintPage({ onOpenGrid, onTrackTicket }: ReportComplaintPageProps) {
  const { lang, t } = useLanguage();
  const { pushToast } = useToast();

  const [citizenName, setCitizenName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [ward, setWard] = useState(BENGALURU_WARDS[0]);
  const [streetLandmark, setStreetLandmark] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<string>('Auto-detect');
  const [selectedCategory, setSelectedCategory] = useState<ComplaintCategory | ''>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecLike | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    complaint: Complaint;
    communityImpact: number;
    suspectedDuplicatesCount: number;
  } | null>(null);

  const toggleVoiceDictation = () => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecLike;
      webkitSpeechRecognition?: new () => SpeechRecLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      pushToast(
        'Voice input unavailable',
        'Your browser does not support Web Speech dictation. Type in any language below.',
        'info'
      );
      return;
    }

    const rec = new SpeechRec();
    rec.lang = VOICE_LOCALE_MAP[lang] || 'en-IN';
    rec.interimResults = false;
    rec.continuous = false;

    rec.onresult = (event) => {
      const parts: string[] = [];
      const results = event?.results;
      if (results) {
        for (let i = 0; i < results.length; i++) {
          const transcript = results[i]?.[0]?.transcript;
          if (transcript) parts.push(transcript);
        }
      }
      const spoken = parts.join(' ').trim();
      if (spoken) {
        setDescription((prev) => (prev ? `${prev.trim()} ${spoken}` : spoken));
      }
    };
    rec.onerror = () => {
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
    };

    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Unsupported file format. Please select a JPG, JPEG, PNG, or WEBP photograph.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be 5 MB or smaller.');
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const applySamplePrompt = (sample: (typeof SAMPLE_MULTILINGUAL_PROMPTS)[number]) => {
    setPreferredLanguage(sample.language);
    setDescription(sample.text);
    setWard(sample.ward);
    setStreetLandmark(sample.landmark);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hasText = description.trim().length > 0;
    if (!hasText && !imageFile) {
      setError(t.intakeModeHint);
      return;
    }
    if (hasText && description.trim().length < 5 && !imageFile) {
      setError('Please describe the civic issue in at least 5 characters or attach a photo.');
      return;
    }
    if (!city.trim() || !ward.trim()) {
      setError('City and ward/area are required.');
      return;
    }

    const formData = new FormData();
    if (citizenName.trim()) formData.append('citizen_name', citizenName.trim());
    formData.append('description', description.trim());
    formData.append('city', city.trim());
    formData.append('ward', ward.trim());
    if (streetLandmark.trim()) {
      formData.append('street_landmark', streetLandmark.trim());
    }
    formData.append('preferred_language', preferredLanguage);
    if (selectedCategory) {
      formData.append('user_category', selectedCategory);
    }
    if (imageFile) {
      formData.append('image', imageFile);
    }

    setSubmitting(true);
    try {
      const res = await api.submitComplaint(formData);
      if (!res || !res.complaint || !res.complaint.ticket_id) {
        throw new Error('Ticket submission returned an incomplete response. Please try again.');
      }
      const suspectedCount = Array.isArray(res.suspected_duplicates) ? res.suspected_duplicates.length : 0;
      const impactCount = typeof res.community_impact_count === 'number' ? res.community_impact_count : 1;

      setSubmittedResult({
        complaint: res.complaint,
        communityImpact: impactCount,
        suspectedDuplicatesCount: suspectedCount,
      });
      pushToast(
        `${t.ticketLabel} ${res.complaint.ticket_id}`,
        `${t.priorityLabel} ${res.complaint.priority_score ?? 0}/100 · ${res.complaint.department ?? ''}`,
        'success'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to submit complaint.';
      setError(message);
      pushToast('Submission failed', message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSubmittedResult(null);
    setDescription('');
    setStreetLandmark('');
    setSelectedCategory('');
    clearImage();
    setError(null);
  };

  if (submittedResult) {
    const { complaint, communityImpact, suspectedDuplicatesCount } = submittedResult;
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto space-y-6"
      >
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap pb-6 border-b border-slate-200">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-700">{t.ticketCreatedBadge}</p>
                <h1 className="text-2xl font-extrabold text-slate-950 font-display mt-0.5 tabular-nums">
                  {t.ticketLabel} {complaint.ticket_id}
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  {complaint.ward} · {complaint.street_landmark} · {complaint.city}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <SeverityIndicator severity={complaint.severity} />
              <StatusLabel status={complaint.status} />
            </div>
          </div>

          {/* Highlighted One-Line Severity Reason & Structured Triage Output */}
          <div className="p-4 rounded-xl bg-slate-950 text-white space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-300">
                {t.severityReasonLabel}
              </span>
              <span className="text-xs font-bold text-white">
                {complaint.severity} · {translateCategory(t, complaint.category)} → {complaint.department}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-100 leading-relaxed">
              {complaint.severity_reason || t.severityReasonLabel}
            </p>
          </div>

          {complaint.citizen_reply_localized && (
            <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200">
              <p className="text-xs font-bold text-cyan-900">
                {t.localizedConfirmation} ({complaint.detected_language})
              </p>
              <p className="text-sm text-cyan-950 mt-1 leading-relaxed">
                {complaint.citizen_reply_localized}
              </p>
            </div>
          )}

          {(suspectedDuplicatesCount > 0 || communityImpact > 1) && (
            <div className="p-4 rounded-xl bg-violet-50 border border-violet-200 flex items-start gap-3">
              <GitMerge className="w-5 h-5 text-violet-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-violet-950">
                  {t.duplicateDetectedBanner} ({communityImpact} {t.clusterReportsLocation})
                </p>
                <p className="text-xs text-violet-800 mt-0.5">{t.duplicateDetectedDesc}</p>
              </div>
            </div>
          )}

          <PriorityBreakdownCard
            breakdown={complaint.priority_breakdown}
            score={complaint.priority_score}
            affectedPeople={complaint.affected_people_count}
            hoursAffected={complaint.hours_affected ?? 0}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500">{t.assignedDepartment}</p>
              <p className="font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-cyan-600 shrink-0" />
                <span>{complaint.department}</span>
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500">{t.classificationLanguage}</p>
              <p className="font-bold text-slate-900 mt-1">
                {translateCategory(t, complaint.category)} · {complaint.detected_language}
              </p>
            </div>
          </div>

          {complaint.image_path && complaint.image_analysis && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-4 items-start">
              <img
                src={complaint.image_path}
                alt="Submitted civic issue"
                className="w-28 h-24 object-cover rounded-lg border border-slate-200 shrink-0"
              />
              <div>
                <p className="text-xs font-semibold text-slate-500">{t.drawerVisionAssessment}</p>
                <p className="text-sm text-slate-800 mt-1 leading-relaxed">{complaint.image_analysis}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-500">{t.aiOfficerSummary}</p>
              <p className="text-sm text-slate-800 mt-1 leading-relaxed">{complaint.ai_summary}</p>
            </div>
            <div className="p-4 rounded-xl border border-cyan-200 bg-cyan-50/40">
              <p className="text-xs font-semibold text-cyan-900">{t.recommendedAction}</p>
              <p className="text-sm text-cyan-950 mt-1 leading-relaxed">{complaint.suggested_action}</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              {t.submitAnotherIssue}
            </button>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onOpenGrid}
                className="px-4 py-2 text-xs font-semibold text-slate-900 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Box className="w-3.5 h-3.5" />
                {t.viewOn3DGrid}
              </button>
              <button
                type="button"
                onClick={() => onTrackTicket(complaint.ticket_id)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-lg transition-colors"
              >
                {t.trackTicketStatus}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-cyan-700 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5" />
            <span>{t.noLoginNotice}</span>
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 font-display mt-1">
            {t.reportTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.reportSubtitle}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2.5">
          <Languages className="w-4 h-4 text-cyan-600" />
          <span>{t.trySamplesTitle}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_MULTILINGUAL_PROMPTS.map((sample) => (
            <button
              key={sample.language}
              type="button"
              onClick={() => applySamplePrompt(sample)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-cyan-50 hover:text-cyan-800 border border-slate-200 hover:border-cyan-300 rounded-lg transition-colors"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span>{t.fieldNameOptional}</span>
            </label>
            <input
              type="text"
              value={citizenName}
              onChange={(e) => setCitizenName(e.target.value)}
              placeholder={t.anonymousPlaceholder}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-cyan-600" />
              <span>{t.fieldResponseLanguage}</span>
            </label>
            <input
              type="text"
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              placeholder={t.responseLanguagePlaceholder}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
            />
          </div>
        </div>

        {/* Citizen Category Question */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-cyan-600" />
              <span>{t.fieldCategorySelect}</span>
            </label>
            <span className="text-[11px] font-medium text-slate-500">
              {selectedCategory ? translateCategory(t, selectedCategory) : t.categoryAutoDetect}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 text-left ${
                selectedCategory === ''
                  ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-cyan-400 hover:bg-cyan-50/40'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 shrink-0 ${selectedCategory === '' ? 'text-cyan-400' : 'text-cyan-600'}`} />
              <span className="truncate">{t.categoryAutoDetect}</span>
            </button>
            {CATEGORIES.map((cat) => {
              const Icon =
                cat === 'Roads'
                  ? CarFront
                  : cat === 'Waste Management'
                  ? Trash2
                  : cat === 'Water Supply'
                  ? Droplets
                  : cat === 'Electricity'
                  ? Zap
                  : cat === 'Trees'
                  ? Trees
                  : cat === 'Drainage'
                  ? Waves
                  : cat === 'Public Safety'
                  ? ShieldAlert
                  : HelpCircle;
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 text-left ${
                    active
                      ? 'bg-cyan-400 text-slate-950 border-cyan-500 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-cyan-400 hover:bg-cyan-50/40'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-slate-950' : 'text-cyan-600'}`} />
                  <span className="truncate">{translateCategory(t, cat)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              <label htmlFor="complaint-desc" className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-cyan-600" />
                <span>{t.fieldDescription}</span>
              </label>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-200">
                {description.trim() && imageFile
                  ? t.textPhotoBadge
                  : imageFile
                  ? t.photoOnlyBadge
                  : t.textOnlyBadge}
              </span>
            </div>
            <button
              type="button"
              onClick={toggleVoiceDictation}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
                listening
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-cyan-50 hover:border-cyan-300'
              }`}
            >
              {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-cyan-600" />}
              <span>{listening ? t.listening : t.speakComplaint}</span>
            </button>
          </div>
          <p className="text-xs text-slate-500">{t.intakeModeHint}</p>

          <textarea
            id="complaint-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.fieldDescriptionPlaceholder}
            className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-600"
          />
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-cyan-600" />
            <span>{t.locationSectionTitle}</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.fieldCity}</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.fieldWard}</label>
              <select
                value={ward}
                onChange={(e) => setWard(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                {BENGALURU_WARDS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t.fieldLandmark}</label>
              <input
                type="text"
                value={streetLandmark}
                onChange={(e) => setStreetLandmark(e.target.value)}
                placeholder={t.landmarkPlaceholder}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-cyan-600" />
              <span>{t.fieldPhotoOptional}</span>
            </p>
            <span className="text-xs text-slate-500">{t.max5Mb}</span>
          </div>

          {!imagePreviewUrl ? (
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 hover:border-cyan-400 rounded-xl cursor-pointer bg-slate-50/70 hover:bg-cyan-50/30 transition-colors">
              <Upload className="w-6 h-6 text-slate-400" />
              <span className="mt-2 text-xs font-semibold text-slate-700">{t.uploadClickLabel}</span>
              <span className="text-[11px] text-slate-500 mt-0.5">{t.uploadSubLabel}</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-w-md">
              <img src={imagePreviewUrl} alt="Complaint preview" className="w-full max-h-56 object-cover" />
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove uploaded image"
                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-slate-950/75 text-white hover:bg-slate-950 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-600 shrink-0" />
            <span>{t.aiPipelineNote}</span>
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 text-sm font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.analyzingAi}</span>
              </>
            ) : (
              <span>{t.submitComplaint}</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
