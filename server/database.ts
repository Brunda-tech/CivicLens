import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.ts';
import { calculateMultiFactorPriority, evaluateCriticalArea } from './services/duplicateService.ts';
import {
  DEPARTMENT_MAP,
  getWardSector,
  type ComplaintCategory,
  type ComplaintRow,
  type ComplaintSeverity,
  type ComplaintStatus,
  type OfficerUser,
  type SafeOfficer,
} from './types.ts';

const DB_PATH = path.resolve(process.cwd(), 'civiclens.db');
export const db = new DatabaseSync(DB_PATH);

export function toSafeOfficer(user: OfficerUser): SafeOfficer {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    badge_id: user.badge_id,
    is_demo: user.is_demo,
    created_at: user.created_at,
  };
}

export function initDatabase(): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'officer' CHECK (role IN ('officer')),
      department TEXT NOT NULL DEFAULT 'Central Municipal Command',
      badge_id TEXT NOT NULL DEFAULT 'CL-OFF-001',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category_key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      sla_hours INTEGER NOT NULL DEFAULT 48,
      contact_email TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL UNIQUE,
      citizen_name TEXT NOT NULL DEFAULT 'Anonymous Citizen',
      description TEXT NOT NULL,
      city TEXT NOT NULL,
      ward TEXT NOT NULL,
      street_landmark TEXT NOT NULL,
      image_path TEXT,
      image_analysis TEXT,
      preferred_language TEXT NOT NULL DEFAULT 'Auto-detect',
      category TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      severity_reason TEXT NOT NULL,
      department TEXT NOT NULL,
      ai_summary TEXT NOT NULL,
      suggested_action TEXT NOT NULL,
      detected_language TEXT NOT NULL DEFAULT 'English',
      translated_text TEXT NOT NULL,
      citizen_reply_localized TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Open', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected')),
      assigned_crew TEXT,
      resolution_note TEXT,
      critical_area_type TEXT NOT NULL DEFAULT 'Standard Municipal Zone',
      critical_area_score INTEGER NOT NULL DEFAULT 5,
      affected_people_count INTEGER NOT NULL DEFAULT 15,
      priority_score INTEGER NOT NULL DEFAULT 50,
      community_impact_count INTEGER NOT NULL DEFAULT 1,
      is_suspected_duplicate INTEGER NOT NULL DEFAULT 0,
      parent_incident_id INTEGER,
      grid_x REAL NOT NULL DEFAULT 0,
      grid_z REAL NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (parent_incident_id) REFERENCES complaints(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS complaint_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      updated_by_officer_id INTEGER,
      updated_by_name TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by_officer_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      related_complaint_id INTEGER NOT NULL,
      similarity_score REAL NOT NULL,
      similarity_reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'suspected' CHECK (status IN ('suspected', 'confirmed', 'dismissed')),
      reviewed_by_officer_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
      FOREIGN KEY (related_complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by_officer_id) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (complaint_id, related_complaint_id)
    );

    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_severity ON complaints(severity);
    CREATE INDEX IF NOT EXISTS idx_complaints_priority ON complaints(priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_complaints_ward ON complaints(ward);
  `);

  // Safe schema migration for pre-existing civiclens.db files
  const cols = db.prepare('PRAGMA table_info(complaints)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'assigned_crew')) {
    db.exec('ALTER TABLE complaints ADD COLUMN assigned_crew TEXT;');
    db.exec(`
      UPDATE complaints SET assigned_crew = CASE
        WHEN category = 'Electricity' THEN 'Electrical Rapid Response Unit A-1'
        WHEN category = 'Roads' THEN 'PWD Asphalt Patch Squad 1'
        WHEN category = 'Drainage' THEN 'Drainage Jetting & Desilting Unit 3'
        WHEN category = 'Waste Management' THEN 'SWM Compactor Fleet 4'
        WHEN category = 'Water Supply' THEN 'Water Main Emergency Crew 1'
        WHEN category = 'Trees' THEN 'Horticulture Arborist Team 2'
        WHEN category = 'Public Safety' THEN 'Municipal Structural Safety Unit'
        ELSE 'General Civic Maintenance Squad'
      END
      WHERE status IN ('Assigned', 'In Progress', 'Resolved') AND assigned_crew IS NULL;
    `);
  }

  seedDepartments();
  seedDemoDataIfEmpty();
}

function seedDepartments(): void {
  const deptRows: Array<{
    name: string;
    category_key: ComplaintCategory;
    description: string;
    sla_hours: number;
    contact_email: string;
  }> = [
    {
      name: DEPARTMENT_MAP.Roads,
      category_key: 'Roads',
      description: 'Potholes, carriageway resurfacing, footpaths, and traffic signage.',
      sla_hours: 48,
      contact_email: 'pwd@civiclens.municipal.gov',
    },
    {
      name: DEPARTMENT_MAP['Waste Management'],
      category_key: 'Waste Management',
      description: 'Garbage collection, overflowing bins, and illegal dumping remediation.',
      sla_hours: 24,
      contact_email: 'swm@civiclens.municipal.gov',
    },
    {
      name: DEPARTMENT_MAP['Water Supply'],
      category_key: 'Water Supply',
      description: 'Pipeline burst repair, contamination checks, and water distribution.',
      sla_hours: 24,
      contact_email: 'water@civiclens.municipal.gov',
    },
    {
      name: DEPARTMENT_MAP.Electricity,
      category_key: 'Electricity',
      description: 'Live wire isolation, transformer safety, and streetlight repair.',
      sla_hours: 12,
      contact_email: 'electrical@civiclens.municipal.gov',
    },
    {
      name: DEPARTMENT_MAP.Trees,
      category_key: 'Trees',
      description: 'Fallen tree clearance, dangerous branch pruning, and canopy care.',
      sla_hours: 24,
      contact_email: 'horticulture@civiclens.municipal.gov',
    },
    {
      name: DEPARTMENT_MAP.Drainage,
      category_key: 'Drainage',
      description: 'Open manhole covers, stormwater desilting, and flood mitigation.',
      sla_hours: 24,
      contact_email: 'drainage@civiclens.municipal.gov',
    },
    {
      name: DEPARTMENT_MAP['Public Safety'],
      category_key: 'Public Safety',
      description: 'Immediate life-safety hazards, structural collapse risk, and barricading.',
      sla_hours: 6,
      contact_email: 'emergency@civiclens.municipal.gov',
    },
    {
      name: DEPARTMENT_MAP.Other,
      category_key: 'Other',
      description: 'General civic grievances and cross-department requests.',
      sla_hours: 72,
      contact_email: 'general@civiclens.municipal.gov',
    },
  ];

  const insertDept = db.prepare(`
    INSERT OR IGNORE INTO departments (name, category_key, description, sla_hours, contact_email)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const dept of deptRows) {
    insertDept.run(dept.name, dept.category_key, dept.description, dept.sla_hours, dept.contact_email);
  }
}

function hoursAgoIso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3600000).toISOString();
}

export function seedDemoDataIfEmpty(forceResetDemo = false): void {
  const existingCountRow = db.prepare('SELECT COUNT(*) as cnt FROM complaints').get() as { cnt: number };
  if (existingCountRow.cnt > 0 && !forceResetDemo) {
    return;
  }

  if (forceResetDemo) {
    db.exec('DELETE FROM duplicate_reports WHERE complaint_id IN (SELECT id FROM complaints WHERE is_demo = 1) OR related_complaint_id IN (SELECT id FROM complaints WHERE is_demo = 1);');
    db.exec('DELETE FROM complaint_updates WHERE complaint_id IN (SELECT id FROM complaints WHERE is_demo = 1);');
    db.exec('DELETE FROM complaints WHERE is_demo = 1;');
  }

  const nowIso = new Date().toISOString();

  // Officer-only authentication account
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role, department, badge_id, is_demo, created_at)
    VALUES (?, ?, ?, 'officer', ?, ?, 1, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      department = excluded.department
  `).run(
    'Officer Vikram Rao',
    'officer@civiclens.demo',
    hashPassword('Officer@2026'),
    'Central Municipal Command',
    'CL-OFF-101',
    nowIso
  );

  const officer = db.prepare('SELECT id FROM users WHERE email = ?').get('officer@civiclens.demo') as { id: number };

  interface SeedSample {
    ticket_id: string;
    citizen_name: string;
    description: string;
    city: string;
    ward: string;
    street_landmark: string;
    preferred_language: string;
    category: ComplaintCategory;
    severity: ComplaintSeverity;
    severity_reason: string;
    ai_summary: string;
    suggested_action: string;
    detected_language: string;
    translated_text: string;
    citizen_reply_localized: string;
    status: ComplaintStatus;
    assigned_crew?: string | null;
    resolution_note: string | null;
    affected_people_count: number;
    community_impact_count: number;
    is_suspected_duplicate: number;
    hours_ago: number;
    resolved_hours_ago?: number;
    offsetX: number;
    offsetZ: number;
  }

  const samples: SeedSample[] = [
    {
      ticket_id: 'CL-2026-1001',
      citizen_name: 'Anonymous Citizen',
      description: 'Live overhead power cable snapped and sparking right outside St. Paul High School gate.',
      city: 'Bengaluru',
      ward: 'Ward 12 - Indiranagar',
      street_landmark: '100 Feet Road, St. Paul High School Gate',
      preferred_language: 'English',
      category: 'Electricity',
      severity: 'CRITICAL',
      severity_reason: 'Sparking live wire directly outside a school gate poses immediate electrocution danger.',
      ai_summary: 'Live sparking electrical cable down outside St. Paul High School gate.',
      suggested_action: 'Isolate feeder power immediately, dispatch emergency electrical unit, and barricade gate.',
      detected_language: 'English',
      translated_text: 'Live overhead power cable snapped and sparking right outside St. Paul High School gate.',
      citizen_reply_localized: 'Your emergency report has been classified as CRITICAL and routed immediately to the Electrical Department.',
      status: 'Assigned',
      resolution_note: null,
      affected_people_count: 320,
      community_impact_count: 1,
      is_suspected_duplicate: 0,
      hours_ago: 18,
      offsetX: -0.9,
      offsetZ: -0.7,
    },
    {
      ticket_id: 'CL-2026-1002',
      citizen_name: 'Ananya S.',
      description: 'Huge waterlogged pothole near St. Xavier College entrance causing two-wheelers to skid daily.',
      city: 'Bengaluru',
      ward: 'Ward 12 - Indiranagar',
      street_landmark: '12th Main, St. Xavier College Entrance',
      preferred_language: 'English',
      category: 'Roads',
      severity: 'HIGH',
      severity_reason: 'Deep pothole at a busy college entrance causes repeated commuter falls.',
      ai_summary: 'Large waterlogged pothole outside St. Xavier College entrance causing two-wheeler skids.',
      suggested_action: 'Deploy cold-mix asphalt patching team and install hazard cones before peak hours.',
      detected_language: 'English',
      translated_text: 'Huge waterlogged pothole near St. Xavier College entrance causing two-wheelers to skid daily.',
      citizen_reply_localized: 'Your road hazard report has been prioritized as HIGH and routed to the Public Works Department.',
      status: 'In Progress',
      resolution_note: null,
      affected_people_count: 240,
      community_impact_count: 3,
      is_suspected_duplicate: 0,
      hours_ago: 36,
      offsetX: 0.9,
      offsetZ: 0.5,
    },
    {
      ticket_id: 'CL-2026-1003',
      citizen_name: 'Anonymous Citizen',
      description: 'St. Xavier College main gate road has a deep crater filled with rainwater, dangerous at night.',
      city: 'Bengaluru',
      ward: 'Ward 12 - Indiranagar',
      street_landmark: '12th Main, St. Xavier College Gate',
      preferred_language: 'English',
      category: 'Roads',
      severity: 'HIGH',
      severity_reason: 'Unlit rainwater-filled road crater near college gate increases nighttime collision risk.',
      ai_summary: 'Deep unlit road crater outside St. Xavier College main gate.',
      suggested_action: 'Link to active 12th Main road repair crew and add reflective barricades.',
      detected_language: 'English',
      translated_text: 'St. Xavier College main gate road has a deep crater filled with rainwater, dangerous at night.',
      citizen_reply_localized: 'Your report has been linked to an active Public Works cluster for St. Xavier College Gate.',
      status: 'Open',
      resolution_note: null,
      affected_people_count: 240,
      community_impact_count: 3,
      is_suspected_duplicate: 1,
      hours_ago: 22,
      offsetX: 1.2,
      offsetZ: 0.8,
    },
    {
      ticket_id: 'CL-2026-1004',
      citizen_name: 'Rohan M.',
      description: 'सेंट जेवियर कॉलेज के गेट के पास सड़क पर बड़ा गड्ढा है, रात में दिखाई नहीं देता।',
      city: 'Bengaluru',
      ward: 'Ward 12 - Indiranagar',
      street_landmark: 'St. Xavier College Entrance, 12th Main',
      preferred_language: 'Hindi',
      category: 'Roads',
      severity: 'HIGH',
      severity_reason: 'Poorly visible pothole outside college entrance creates high nighttime safety hazard.',
      ai_summary: 'Large unlit pothole outside St. Xavier College entrance reported in Hindi.',
      suggested_action: 'Consolidate with existing St. Xavier College road work order.',
      detected_language: 'Hindi',
      translated_text: 'There is a large pothole on the road near St. Xavier College gate and it is not visible at night.',
      citizen_reply_localized: 'आपकी शिकायत समझ ली गई है और उच्च प्राथमिकता के साथ लोक निर्माण विभाग को भेज दी गई है।',
      status: 'Open',
      resolution_note: null,
      affected_people_count: 240,
      community_impact_count: 3,
      is_suspected_duplicate: 1,
      hours_ago: 12,
      offsetX: 1.4,
      offsetZ: 0.3,
    },
    {
      ticket_id: 'CL-2026-1005',
      citizen_name: 'Anonymous Citizen',
      description: 'Open stormwater manhole without cover right next to Koramangala 4th Block Bus Stop and clinic.',
      city: 'Bengaluru',
      ward: 'Ward 68 - Koramangala',
      street_landmark: '80 Feet Road, 4th Block Bus Stop & Clinic',
      preferred_language: 'English',
      category: 'Drainage',
      severity: 'CRITICAL',
      severity_reason: 'Uncovered manhole beside a busy bus stop and medical clinic poses severe fall risk.',
      ai_summary: 'Open uncovered manhole at Koramangala 4th Block Bus Stop.',
      suggested_action: 'Erect immediate perimeter barricades and install reinforced manhole slab.',
      detected_language: 'English',
      translated_text: 'Open stormwater manhole without cover right next to Koramangala 4th Block Bus Stop and clinic.',
      citizen_reply_localized: 'Your urgent drainage hazard report has been marked CRITICAL and dispatched to the Drainage Department.',
      status: 'In Progress',
      resolution_note: null,
      affected_people_count: 280,
      community_impact_count: 2,
      is_suspected_duplicate: 0,
      hours_ago: 28,
      offsetX: -0.6,
      offsetZ: 0.4,
    },
    {
      ticket_id: 'CL-2026-1006',
      citizen_name: 'Deepa K.',
      description: 'ಕಸದ ತೊಟ್ಟಿ ತುಂಬಿ ರಸ್ತೆಗೆ ಬಿದ್ದಿದೆ, ಮೂರು ದಿನಗಳಿಂದ ಸ್ವಚ್ಛಗೊಳಿಸಿಲ್ಲ.',
      city: 'Bengaluru',
      ward: 'Ward 44 - Jayanagar',
      street_landmark: '4th T Block Market Corner',
      preferred_language: 'Kannada',
      category: 'Waste Management',
      severity: 'MEDIUM',
      severity_reason: 'Three-day uncollected garbage overflow in a public market creates sanitation hazard.',
      ai_summary: 'Overflowing market garbage bin uncollected for three days in Jayanagar.',
      suggested_action: 'Dispatch compactor truck and sanitize market corner.',
      detected_language: 'Kannada',
      translated_text: 'The garbage bin is overflowing onto the street and has not been cleaned for three days.',
      citizen_reply_localized: 'ನಿಮ್ಮ ದೂರನ್ನು ಸ್ವೀಕರಿಸಲಾಗಿದೆ ಮತ್ತು ಘನ ತ್ಯಾಜ್ಯ ನಿರ್ವಹಣಾ ವಿಭಾಗಕ್ಕೆ ಕಳುಹಿಸಲಾಗಿದೆ.',
      status: 'Assigned',
      resolution_note: null,
      affected_people_count: 95,
      community_impact_count: 1,
      is_suspected_duplicate: 0,
      hours_ago: 48,
      offsetX: 0.3,
      offsetZ: -0.5,
    },
    {
      ticket_id: 'CL-2026-1007',
      citizen_name: 'Anonymous Citizen',
      description: 'Major drinking water pipe burst flooding 6th Cross and disrupting supply to 80 homes.',
      city: 'Bengaluru',
      ward: 'Ward 68 - Koramangala',
      street_landmark: '6th Cross, Near Sony World Junction',
      preferred_language: 'English',
      category: 'Water Supply',
      severity: 'HIGH',
      severity_reason: 'Active trunk water pipe rupture causes water loss and residential supply outage.',
      ai_summary: 'Burst underground drinking water main flooding 6th Cross.',
      suggested_action: 'Isolate zone valve and dispatch emergency pipeline clamp repair crew.',
      detected_language: 'English',
      translated_text: 'Major drinking water pipe burst flooding 6th Cross and disrupting supply to 80 homes.',
      citizen_reply_localized: 'Your water supply ticket has been logged and assigned to the Water Supply Department.',
      status: 'Resolved',
      resolution_note: 'Valve isolated and 150mm PVC collar replaced; supply restored to all households.',
      affected_people_count: 160,
      community_impact_count: 1,
      is_suspected_duplicate: 0,
      hours_ago: 64,
      resolved_hours_ago: 10,
      offsetX: 0.9,
      offsetZ: -0.7,
    },
    {
      ticket_id: 'CL-2026-1008',
      citizen_name: 'Anonymous Citizen',
      description: 'Cracked neem tree limb leaning over overhead electric wires near Malleswaram Primary School.',
      city: 'Bengaluru',
      ward: 'Ward 23 - Malleswaram',
      street_landmark: '5th Main, Near Malleswaram Primary School',
      preferred_language: 'English',
      category: 'Trees',
      severity: 'HIGH',
      severity_reason: 'Fractured heavy branch suspended over live wires beside a primary school.',
      ai_summary: 'Cracked tree branch leaning on electric lines near Malleswaram Primary School.',
      suggested_action: 'Coordinate power isolation with Electrical Dept and prune split limb safely.',
      detected_language: 'English',
      translated_text: 'Cracked neem tree limb leaning over overhead electric wires near Malleswaram Primary School.',
      citizen_reply_localized: 'Your tree hazard report near the school has been routed to Horticulture & Tree Maintenance.',
      status: 'Under Review',
      resolution_note: null,
      affected_people_count: 140,
      community_impact_count: 1,
      is_suspected_duplicate: 0,
      hours_ago: 19,
      offsetX: 0.4,
      offsetZ: 0.6,
    },
    {
      ticket_id: 'CL-2026-1009',
      citizen_name: 'Suresh B.',
      description: 'వీధి దీపాలు గత ఐదు రోజులుగా వెలగడం లేదు, రాత్రి సమయంలో చీకటిగా ఉంది.',
      city: 'Bengaluru',
      ward: 'Ward 85 - Whitefield',
      street_landmark: 'ITPL Main Road, Brookefield Cross',
      preferred_language: 'Telugu',
      category: 'Electricity',
      severity: 'MEDIUM',
      severity_reason: 'Five-day streetlight outage creates dark pedestrian crossings at night.',
      ai_summary: 'Streetlights non-functional for five days along ITPL Main Road.',
      suggested_action: 'Inspect feeder box timer switch and replace burnt LED fixtures.',
      detected_language: 'Telugu',
      translated_text: 'Streetlights have not been working for the past five days, making the road dark at night.',
      citizen_reply_localized: 'మీ ఫిర్యాదు అర్థమైంది మరియు విద్యుత్ శాఖకు పంపబడింది.',
      status: 'Resolved',
      resolution_note: 'Replaced burnt contactor relay in Feeder Box W-14; all 18 streetlamps operational.',
      affected_people_count: 110,
      community_impact_count: 1,
      is_suspected_duplicate: 0,
      hours_ago: 70,
      resolved_hours_ago: 16,
      offsetX: -0.7,
      offsetZ: 0.6,
    },
    {
      ticket_id: 'CL-2026-1010',
      citizen_name: 'Karthik V.',
      description: 'நகராட்சி பூங்காவில் உள்ள பெஞ்சுகள் உடைந்துள்ளன மற்றும் நடைபாதை ஓடுகள் தளர்ந்துள்ளன.',
      city: 'Bengaluru',
      ward: 'Ward 44 - Jayanagar',
      street_landmark: 'Madhavan Park Walkway',
      preferred_language: 'Tamil',
      category: 'Other',
      severity: 'LOW',
      severity_reason: 'Minor park bench wear and loose walkway tiles require routine maintenance.',
      ai_summary: 'Broken park benches and loose walkway tiles at Madhavan Park.',
      suggested_action: 'Schedule carpentry and masonry team during weekly park maintenance.',
      detected_language: 'Tamil',
      translated_text: 'Benches in the municipal park are broken and the walkway tiles are loose.',
      citizen_reply_localized: 'உங்கள் புகார் பதிவு செய்யப்பட்டு பொது நகராட்சி துறைக்கு அனுப்பப்பட்டுள்ளது.',
      status: 'Open',
      resolution_note: null,
      affected_people_count: 20,
      community_impact_count: 1,
      is_suspected_duplicate: 0,
      hours_ago: 24,
      offsetX: -0.8,
      offsetZ: 0.7,
    },
    {
      ticket_id: 'CL-2026-1011',
      citizen_name: 'Anonymous Citizen',
      description: 'Stagnant sewage-mixed rainwater overflowing outside Whitefield Primary Health Hospital.',
      city: 'Bengaluru',
      ward: 'Ward 85 - Whitefield',
      street_landmark: 'Varthur Main Road, Primary Health Hospital',
      preferred_language: 'English',
      category: 'Drainage',
      severity: 'CRITICAL',
      severity_reason: 'Contaminated water flooding directly outside a medical hospital poses acute public health risk.',
      ai_summary: 'Blocked storm drain causing sewage-mixed flooding outside Whitefield Hospital.',
      suggested_action: 'Dispatch jetting suction tanker immediately and sanitize hospital approach.',
      detected_language: 'English',
      translated_text: 'Stagnant sewage-mixed rainwater overflowing outside Whitefield Primary Health Hospital.',
      citizen_reply_localized: 'Your hospital-zone drainage emergency has been marked CRITICAL and routed to the Drainage Department.',
      status: 'Open',
      resolution_note: null,
      affected_people_count: 350,
      community_impact_count: 2,
      is_suspected_duplicate: 0,
      hours_ago: 42,
      offsetX: 0.8,
      offsetZ: -0.6,
    },
    {
      ticket_id: 'CL-2026-1012',
      citizen_name: 'Anonymous Citizen',
      description: 'Concrete chunks falling from retaining wall inside Bellandur Outer Ring Road pedestrian subway.',
      city: 'Bengaluru',
      ward: 'Ward 150 - Bellandur',
      street_landmark: 'Outer Ring Road Pedestrian Subway, EcoSpace',
      preferred_language: 'English',
      category: 'Public Safety',
      severity: 'CRITICAL',
      severity_reason: 'Falling structural concrete in an active commuter subway poses immediate life safety danger.',
      ai_summary: 'Spalling concrete falling inside Bellandur ORR pedestrian subway.',
      suggested_action: 'Close affected subway staircase, erect safety shoring, and inspect structure.',
      detected_language: 'English',
      translated_text: 'Concrete chunks falling from retaining wall inside Bellandur Outer Ring Road pedestrian subway.',
      citizen_reply_localized: 'Your structural safety emergency has been flagged CRITICAL and routed to Emergency Response.',
      status: 'Assigned',
      resolution_note: null,
      affected_people_count: 420,
      community_impact_count: 1,
      is_suspected_duplicate: 0,
      hours_ago: 16,
      offsetX: -0.4,
      offsetZ: -0.5,
    },
  ];

  const insertComplaint = db.prepare(`
    INSERT INTO complaints (
      ticket_id, citizen_name, description, city, ward, street_landmark,
      image_path, image_analysis, preferred_language, category, severity,
      severity_reason, department, ai_summary, suggested_action,
      detected_language, translated_text, citizen_reply_localized, status,
      assigned_crew, resolution_note, critical_area_type, critical_area_score,
      affected_people_count, priority_score, community_impact_count,
      is_suspected_duplicate, parent_incident_id, grid_x, grid_z,
      is_demo, created_at, updated_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?)
  `);

  const insertUpdate = db.prepare(`
    INSERT INTO complaint_updates (complaint_id, updated_by_officer_id, updated_by_name, old_status, new_status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const idByTicket = new Map<string, number>();

  const defaultCrewFor = (cat: ComplaintCategory): string => {
    switch (cat) {
      case 'Electricity':
        return 'Electrical Rapid Response Unit A-1';
      case 'Roads':
        return 'PWD Asphalt Patch Squad 1';
      case 'Drainage':
        return 'Drainage Jetting & Desilting Unit 3';
      case 'Waste Management':
        return 'SWM Compactor Fleet 4';
      case 'Water Supply':
        return 'Water Main Emergency Crew 1';
      case 'Trees':
        return 'Horticulture Arborist Team 2';
      case 'Public Safety':
        return 'Municipal Structural Safety Unit';
      default:
        return 'General Civic Maintenance Squad';
    }
  };

  for (const s of samples) {
    const createdAt = hoursAgoIso(s.hours_ago);
    const resolvedAt = s.resolved_hours_ago ? hoursAgoIso(s.resolved_hours_ago) : null;
    const updatedAt = resolvedAt ?? hoursAgoIso(Math.max(1, Math.floor(s.hours_ago / 2)));
    const department = DEPARTMENT_MAP[s.category];
    const assignedCrew =
      s.assigned_crew !== undefined
        ? s.assigned_crew
        : ['Assigned', 'In Progress', 'Resolved'].includes(s.status)
        ? defaultCrewFor(s.category)
        : null;
    const areaEval = evaluateCriticalArea(s.description, s.street_landmark);
    const breakdown = calculateMultiFactorPriority({
      severity: s.severity,
      criticalAreaScore: areaEval.score,
      criticalAreaLabel: areaEval.label,
      affectedPeopleCount: s.affected_people_count,
      communityImpactCount: s.community_impact_count,
      createdAtIso: createdAt,
      status: s.status,
    });
    const sector = getWardSector(s.ward);
    const gridX = Math.round((sector.gridX + s.offsetX) * 100) / 100;
    const gridZ = Math.round((sector.gridZ + s.offsetZ) * 100) / 100;

    const res = insertComplaint.run(
      s.ticket_id,
      s.citizen_name,
      s.description,
      s.city,
      s.ward,
      s.street_landmark,
      s.preferred_language,
      s.category,
      s.severity,
      s.severity_reason,
      department,
      s.ai_summary,
      s.suggested_action,
      s.detected_language,
      s.translated_text,
      s.citizen_reply_localized,
      s.status,
      assignedCrew,
      s.resolution_note,
      areaEval.label,
      areaEval.score,
      s.affected_people_count,
      breakdown.total,
      s.community_impact_count,
      s.is_suspected_duplicate,
      gridX,
      gridZ,
      createdAt,
      updatedAt,
      resolvedAt
    );

    const complaintId = Number(res.lastInsertRowid);
    idByTicket.set(s.ticket_id, complaintId);

    insertUpdate.run(
      complaintId,
      null,
      s.citizen_name,
      null,
      'Open',
      `AI triaged as ${s.category} (${s.severity}, Priority ${breakdown.total}/100) and routed to ${department}.`,
      createdAt
    );

    if (s.status !== 'Open') {
      insertUpdate.run(
        complaintId,
        officer.id,
        'Officer Vikram Rao',
        'Open',
        s.status,
        s.resolution_note || `Ticket moved to ${s.status} by ${department}.`,
        updatedAt
      );
    }
  }

  // Link suspected duplicate cluster at St. Xavier College Gate (1002 -> 1003, 1004)
  const id1002 = idByTicket.get('CL-2026-1002');
  const id1003 = idByTicket.get('CL-2026-1003');
  const id1004 = idByTicket.get('CL-2026-1004');
  if (id1002 && id1003 && id1004) {
    db.prepare('UPDATE complaints SET parent_incident_id = ? WHERE id IN (?, ?)').run(id1002, id1003, id1004);
    const insertDup = db.prepare(`
      INSERT OR IGNORE INTO duplicate_reports (complaint_id, related_complaint_id, similarity_score, similarity_reason, status, reviewed_by_officer_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertDup.run(
      id1003,
      id1002,
      0.91,
      'Same location (Ward 12 - Indiranagar) · Same issue category (Roads) · Matching street or landmark',
      'confirmed',
      officer.id,
      hoursAgoIso(20)
    );
    insertDup.run(
      id1004,
      id1002,
      0.86,
      'Same location (Ward 12 - Indiranagar) · Same issue category (Roads) · Cross-lingual duplicate match',
      'suspected',
      null,
      hoursAgoIso(12)
    );
  }
}

export function getSampleRowsCount(): number {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM complaints').get() as unknown as ComplaintRow;
  return Number(row?.id ?? 0);
}
