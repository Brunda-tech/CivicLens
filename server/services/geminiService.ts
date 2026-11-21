import fs from 'node:fs';
import { GoogleGenAI, Type } from '@google/genai';
import {
  CATEGORIES,
  DEPARTMENT_MAP,
  SEVERITIES,
  type ComplaintCategory,
  type ComplaintSeverity,
  type GeminiAnalysisResult,
} from '../types.ts';

const FREE_TEXT_MODELS = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
const AI_REQUEST_TIMEOUT_MS = 10000;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out (${ms}ms)`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function extractReadableAiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'AI analysis failed.');
  try {
    const outer = JSON.parse(raw) as { error?: { message?: string; status?: string } | string; message?: string };
    if (outer && typeof outer === 'object') {
      if (outer.error && typeof outer.error === 'object' && typeof outer.error.message === 'string') {
        return outer.error.message;
      }
      if (typeof outer.error === 'string') {
        return outer.error;
      }
      if (typeof outer.message === 'string') {
        return outer.message;
      }
    }
  } catch {
    // Raw message is plain text
  }
  return raw || 'AI analysis failed.';
}

function isTransientAiError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset')
  );
}

async function generateWithModelFallback(
  ai: GoogleGenAI,
  buildRequest: (model: string) => Parameters<GoogleGenAI['models']['generateContent']>[0]
) {
  let lastError: unknown;

  for (let mIdx = 0; mIdx < FREE_TEXT_MODELS.length; mIdx++) {
    const model = FREE_TEXT_MODELS[mIdx];
    try {
      return await withTimeout(
        ai.models.generateContent(buildRequest(model)),
        AI_REQUEST_TIMEOUT_MS,
        `Model ${model}`
      );
    } catch (err) {
      lastError = err;
      if (!isTransientAiError(err)) {
        throw new Error(extractReadableAiError(err));
      }
    }
  }

  throw new Error(
    extractReadableAiError(
      lastError ?? 'The AI triage service is temporarily busy. Please try again in a moment.'
    )
  );
}

function normalizeCategory(raw: unknown): ComplaintCategory {
  if (typeof raw !== 'string') return 'Other';
  const found = CATEGORIES.find((c) => c.toLowerCase() === raw.trim().toLowerCase());
  return found ?? 'Other';
}

function normalizeSeverity(raw: unknown): ComplaintSeverity {
  if (typeof raw !== 'string') return 'MEDIUM';
  const upper = raw.trim().toUpperCase();
  if (SEVERITIES.includes(upper as ComplaintSeverity)) {
    return upper as ComplaintSeverity;
  }
  return 'MEDIUM';
}

function cleanTextField(val: unknown, fallback: string): string {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.length > 0 && trimmed.toLowerCase() !== 'null') {
      return trimmed;
    }
  }
  return fallback;
}

function parseAiJsonObject(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini returned malformed JSON during complaint analysis.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini returned an invalid analysis payload. Please try submitting again.');
  }

  return parsed as Record<string, unknown>;
}

export async function analyzeComplaintWithGemini(input: {
  description: string;
  city: string;
  ward: string;
  street_landmark: string;
  preferred_language: string;
  user_category?: ComplaintCategory;
  imageFilePath?: string | null;
  imageMimeType?: string | null;
}): Promise<GeminiAnalysisResult> {
  const ai = getAiClient();

  const hasText = input.description.trim().length > 0;
  const promptText = `Analyze the following unstructured citizen municipal complaint (submitted as free text in ANY language, a photograph, or both) and return a strict JSON assessment.

Citizen Input:
- City: ${input.city}
- Ward / Area: ${input.ward}
- Street / Landmark: ${input.street_landmark || 'Not specified'}
- Citizen UI Language Hint: ${input.preferred_language}
- Citizen-Selected Category: ${input.user_category ? `${input.user_category} (Explicitly selected by citizen — use this exact category and route to its department)` : 'Auto-detect from complaint text and photo'}
- Raw Complaint Text: ${
    hasText
      ? `"""${input.description}"""`
      : '[No text typed — citizen uploaded a photograph only. Rely on the attached image to identify the civic issue, category, severity, one-line reason, and department.]'
  }

Instructions:
1. Category Classification: Choose exactly ONE category from: Roads, Waste Management, Water Supply, Electricity, Trees, Drainage, Public Safety, Other.${input.user_category ? ` Note: citizen chose "${input.user_category}".` : ''}
2. Context-Aware Severity Detection: Choose ONE severity:
   - CRITICAL: Immediate danger to human life or public safety, OR serious hazard near sensitive zones (schools, colleges, hospitals, clinics, night-time unlit danger, live exposed wires, open manholes, structural collapse).
   - HIGH: Serious disruption affecting commuters, sanitation outside public buildings, or major utility leaks.
   - MEDIUM: Moderate issue requiring scheduled municipal attention without immediate danger.
   - LOW: Minor civic maintenance issue with low disruption.
3. Severity Reason: Provide a crisp, single-line reason (max 18 words) stating why that severity was assigned (e.g., "Exposed live electrical wire outside a school gate poses immediate electrocution danger.").
4. Department Routing: Assign the matching department:
   Roads -> Public Works Department
   Waste Management -> Solid Waste Management Department
   Water Supply -> Water Supply Department
   Electricity -> Electrical Department
   Trees -> Horticulture / Tree Maintenance Department
   Drainage -> Drainage Department
   Public Safety -> Emergency Response Department
   Other -> General Municipal Department
5. Summary: 1-2 crisp sentences in English for municipal officers. Never invent locations or facts not supplied.
6. Suggested Action: Concrete operational action the assigned department should execute next.
7. Universal Language Processing:
   - Detect the actual language of Raw Complaint Text (e.g., English, Hindi, Kannada, Telugu, Tamil, Marathi, Bengali, Spanish, French, Arabic, etc.; if photo-only, use Citizen UI Language Hint or "Photo Only (English)").
   - Provide an accurate English translation in translated_text (or a concise English visual summary if photo-only).
   - Provide citizen_reply_localized: Write a polite, clear 1-2 sentence confirmation IN THE EXACT SAME LANGUAGE AS THE CITIZEN'S COMPLAINT (or Citizen UI Language Hint if photo-only) explaining that CivicLens understood the issue, classified its severity, and routed it to the assigned department.
8. Critical Area & Impact Estimation:
   - critical_area_type: Identify if this affects a "School / Educational Zone", "Hospital / Healthcare Corridor", "High-Density Transit Hub", "Critical Infrastructure / Hazard", "Public Gathering / Market Zone", or "Standard Municipal Zone".
   - estimated_people_affected: Realistic integer estimate of daily people impacted by this location and issue (e.g., 5 to 500).
9. Image Analysis: ${
    input.imageFilePath
      ? 'An image is attached. Inspect the photo carefully. Describe ONLY visible infrastructure hazards or evidence present in the photo. State whether the photo confirms or elevates severity. If blurry or unclear, mention that honestly.'
      : 'No photograph was uploaded. Set image_analysis to "No photograph uploaded."'
  }`;

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (input.imageFilePath && input.imageMimeType) {
    const fileBuffer = fs.readFileSync(input.imageFilePath);
    parts.push({
      inlineData: {
        mimeType: input.imageMimeType,
        data: fileBuffer.toString('base64'),
      },
    });
  }
  parts.push({ text: promptText });

  const response = await generateWithModelFallback(ai, (model) => ({
    model,
    contents: { parts },
    config: {
      systemInstruction:
        'You are CivicLens AI, a universal multilingual municipal triage engine. Understand complaints in any language, detect context-aware severity, inspect photos objectively, and return strict JSON without inventing facts.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          severity: { type: Type.STRING },
          severity_reason: { type: Type.STRING },
          department: { type: Type.STRING },
          summary: { type: Type.STRING },
          suggested_action: { type: Type.STRING },
          detected_language: { type: Type.STRING },
          translated_text: { type: Type.STRING },
          citizen_reply_localized: { type: Type.STRING },
          critical_area_type: { type: Type.STRING },
          estimated_people_affected: { type: Type.INTEGER },
          image_analysis: { type: Type.STRING },
        },
        required: [
          'category',
          'severity',
          'severity_reason',
          'department',
          'summary',
          'suggested_action',
          'detected_language',
          'translated_text',
          'citizen_reply_localized',
          'critical_area_type',
          'estimated_people_affected',
          'image_analysis',
        ],
      },
    },
  }));

  const rawText = typeof response?.text === 'string' ? response.text.trim() : '';
  if (!rawText) {
    throw new Error('Gemini returned an empty response while analyzing the complaint.');
  }

  const parsed = parseAiJsonObject(rawText);

  const category = input.user_category ?? normalizeCategory(parsed.category);
  const severity = normalizeSeverity(parsed.severity);
  const department = DEPARTMENT_MAP[category];
  const rawPeople = Number(parsed.estimated_people_affected);
  const peopleEst = Number.isFinite(rawPeople) && rawPeople > 0
    ? Math.max(1, Math.min(2000, Math.round(rawPeople)))
    : 15;

  const fallbackDesc = input.description.trim() || `Photo-submitted ${category.toLowerCase()} issue in ${input.ward}.`;

  return {
    category,
    severity,
    severity_reason: cleanTextField(parsed.severity_reason, 'Assigned based on reported civic risk.'),
    department,
    summary: cleanTextField(parsed.summary, fallbackDesc.slice(0, 180)),
    suggested_action: cleanTextField(parsed.suggested_action, `Dispatch ${department} inspection crew.`),
    detected_language: cleanTextField(parsed.detected_language, input.preferred_language || 'English'),
    translated_text: cleanTextField(parsed.translated_text, fallbackDesc),
    citizen_reply_localized: cleanTextField(
      parsed.citizen_reply_localized,
      `Your complaint has been understood, prioritized as ${severity}, and routed to ${department}.`
    ),
    critical_area_type: cleanTextField(parsed.critical_area_type, 'Standard Municipal Zone'),
    estimated_people_affected: peopleEst,
    image_analysis: input.imageFilePath
      ? cleanTextField(parsed.image_analysis, 'Photo reviewed alongside complaint submission.')
      : 'No photograph uploaded.',
  };
}

export async function askMunicipalAssistant(params: {
  question: string;
  databaseSnapshot: unknown;
}): Promise<string> {
  const ai = getAiClient();

  const response = await generateWithModelFallback(ai, (model) => ({
    model,
    contents: `Municipal Database Snapshot (Live SQLite Query Results):
${JSON.stringify(params.databaseSnapshot, null, 2)}

Officer Question:
"${params.question}"

Answer concisely using ONLY exact numbers, priority scores, affected people counts, hours open, wards, and ticket IDs from the snapshot.`,
    config: {
      systemInstruction:
        'You are the CivicLens Officer Operations Assistant. Never invent statistics or ticket IDs not present in the live database snapshot.',
    },
  }));

  const answer = typeof response?.text === 'string' ? response.text.trim() : '';
  if (!answer) {
    throw new Error('Gemini returned an empty response for the assistant query.');
  }
  return answer;
}
