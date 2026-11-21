import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import {
  clearSessionCookie,
  extractTokenFromRequest,
  hashPassword,
  setSessionCookie,
  signToken,
  verifyOriginForCookieAuth,
  verifyPassword,
  verifyToken,
  type AuthenticatedRequest,
} from './auth.ts';
import { db, seedDemoDataIfEmpty, toSafeOfficer } from './database.ts';
import { broadcastLiveEvent, registerSseClient } from './events.ts';
import {
  calculateMultiFactorPriority,
  detectSuspectedDuplicates,
  evaluateCriticalArea,
} from './services/duplicateService.ts';
import { analyzeComplaintWithGemini, askMunicipalAssistant, extractReadableAiError } from './services/geminiService.ts';
import {
  CATEGORIES,
  computeComplaintCoordinates,
  DEPARTMENT_MAP,
  getWardSector,
  SEVERITIES,
  SLA_HOURS,
  STATUSES,
  WARD_SECTORS,
  type ComplaintCategory,
  type ComplaintRow,
  type ComplaintSeverity,
  type ComplaintStatus,
  type OfficerUser,
} from './types.ts';

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = ALLOWED_MIME_EXT[file.mimetype] || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_EXT[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported image format. Please upload JPG, JPEG, PNG, or WEBP.'));
    }
  },
});

function requireOfficer(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Officer authentication required. Please sign in.' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Officer session expired. Please sign in again.' });
    return;
  }
  const officer = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as unknown as OfficerUser | undefined;
  if (!officer || officer.role !== 'officer') {
    res.status(401).json({ error: 'Officer account not found.' });
    return;
  }
  req.officer = toSafeOfficer(officer);
  next();
}

function enrichComplaint(row: ComplaintRow) {
  const createdMs = Date.parse(row.created_at ?? '');
  const hoursAffected = Number.isNaN(createdMs)
    ? 0
    : Math.max(0, Math.round(((Date.now() - createdMs) / 3600000) * 10) / 10);
  const slaHours = SLA_HOURS[row.severity] ?? 48;
  const isClosed = row.status === 'Resolved' || row.status === 'Rejected';
  const isEscalated = !isClosed && hoursAffected > slaHours;

  const breakdown = calculateMultiFactorPriority({
    severity: row.severity,
    criticalAreaScore: row.critical_area_score ?? 5,
    criticalAreaLabel: row.critical_area_type ?? 'Standard Municipal Zone',
    affectedPeopleCount: row.affected_people_count ?? 15,
    communityImpactCount: row.community_impact_count ?? 1,
    createdAtIso: row.created_at,
    status: row.status,
  });

  const coords = computeComplaintCoordinates(row.ward, row.grid_x ?? 0, row.grid_z ?? 0);

  return {
    ...row,
    lat: coords.lat,
    lng: coords.lng,
    priority_score: breakdown.total,
    priority_breakdown: breakdown,
    hours_affected: hoursAffected,
    sla_hours: slaHours,
    is_escalated: isEscalated,
  };
}

function generateTicketId(): string {
  const year = new Date().getFullYear();
  const row = db.prepare('SELECT MAX(id) as maxId FROM complaints').get() as { maxId: number | null } | undefined;
  const nextSeq = (row?.maxId ?? 0) + 1001;
  const rand = crypto.randomInt(10, 99);
  return `CL-${year}-${nextSeq}${rand}`;
}

export function registerRoutes(app: express.Application): void {
  app.use('/api', verifyOriginForCookieAuth);

  // ---------------- HEALTH & LIVE EVENTS ----------------
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'CivicLens API' });
  });

  app.get('/api/events', (_req: Request, res: Response) => {
    registerSseClient(res);
  });

  // ---------------- OFFICER-ONLY AUTHENTICATION ----------------
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const department = String(req.body?.department ?? 'Central Municipal Command').trim();
    const inviteCode = String(req.body?.inviteCode ?? '').trim();

    const configuredInvite = (process.env.OFFICER_INVITE_CODE || process.env.ADMIN_INVITE_CODE || '').trim();
    if (!configuredInvite || inviteCode !== configuredInvite) {
      res.status(403).json({
        error:
          'Officer registration requires a valid Officer Invite Code configured by the municipality, or use the Demo Officer credentials.',
      });
      return;
    }

    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'Officer full name must be between 2 and 80 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please provide a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An officer account with this email already exists.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const badgeId = `CL-OFF-${crypto.randomInt(200, 999)}`;
    const result = db
      .prepare(
        "INSERT INTO users (name, email, password_hash, role, department, badge_id, is_demo, created_at) VALUES (?, ?, ?, 'officer', ?, ?, 0, ?)"
      )
      .run(name, email, hashPassword(password), department, badgeId, nowIso);

    const createdOfficer = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as unknown as OfficerUser;
    const safeOfficer = toSafeOfficer(createdOfficer);
    const token = signToken(safeOfficer);
    setSessionCookie(res, token);

    res.status(201).json({ officer: safeOfficer, token });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      res.status(400).json({ error: 'Officer email and password are required.' });
      return;
    }

    const officer = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as unknown as OfficerUser | undefined;
    if (!officer || officer.role !== 'officer' || !verifyPassword(password, officer.password_hash)) {
      res.status(401).json({ error: 'Invalid officer credentials.' });
      return;
    }

    const safeOfficer = toSafeOfficer(officer);
    const token = signToken(safeOfficer);
    setSessionCookie(res, token);

    res.json({ officer: safeOfficer, token });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireOfficer, (req: AuthenticatedRequest, res: Response) => {
    res.json({ officer: req.officer });
  });

  // ---------------- PUBLIC CITIZEN INTAKE (NO AUTH REQUIRED) ----------------
  app.post(
    '/api/complaints',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('image')(req, res, (err: unknown) => {
        if (err) {
          const message = err instanceof Error ? err.message : 'File upload failed.';
          res.status(400).json({ error: message });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const citizenName = String(req.body?.citizen_name ?? '').trim() || 'Anonymous Citizen';
      const rawDescription = String(req.body?.description ?? '').trim();
      const city = String(req.body?.city ?? '').trim() || 'Bengaluru';
      const ward = String(req.body?.ward ?? '').trim() || 'Ward 12 - Indiranagar';
      const streetLandmark = String(req.body?.street_landmark ?? '').trim() || 'Reported via citizen submission';
      const preferredLanguage = String(req.body?.preferred_language ?? 'Auto-detect').trim() || 'Auto-detect';
      const rawUserCategory = String(req.body?.user_category ?? '').trim();
      const matchedUserCategory = CATEGORIES.find(
        (c) => c.toLowerCase() === rawUserCategory.toLowerCase()
      );

      const cleanupUploadedFile = () => {
        if (req.file?.path) {
          const resolved = path.resolve(req.file.path);
          if (resolved.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
          }
        }
      };

      if (!rawDescription && !req.file) {
        cleanupUploadedFile();
        res.status(400).json({ error: 'Please provide a complaint description, upload a photo, or both.' });
        return;
      }
      if (rawDescription && rawDescription.length < 5 && !req.file) {
        cleanupUploadedFile();
        res.status(400).json({ error: 'Please describe the problem in at least 5 characters or attach a photo.' });
        return;
      }

      try {
        const aiResult = await analyzeComplaintWithGemini({
          description: rawDescription,
          city,
          ward,
          street_landmark: streetLandmark,
          preferred_language: preferredLanguage,
          user_category: matchedUserCategory,
          imageFilePath: req.file?.path ?? null,
          imageMimeType: req.file?.mimetype ?? null,
        });

        const storedDescription = rawDescription || `[Photo Evidence] ${aiResult.summary}`;

        const existingCandidates = db
          .prepare(`
            SELECT id, ticket_id, category, ward, city, street_landmark, description,
                   translated_text, ai_summary, status, parent_incident_id
            FROM complaints
            WHERE status NOT IN ('Rejected', 'Resolved')
          `)
          .all() as Array<{
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
        }>;

        const suspectedMatches = detectSuspectedDuplicates(
          {
            category: aiResult.category,
            ward,
            city,
            street_landmark: streetLandmark,
            description: storedDescription,
            translated_text: aiResult.translated_text,
          },
          existingCandidates
        );

        const nowIso = new Date().toISOString();
        const ticketId = generateTicketId();
        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

        let parentIncidentId: number | null = null;
        let communityImpactCount = 1;
        let isSuspectedDuplicate = 0;

        if (suspectedMatches.length > 0) {
          isSuspectedDuplicate = 1;
          const topMatch = existingCandidates.find((c) => c.id === suspectedMatches[0].relatedComplaintId);
          if (topMatch) {
            parentIncidentId = topMatch.parent_incident_id ?? topMatch.id;
            const clusterRow = db
              .prepare(
                'SELECT COUNT(*) as cnt FROM complaints WHERE id = ? OR parent_incident_id = ?'
              )
              .get(parentIncidentId, parentIncidentId) as { cnt: number } | undefined;
            communityImpactCount = (clusterRow?.cnt ?? 1) + 1;
          }
        }

        const areaEval = evaluateCriticalArea(
          `${storedDescription} ${aiResult.translated_text}`,
          streetLandmark,
          aiResult.critical_area_type
        );

        const effectivePeopleAffected = Math.max(
          aiResult.estimated_people_affected,
          communityImpactCount * 20
        );

        const breakdown = calculateMultiFactorPriority({
          severity: aiResult.severity,
          criticalAreaScore: areaEval.score,
          criticalAreaLabel: areaEval.label,
          affectedPeopleCount: effectivePeopleAffected,
          communityImpactCount,
          createdAtIso: nowIso,
          status: 'Open',
        });

        const sector = getWardSector(ward);
        // Deterministic spread inside the ward's sector block on the 3D smart grid
        const jitterA = ((crypto.randomInt(0, 200) - 100) / 100) * 1.4;
        const jitterB = ((crypto.randomInt(0, 200) - 100) / 100) * 1.4;
        const gridX = Math.round((sector.gridX + jitterA) * 100) / 100;
        const gridZ = Math.round((sector.gridZ + jitterB) * 100) / 100;

        const insertResult = db
          .prepare(`
            INSERT INTO complaints (
              ticket_id, citizen_name, description, city, ward, street_landmark,
              image_path, image_analysis, preferred_language, category, severity,
              severity_reason, department, ai_summary, suggested_action,
              detected_language, translated_text, citizen_reply_localized, status,
              resolution_note, critical_area_type, critical_area_score,
              affected_people_count, priority_score, community_impact_count,
              is_suspected_duplicate, parent_incident_id, grid_x, grid_z,
              is_demo, created_at, updated_at, resolved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)
          `)
          .run(
            ticketId,
            citizenName,
            storedDescription,
            city,
            ward,
            streetLandmark,
            imagePath,
            aiResult.image_analysis,
            preferredLanguage,
            aiResult.category,
            aiResult.severity,
            aiResult.severity_reason,
            aiResult.department,
            aiResult.summary,
            aiResult.suggested_action,
            aiResult.detected_language,
            aiResult.translated_text,
            aiResult.citizen_reply_localized,
            areaEval.label,
            areaEval.score,
            effectivePeopleAffected,
            breakdown.total,
            communityImpactCount,
            isSuspectedDuplicate,
            parentIncidentId,
            gridX,
            gridZ,
            nowIso,
            nowIso
          );

        const complaintId = Number(insertResult.lastInsertRowid);

        if (parentIncidentId) {
          db.prepare(`
            UPDATE complaints
            SET community_impact_count = ?,
                affected_people_count = MAX(affected_people_count, ?),
                is_suspected_duplicate = CASE WHEN id = ? THEN is_suspected_duplicate ELSE 1 END
            WHERE id = ? OR parent_incident_id = ?
          `).run(communityImpactCount, effectivePeopleAffected, parentIncidentId, parentIncidentId, parentIncidentId);

          const insertDup = db.prepare(`
            INSERT OR IGNORE INTO duplicate_reports (
              complaint_id, related_complaint_id, similarity_score, similarity_reason, status, created_at
            ) VALUES (?, ?, ?, ?, 'suspected', ?)
          `);
          for (const match of suspectedMatches) {
            insertDup.run(
              complaintId,
              match.relatedComplaintId,
              match.similarityScore,
              match.reason,
              nowIso
            );
          }
        }

        db.prepare(`
          INSERT INTO complaint_updates (
            complaint_id, updated_by_officer_id, updated_by_name, old_status, new_status, note, created_at
          ) VALUES (?, NULL, ?, NULL, 'Open', ?, ?)
        `).run(
          complaintId,
          citizenName,
          `Submitted without login. AI detected ${aiResult.detected_language}, classified as ${aiResult.category} (${aiResult.severity}, Priority ${breakdown.total}/100) and routed to ${aiResult.department}.`,
          nowIso
        );

        const created = db
          .prepare('SELECT * FROM complaints WHERE id = ?')
          .get(complaintId) as unknown as ComplaintRow | undefined;

        if (!created) {
          throw new Error('Complaint was saved, but could not be retrieved. Please check ticket tracking.');
        }

        const enrichedCreated = enrichComplaint(created);

        broadcastLiveEvent({
          type: 'complaint_created',
          ticket_id: enrichedCreated.ticket_id,
          complaint_id: enrichedCreated.id,
          ward: enrichedCreated.ward,
          category: enrichedCreated.category,
          severity: enrichedCreated.severity,
          status: enrichedCreated.status,
          assigned_crew: enrichedCreated.assigned_crew ?? null,
          priority_score: enrichedCreated.priority_score,
          note: `New ${enrichedCreated.severity} ${enrichedCreated.category} ticket filed in ${enrichedCreated.ward}.`,
          timestamp: nowIso,
        });

        res.status(201).json({
          complaint: enrichedCreated,
          suspected_duplicates: suspectedMatches,
          community_impact_count: communityImpactCount,
        });
      } catch (err) {
        cleanupUploadedFile();
        const message = extractReadableAiError(err) || 'Unable to process complaint with Gemini AI right now.';
        const statusCode = message.includes('GEMINI_API_KEY') ? 503 : 502;
        res.status(statusCode).json({ error: message });
      }
    }
  );

  // ---------------- PUBLIC LIVE SMART GRID, STATS & TRACKING ----------------
  app.get('/api/public/stats', (_req: Request, res: Response) => {
    const totals = db
      .prepare(`
        SELECT
          COUNT(*) as total_complaints,
          SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved_complaints,
          SUM(CASE WHEN severity = 'CRITICAL' AND status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as active_critical,
          SUM(CASE WHEN is_suspected_duplicate = 1 AND status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as suspected_duplicates,
          COUNT(DISTINCT ward) as active_wards,
          SUM(affected_people_count) as total_people_impacted
        FROM complaints
      `)
      .get() as {
      total_complaints: number;
      resolved_complaints: number;
      active_critical: number;
      suspected_duplicates: number;
      active_wards: number;
      total_people_impacted: number;
    };

    const deptCount = (db.prepare('SELECT COUNT(*) as cnt FROM departments').get() as { cnt: number }).cnt;
    res.json({
      totalComplaints: totals.total_complaints ?? 0,
      resolvedComplaints: totals.resolved_complaints ?? 0,
      activeCritical: totals.active_critical ?? 0,
      suspectedDuplicates: totals.suspected_duplicates ?? 0,
      activeWards: totals.active_wards ?? 0,
      totalPeopleImpacted: totals.total_people_impacted ?? 0,
      departmentsCount: deptCount,
    });
  });

  app.get('/api/public/grid', (req: Request, res: Response) => {
    const includeDemo = req.query.includeDemo !== 'false';
    const demoWhere = includeDemo ? '' : 'WHERE is_demo = 0';
    const rows = db
      .prepare(`
        SELECT id, ticket_id, city, ward, street_landmark, category, severity,
               severity_reason, department, ai_summary, detected_language, status,
               assigned_crew, resolution_note, critical_area_type, critical_area_score,
               affected_people_count, priority_score, community_impact_count, is_suspected_duplicate,
               grid_x, grid_z, is_demo, created_at, updated_at, resolved_at
        FROM complaints
        ${demoWhere}
        ORDER BY priority_score DESC, created_at DESC
      `)
      .all() as unknown as ComplaintRow[];

    res.json({
      nodes: rows.map(enrichComplaint),
      sectors: WARD_SECTORS,
    });
  });

  app.get('/api/public/updates', (_req: Request, res: Response) => {
    const rows = db
      .prepare(`
        SELECT u.id, u.old_status, u.new_status, u.note, u.created_at,
               c.ticket_id, c.ward, c.category, c.severity, c.status, c.assigned_crew, c.priority_score
        FROM complaint_updates u
        JOIN complaints c ON c.id = u.complaint_id
        ORDER BY u.created_at DESC, u.id DESC
        LIMIT 12
      `)
      .all();
    res.json({ updates: rows });
  });

  app.get('/api/track/:ticketId', (req: Request, res: Response) => {
    const ticketId = String(req.params.ticketId ?? '').trim().toUpperCase();
    if (!ticketId) {
      res.status(400).json({ error: 'Ticket ID is required.' });
      return;
    }

    const complaint = db
      .prepare(`
        SELECT id, ticket_id, citizen_name, city, ward, street_landmark, category, severity,
               severity_reason, department, ai_summary, suggested_action,
               detected_language, translated_text, citizen_reply_localized, status,
               assigned_crew, resolution_note, critical_area_type, critical_area_score,
               affected_people_count, priority_score, community_impact_count,
               is_suspected_duplicate, grid_x, grid_z, is_demo, created_at, updated_at, resolved_at
        FROM complaints
        WHERE UPPER(ticket_id) = ?
      `)
      .get(ticketId) as unknown as ComplaintRow | undefined;

    if (!complaint) {
      res.status(404).json({ error: `No ticket found matching "${ticketId}".` });
      return;
    }

    const updates = db
      .prepare(`
        SELECT id, old_status, new_status, note, created_at
        FROM complaint_updates
        WHERE complaint_id = ?
        ORDER BY created_at ASC
      `)
      .all(complaint.id);

    res.json({
      ticket: enrichComplaint(complaint),
      timeline: updates,
    });
  });

  // ---------------- OFFICER PROTECTED ROUTES ----------------
  app.get('/api/departments', requireOfficer, (_req: Request, res: Response) => {
    const rows = db
      .prepare(`
        SELECT d.*,
          COUNT(c.id) as total_tickets,
          SUM(CASE WHEN c.status = 'Resolved' THEN 1 ELSE 0 END) as resolved_tickets,
          SUM(CASE WHEN c.status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as open_tickets,
          SUM(CASE WHEN c.severity = 'CRITICAL' AND c.status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as critical_open
        FROM departments d
        LEFT JOIN complaints c ON c.department = d.name
        GROUP BY d.id
        ORDER BY open_tickets DESC, d.name ASC
      `)
      .all();
    res.json({ departments: rows });
  });

  app.get('/api/complaints', requireOfficer, (req: AuthenticatedRequest, res: Response) => {
    const includeDemo = req.query.includeDemo !== 'false';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const severity = typeof req.query.severity === 'string' ? req.query.severity.trim().toUpperCase() : '';
    const department = typeof req.query.department === 'string' ? req.query.department.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const duplicatesOnly = req.query.duplicatesOnly === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const whereClauses: string[] = [];
    const params: Array<string | number> = [];

    if (!includeDemo) {
      whereClauses.push('is_demo = 0');
    }
    if (category && category !== 'ALL') {
      whereClauses.push('category = ?');
      params.push(category);
    }
    if (severity && severity !== 'ALL') {
      whereClauses.push('severity = ?');
      params.push(severity);
    }
    if (department && department !== 'ALL') {
      whereClauses.push('department = ?');
      params.push(department);
    }
    if (status && status !== 'ALL') {
      whereClauses.push('status = ?');
      params.push(status);
    }
    if (duplicatesOnly) {
      whereClauses.push('(is_suspected_duplicate = 1 OR community_impact_count > 1)');
    }
    if (search) {
      whereClauses.push(
        '(LOWER(ticket_id) LIKE ? OR LOWER(description) LIKE ? OR LOWER(ai_summary) LIKE ? OR LOWER(ward) LIKE ? OR LOWER(street_landmark) LIKE ?)'
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM complaints ${whereSql}`)
      .all(...params) as unknown as ComplaintRow[];

    // Live sort by Multi-Factor Priority Score descending (open tickets first, then resolved)
    const enriched = rows.map(enrichComplaint).sort((a, b) => {
      const aClosed = a.status === 'Resolved' || a.status === 'Rejected' ? 1 : 0;
      const bClosed = b.status === 'Resolved' || b.status === 'Rejected' ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });

    res.json({ complaints: enriched });
  });

  app.get('/api/complaints/:id', requireOfficer, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid complaint ID.' });
      return;
    }

    const complaint = db
      .prepare('SELECT * FROM complaints WHERE id = ?')
      .get(id) as unknown as ComplaintRow | undefined;

    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const updates = db
      .prepare(`
        SELECT id, updated_by_name, old_status, new_status, note, created_at
        FROM complaint_updates
        WHERE complaint_id = ?
        ORDER BY created_at ASC
      `)
      .all(id);

    const duplicates = db
      .prepare(`
        SELECT dr.*,
          CASE WHEN dr.complaint_id = ? THEN c2.ticket_id ELSE c1.ticket_id END as linked_ticket_id,
          CASE WHEN dr.complaint_id = ? THEN c2.ai_summary ELSE c1.ai_summary END as linked_summary,
          CASE WHEN dr.complaint_id = ? THEN c2.ward ELSE c1.ward END as linked_ward,
          CASE WHEN dr.complaint_id = ? THEN c2.status ELSE c1.status END as linked_status,
          CASE WHEN dr.complaint_id = ? THEN c2.created_at ELSE c1.created_at END as linked_created_at
        FROM duplicate_reports dr
        JOIN complaints c1 ON c1.id = dr.complaint_id
        JOIN complaints c2 ON c2.id = dr.related_complaint_id
        WHERE dr.complaint_id = ? OR dr.related_complaint_id = ?
        ORDER BY dr.similarity_score DESC
      `)
      .all(id, id, id, id, id, id, id);

    res.json({
      complaint: enrichComplaint(complaint),
      updates,
      duplicates,
    });
  });

  app.patch('/api/complaints/:id', requireOfficer, (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid complaint ID.' });
      return;
    }

    const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as unknown as ComplaintRow | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const hasAssignedCrewField = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'assigned_crew');
    const nextAssignedCrew = hasAssignedCrewField
      ? typeof req.body?.assigned_crew === 'string' && req.body.assigned_crew.trim()
        ? req.body.assigned_crew.trim().slice(0, 100)
        : null
      : existing.assigned_crew ?? null;

    let newStatus = (req.body?.status ? String(req.body.status).trim() : existing.status) as ComplaintStatus;
    if (!STATUSES.includes(newStatus)) {
      res.status(400).json({ error: 'Invalid complaint status.' });
      return;
    }

    // Auto-advance Open/Under Review -> Assigned when an officer assigns a crew without specifying status
    if (
      !req.body?.status &&
      nextAssignedCrew &&
      nextAssignedCrew !== existing.assigned_crew &&
      (existing.status === 'Open' || existing.status === 'Under Review')
    ) {
      newStatus = 'Assigned';
    }

    const resolutionNote =
      typeof req.body?.resolution_note === 'string'
        ? req.body.resolution_note.trim()
        : existing.resolution_note;

    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

    if (newStatus === 'Resolved' && (!resolutionNote || resolutionNote.length < 5)) {
      res.status(400).json({
        error: 'A resolution note (at least 5 characters) is required when marking a ticket Resolved.',
      });
      return;
    }

    const newSeverity = (
      req.body?.severity ? String(req.body.severity).trim().toUpperCase() : existing.severity
    ) as ComplaintSeverity;
    if (!SEVERITIES.includes(newSeverity)) {
      res.status(400).json({ error: 'Invalid severity level.' });
      return;
    }

    const newCategory = (
      req.body?.category ? String(req.body.category).trim() : existing.category
    ) as ComplaintCategory;
    if (!CATEGORIES.includes(newCategory)) {
      res.status(400).json({ error: 'Invalid category.' });
      return;
    }

    const newDepartment =
      typeof req.body?.department === 'string' && req.body.department.trim()
        ? req.body.department.trim()
        : req.body?.category
        ? DEPARTMENT_MAP[newCategory]
        : existing.department;

    const nowIso = new Date().toISOString();
    const resolvedAt =
      newStatus === 'Resolved'
        ? existing.resolved_at ?? nowIso
        : newStatus === 'Rejected'
        ? null
        : existing.resolved_at;

    const breakdown = calculateMultiFactorPriority({
      severity: newSeverity,
      criticalAreaScore: existing.critical_area_score,
      criticalAreaLabel: existing.critical_area_type,
      affectedPeopleCount: existing.affected_people_count,
      communityImpactCount: existing.community_impact_count,
      createdAtIso: existing.created_at,
      status: newStatus,
    });

    db.prepare(`
      UPDATE complaints
      SET status = ?, severity = ?, category = ?, department = ?, assigned_crew = ?,
          resolution_note = ?, priority_score = ?, updated_at = ?, resolved_at = ?
      WHERE id = ?
    `).run(
      newStatus,
      newSeverity,
      newCategory,
      newDepartment,
      nextAssignedCrew,
      resolutionNote || null,
      breakdown.total,
      nowIso,
      resolvedAt,
      id
    );

    const statusChanged = newStatus !== existing.status;
    const deptChanged = newDepartment !== existing.department;
    const crewChanged = nextAssignedCrew !== (existing.assigned_crew ?? null);
    const updateNote =
      note ||
      (newStatus === 'Resolved' && resolutionNote
        ? `${nextAssignedCrew ? `[${nextAssignedCrew}] ` : ''}Marked completed: ${resolutionNote}`
        : crewChanged && nextAssignedCrew
        ? `Assigned crew "${nextAssignedCrew}" (${newDepartment}) by ${req.officer!.name}.`
        : statusChanged
        ? `Status updated from ${existing.status} to ${newStatus} by ${req.officer!.name}.`
        : deptChanged
        ? `Reassigned to ${newDepartment}.`
        : 'Ticket updated by municipal officer.');

    db.prepare(`
      INSERT INTO complaint_updates (
        complaint_id, updated_by_officer_id, updated_by_name, old_status, new_status, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.officer!.id, req.officer!.name, existing.status, newStatus, updateNote, nowIso);

    const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id) as unknown as ComplaintRow;
    const enrichedUpdated = enrichComplaint(updated);

    broadcastLiveEvent({
      type:
        newStatus === 'Resolved'
          ? 'complaint_completed'
          : crewChanged && nextAssignedCrew
          ? 'crew_assigned'
          : 'status_updated',
      ticket_id: enrichedUpdated.ticket_id,
      complaint_id: enrichedUpdated.id,
      ward: enrichedUpdated.ward,
      category: enrichedUpdated.category,
      severity: enrichedUpdated.severity,
      status: enrichedUpdated.status,
      assigned_crew: enrichedUpdated.assigned_crew ?? null,
      priority_score: enrichedUpdated.priority_score,
      note: updateNote,
      timestamp: nowIso,
    });

    res.json({ complaint: enrichedUpdated });
  });

  app.post('/api/duplicates/:id/review', requireOfficer, (req: AuthenticatedRequest, res: Response) => {
    const dupId = Number(req.params.id);
    const decision = String(req.body?.decision ?? '').trim();
    if (!Number.isInteger(dupId) || dupId <= 0 || !['confirmed', 'dismissed'].includes(decision)) {
      res.status(400).json({ error: 'Valid duplicate ID and decision (confirmed or dismissed) are required.' });
      return;
    }

    const dupRow = db.prepare('SELECT * FROM duplicate_reports WHERE id = ?').get(dupId) as
      | { id: number; complaint_id: number; related_complaint_id: number; status: string }
      | undefined;

    if (!dupRow) {
      res.status(404).json({ error: 'Suspected duplicate link not found.' });
      return;
    }

    db.prepare('UPDATE duplicate_reports SET status = ?, reviewed_by_officer_id = ? WHERE id = ?').run(
      decision,
      req.officer!.id,
      dupId
    );

    const primary = db
      .prepare('SELECT id, parent_incident_id FROM complaints WHERE id = ?')
      .get(dupRow.related_complaint_id) as { id: number; parent_incident_id: number | null } | undefined;

    if (primary) {
      const rootId = primary.parent_incident_id ?? primary.id;
      if (decision === 'confirmed') {
        db.prepare('UPDATE complaints SET parent_incident_id = ?, is_suspected_duplicate = 1 WHERE id = ?').run(
          rootId,
          dupRow.complaint_id
        );
      } else if (decision === 'dismissed') {
        db.prepare(
          'UPDATE complaints SET parent_incident_id = NULL, is_suspected_duplicate = 0, community_impact_count = 1 WHERE id = ?'
        ).run(dupRow.complaint_id);
      }

      const countRow = db
        .prepare('SELECT COUNT(*) as cnt FROM complaints WHERE id = ? OR parent_incident_id = ?')
        .get(rootId, rootId) as { cnt: number };
      db.prepare('UPDATE complaints SET community_impact_count = ? WHERE id = ? OR parent_incident_id = ?').run(
        countRow.cnt,
        rootId,
        rootId
      );
    }

    res.json({ ok: true, status: decision });
  });

  // ---------------- ANALYTICS & OFFICER AI ASSISTANT ----------------
  app.get('/api/analytics/overview', requireOfficer, (req: Request, res: Response) => {
    const includeDemo = req.query.includeDemo !== 'false';
    const demoFilter = includeDemo ? '' : 'WHERE is_demo = 0';
    const demoAndFilter = includeDemo ? '' : 'AND is_demo = 0';

    const overview = db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN severity = 'CRITICAL' THEN 1 ELSE 0 END) as critical_total,
          SUM(CASE WHEN severity = 'CRITICAL' AND status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as critical_open,
          SUM(CASE WHEN severity = 'HIGH' THEN 1 ELSE 0 END) as high_total,
          SUM(CASE WHEN status IN ('Open', 'Under Review', 'Assigned') THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_count,
          SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved_count,
          SUM(CASE WHEN is_suspected_duplicate = 1 THEN 1 ELSE 0 END) as suspected_dup_count,
          SUM(affected_people_count) as total_people_affected,
          AVG(CASE WHEN status = 'Resolved' AND resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 24.0 END) as avg_resolution_hours
        FROM complaints
        ${demoFilter}
      `)
      .get() as {
      total: number;
      critical_total: number;
      critical_open: number;
      high_total: number;
      pending_count: number;
      in_progress_count: number;
      resolved_count: number;
      suspected_dup_count: number;
      total_people_affected: number;
      avg_resolution_hours: number | null;
    };

    const byCategory = db
      .prepare(`
        SELECT category as name, COUNT(*) as value,
          SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved
        FROM complaints
        ${demoFilter}
        GROUP BY category
        ORDER BY value DESC
      `)
      .all();

    const bySeverity = db
      .prepare(`
        SELECT severity as name, COUNT(*) as total,
          SUM(CASE WHEN status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as open,
          SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved
        FROM complaints
        ${demoFilter}
        GROUP BY severity
        ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END ASC
      `)
      .all();

    const byDepartment = db
      .prepare(`
        SELECT department as name, COUNT(*) as total,
          SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
          SUM(CASE WHEN status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as open,
          ROUND(AVG(CASE WHEN status = 'Resolved' AND resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(created_at)) * 24.0 END), 1) as avg_hours
        FROM complaints
        ${demoFilter}
        GROUP BY department
        ORDER BY total DESC
      `)
      .all();

    const overTime = db
      .prepare(`
        SELECT date(created_at) as date,
          COUNT(*) as submitted,
          SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved
        FROM complaints
        ${demoFilter}
        GROUP BY date(created_at)
        ORDER BY date(created_at) ASC
      `)
      .all();

    const byWard = db
      .prepare(`
        SELECT ward, COUNT(*) as total,
          SUM(CASE WHEN status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as open_count,
          SUM(CASE WHEN severity = 'CRITICAL' AND status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as critical_open,
          SUM(affected_people_count) as people_affected
        FROM complaints
        ${demoFilter}
        GROUP BY ward
        ORDER BY total DESC
      `)
      .all();

    const escalatedTickets = (
      db
        .prepare(`
          SELECT * FROM complaints
          WHERE status NOT IN ('Resolved', 'Rejected') ${demoAndFilter}
        `)
        .all() as unknown as ComplaintRow[]
    )
      .map(enrichComplaint)
      .filter((c) => c.is_escalated);

    const totalNum = overview.total || 0;
    const resolvedNum = overview.resolved_count || 0;

    res.json({
      stats: {
        total: totalNum,
        criticalTotal: overview.critical_total || 0,
        criticalOpen: overview.critical_open || 0,
        highTotal: overview.high_total || 0,
        pending: overview.pending_count || 0,
        inProgress: overview.in_progress_count || 0,
        resolved: resolvedNum,
        suspectedDuplicates: overview.suspected_dup_count || 0,
        totalPeopleAffected: overview.total_people_affected || 0,
        resolutionRate: totalNum > 0 ? Math.round((resolvedNum / totalNum) * 100) : 0,
        avgResolutionHours: overview.avg_resolution_hours
          ? Math.round(overview.avg_resolution_hours * 10) / 10
          : 0,
        escalatedCount: escalatedTickets.length,
      },
      byCategory,
      bySeverity,
      byDepartment,
      overTime,
      byWard,
      escalatedTickets,
    });
  });

  app.post('/api/ai/assistant', requireOfficer, async (req: Request, res: Response) => {
    const question = String(req.body?.question ?? '').trim();
    if (!question) {
      res.status(400).json({ error: 'Please enter a question for the Officer Assistant.' });
      return;
    }

    try {
      const topOpenRows = (
        db
          .prepare("SELECT * FROM complaints WHERE status NOT IN ('Resolved', 'Rejected')")
          .all() as unknown as ComplaintRow[]
      )
        .map(enrichComplaint)
        .sort((a, b) => b.priority_score - a.priority_score)
        .slice(0, 15)
        .map((c) => ({
          ticket_id: c.ticket_id,
          category: c.category,
          severity: c.severity,
          priority_score: c.priority_score,
          critical_area_type: c.critical_area_type,
          affected_people_count: c.affected_people_count,
          hours_affected: c.hours_affected,
          community_impact_count: c.community_impact_count,
          ward: c.ward,
          street_landmark: c.street_landmark,
          department: c.department,
          status: c.status,
          ai_summary: c.ai_summary,
        }));

      const byWard = db
        .prepare(`
          SELECT ward, COUNT(*) as total,
            SUM(CASE WHEN status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as open_count,
            SUM(affected_people_count) as people_affected
          FROM complaints
          GROUP BY ward
          ORDER BY open_count DESC
        `)
        .all();

      const byDepartment = db
        .prepare(`
          SELECT department, COUNT(*) as total,
            SUM(CASE WHEN status NOT IN ('Resolved', 'Rejected') THEN 1 ELSE 0 END) as open_count
          FROM complaints
          GROUP BY department
          ORDER BY open_count DESC
        `)
        .all();

      const answer = await askMunicipalAssistant({
        question,
        databaseSnapshot: {
          generated_at: new Date().toISOString(),
          by_ward: byWard,
          by_department: byDepartment,
          top_prioritized_open_tickets: topOpenRows,
        },
      });

      res.json({ answer });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Assistant request failed.';
      res.status(message.includes('GEMINI_API_KEY') ? 503 : 502).json({ error: message });
    }
  });

  app.post('/api/demo/reset', requireOfficer, (_req: AuthenticatedRequest, res: Response) => {
    seedDemoDataIfEmpty(true);
    broadcastLiveEvent({
      type: 'demo_reset',
      note: 'Sample demonstration tickets have been restored.',
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true, message: 'Sample demonstration tickets have been restored.' });
  });
}
