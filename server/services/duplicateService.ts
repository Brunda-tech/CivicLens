import type { ComplaintCategory, ComplaintSeverity, PriorityBreakdown } from '../types.ts';

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'for', 'of',
  'near', 'by', 'there', 'are', 'with', 'this', 'that', 'it', 'from', 'as',
  'has', 'have', 'been', 'was', 'were', 'be', 'very', 'huge', 'big', 'please',
  'help', 'issue', 'problem', 'complaint', 'report', 'area', 'street', 'road',
]);

function tokenize(text: string): Set<string> {
  const words = (text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface CriticalAreaEvaluation {
  label: string;
  score: number;
}

export function evaluateCriticalArea(
  text: string,
  streetLandmark: string,
  aiCriticalAreaType?: string
): CriticalAreaEvaluation {
  const combined = `${text ?? ''} ${streetLandmark ?? ''} ${aiCriticalAreaType || ''}`.toLowerCase();

  if (/(school|college|university|campus|kindergarten|playground|student|children)/.test(combined)) {
    return { label: 'School / Educational Zone', score: 25 };
  }
  if (/(hospital|clinic|ambulance|medical|pharmacy|emergency|health center)/.test(combined)) {
    return { label: 'Hospital / Healthcare Corridor', score: 25 };
  }
  if (/(substation|transformer|live wire|sparking|high voltage|gas leak|subway)/.test(combined)) {
    return { label: 'Critical Infrastructure / Hazard', score: 24 };
  }
  if (/(bus stop|metro|railway|station|junction|highway|arterial|main road|crossing|crosswalk)/.test(combined)) {
    return { label: 'High-Density Transit Hub', score: 18 };
  }
  if (/(market|mall|temple|park|crowd|commercial)/.test(combined)) {
    return { label: 'Public Gathering / Market Zone', score: 14 };
  }
  return { label: 'Standard Municipal Zone', score: 5 };
}

export function calculateMultiFactorPriority(params: {
  severity: ComplaintSeverity;
  criticalAreaScore: number;
  criticalAreaLabel: string;
  affectedPeopleCount: number;
  communityImpactCount: number;
  createdAtIso: string;
  status: string;
}): PriorityBreakdown {
  if (params.status === 'Resolved' || params.status === 'Rejected') {
    return {
      severityScore: 0,
      criticalAreaScore: 0,
      peopleAffectedScore: 0,
      hoursAffectedScore: 0,
      total: 0,
      criticalAreaLabel: params.criticalAreaLabel,
    };
  }

  // Factor 1: AI Severity (0 - 35 pts)
  const severityWeights: Record<ComplaintSeverity, number> = {
    CRITICAL: 35,
    HIGH: 24,
    MEDIUM: 14,
    LOW: 6,
  };
  const severityScore = severityWeights[params.severity] ?? 10;

  // Factor 2: Critical Area Sensitivity (0 - 25 pts)
  const criticalAreaScore = Math.min(25, Math.max(0, Math.round(params.criticalAreaScore || 0)));

  // Factor 3: Number of People Affected + Duplicate Reporter Cluster (0 - 20 pts)
  const effectivePeople = Math.max(
    params.affectedPeopleCount || 0,
    (params.communityImpactCount || 1) * 15
  );
  // Logarithmic/step scaling: 5 people -> 4, 25 -> 8, 60 -> 12, 150 -> 16, 300+ -> 20
  let peopleAffectedScore = 4;
  if (effectivePeople >= 250) peopleAffectedScore = 20;
  else if (effectivePeople >= 120) peopleAffectedScore = 17;
  else if (effectivePeople >= 60) peopleAffectedScore = 14;
  else if (effectivePeople >= 25) peopleAffectedScore = 10;
  else if (effectivePeople >= 10) peopleAffectedScore = 7;

  if (params.communityImpactCount > 1) {
    peopleAffectedScore = Math.min(20, peopleAffectedScore + Math.min(6, (params.communityImpactCount - 1) * 2));
  }

  // Factor 4: Total Hours Affected (0 - 20 pts)
  const createdMs = Date.parse(params.createdAtIso);
  const hoursAffected = Number.isNaN(createdMs) ? 0 : Math.max(0, (Date.now() - createdMs) / 3600000);
  const hoursAffectedScore = Math.min(20, Math.round((hoursAffected / 72) * 20));

  const total = Math.min(
    100,
    severityScore + criticalAreaScore + peopleAffectedScore + hoursAffectedScore
  );

  return {
    severityScore,
    criticalAreaScore,
    peopleAffectedScore,
    hoursAffectedScore,
    total,
    criticalAreaLabel: params.criticalAreaLabel || 'Standard Municipal Zone',
  };
}

export interface DuplicateCandidateInput {
  id: number;
  ticket_id: string;
  category: string;
  ward: string;
  city: string;
  street_landmark: string;
  description: string;
  translated_text: string;
  ai_summary: string;
  status: string;
  parent_incident_id: number | null;
}

export interface DetectedDuplicateMatch {
  relatedComplaintId: number;
  relatedTicketId: string;
  similarityScore: number;
  reason: string;
}

export function detectSuspectedDuplicates(
  incoming: {
    category: ComplaintCategory;
    ward: string;
    city: string;
    street_landmark: string;
    description: string;
    translated_text: string;
  },
  existing: DuplicateCandidateInput[]
): DetectedDuplicateMatch[] {
  const incomingText = `${incoming.translated_text ?? ''} ${incoming.description ?? ''} ${incoming.street_landmark ?? ''}`;
  const incomingTokens = tokenize(incomingText);
  const incomingLandmarkTokens = tokenize(incoming.street_landmark ?? '');
  const incomingWard = (incoming.ward ?? '').trim().toLowerCase();
  const incomingCity = (incoming.city ?? '').trim().toLowerCase();

  const matches: DetectedDuplicateMatch[] = [];

  for (const candidate of existing) {
    if (candidate.status === 'Rejected' || candidate.status === 'Resolved') continue;

    const sameCity = (candidate.city ?? '').trim().toLowerCase() === incomingCity;
    if (!sameCity) continue;

    const sameCategory = candidate.category === incoming.category;
    const sameWard = (candidate.ward ?? '').trim().toLowerCase() === incomingWard;

    const candidateText = `${candidate.translated_text ?? ''} ${candidate.ai_summary ?? ''} ${candidate.description ?? ''} ${candidate.street_landmark ?? ''}`;
    const candidateTokens = tokenize(candidateText);
    const candidateLandmarkTokens = tokenize(candidate.street_landmark ?? '');

    const textSim = jaccardSimilarity(incomingTokens, candidateTokens);
    const landmarkSim = jaccardSimilarity(incomingLandmarkTokens, candidateLandmarkTokens);

    let score = 0;
    const reasons: string[] = [];

    if (sameWard) {
      score += 0.3;
      reasons.push(`Same location (${incoming.ward})`);
    }
    if (sameCategory) {
      score += 0.25;
      reasons.push(`Same issue category (${incoming.category})`);
    }
    if (landmarkSim > 0) {
      score += Math.min(0.25, landmarkSim * 0.5);
      reasons.push('Matching street or landmark');
    }
    score += Math.min(0.3, textSim * 0.7);
    if (textSim >= 0.15) {
      reasons.push('Similar complaint pattern');
    }

    const finalScore = Math.min(0.99, Math.round(score * 100) / 100);

    // Flag suspected duplicate when multiple people report from the same ward + category,
    // or strong landmark + location overlap
    if ((sameWard && sameCategory && finalScore >= 0.55) || (sameWard && landmarkSim >= 0.35 && finalScore >= 0.55)) {
      matches.push({
        relatedComplaintId: candidate.id,
        relatedTicketId: candidate.ticket_id,
        similarityScore: finalScore,
        reason: reasons.join(' · '),
      });
    }
  }

  return matches.sort((a, b) => b.similarityScore - a.similarityScore).slice(0, 6);
}
