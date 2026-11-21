export const CATEGORIES = [
  'Roads',
  'Waste Management',
  'Water Supply',
  'Electricity',
  'Trees',
  'Drainage',
  'Public Safety',
  'Other',
] as const;

export type ComplaintCategory = (typeof CATEGORIES)[number];

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type ComplaintSeverity = (typeof SEVERITIES)[number];

export const STATUSES = [
  'Open',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Rejected',
] as const;

export type ComplaintStatus = (typeof STATUSES)[number];

export const DEPARTMENT_MAP: Record<ComplaintCategory, string> = {
  Roads: 'Public Works Department',
  'Waste Management': 'Solid Waste Management Department',
  'Water Supply': 'Water Supply Department',
  Electricity: 'Electrical Department',
  Trees: 'Horticulture / Tree Maintenance Department',
  Drainage: 'Drainage Department',
  'Public Safety': 'Emergency Response Department',
  Other: 'General Municipal Department',
};

export const SLA_HOURS: Record<ComplaintSeverity, number> = {
  CRITICAL: 12,
  HIGH: 36,
  MEDIUM: 72,
  LOW: 120,
};

export interface WardSector {
  ward: string;
  zoneLabel: string;
  gridX: number;
  gridZ: number;
  lat: number;
  lng: number;
  districtDensity: number;
}

// Deterministic 3D smart-grid city sector layout with Bengaluru ward coordinates
export const WARD_SECTORS: WardSector[] = [
  { ward: 'Ward 12 - Indiranagar', zoneLabel: 'East Central', gridX: 4, gridZ: -3, lat: 12.9784, lng: 77.6408, districtDensity: 1.4 },
  { ward: 'Ward 68 - Koramangala', zoneLabel: 'South East', gridX: 5, gridZ: 6, lat: 12.9352, lng: 77.6245, districtDensity: 1.3 },
  { ward: 'Ward 44 - Jayanagar', zoneLabel: 'South Central', gridX: -4, gridZ: 5, lat: 12.9308, lng: 77.5838, districtDensity: 1.2 },
  { ward: 'Ward 23 - Malleswaram', zoneLabel: 'North West', gridX: -6, gridZ: -6, lat: 13.0031, lng: 77.5643, districtDensity: 1.1 },
  { ward: 'Ward 85 - Whitefield', zoneLabel: 'Outer East', gridX: 11, gridZ: -1, lat: 12.9698, lng: 77.75, districtDensity: 1.5 },
  { ward: 'Ward 110 - Rajajinagar', zoneLabel: 'West', gridX: -10, gridZ: -1, lat: 12.9982, lng: 77.553, districtDensity: 1.1 },
  { ward: 'Ward 150 - Bellandur', zoneLabel: 'South Corridor', gridX: 10, gridZ: 9, lat: 12.926, lng: 77.6762, districtDensity: 1.35 },
  { ward: 'Ward 76 - Marathahalli', zoneLabel: 'East Junction', gridX: 9, gridZ: 3, lat: 12.9592, lng: 77.6974, districtDensity: 1.25 },
];

export function getWardSector(ward: string): WardSector {
  const normalized = ward.trim().toLowerCase();
  const exact = WARD_SECTORS.find((w) => w.ward.toLowerCase() === normalized);
  if (exact) return exact;
  // Deterministic hash placement inside grid & Bengaluru bounds for custom/new wards
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 997;
  }
  const gridX = ((hash % 9) - 4) * 2.5;
  const gridZ = (((Math.floor(hash / 9)) % 7) - 3) * 2.5;
  return {
    ward,
    zoneLabel: 'Municipal Sector',
    gridX,
    gridZ,
    lat: Math.round((12.9716 - gridZ * 0.0035) * 100000) / 100000,
    lng: Math.round((77.5946 + gridX * 0.0045) * 100000) / 100000,
    districtDensity: 1.1,
  };
}

export function computeComplaintCoordinates(
  ward: string,
  gridX: number,
  gridZ: number
): { lat: number; lng: number } {
  const sector = getWardSector(ward);
  const offsetLat = (gridZ - sector.gridZ) * -0.0028;
  const offsetLng = (gridX - sector.gridX) * 0.0028;
  return {
    lat: Math.round((sector.lat + offsetLat) * 100000) / 100000,
    lng: Math.round((sector.lng + offsetLng) * 100000) / 100000,
  };
}

export interface OfficerUser {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: 'officer';
  department: string;
  badge_id: string;
  is_demo: number;
  created_at: string;
}

export interface SafeOfficer {
  id: number;
  name: string;
  email: string;
  role: 'officer';
  department: string;
  badge_id: string;
  is_demo: number;
  created_at: string;
}

export interface GeminiAnalysisResult {
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  severity_reason: string;
  department: string;
  summary: string;
  suggested_action: string;
  detected_language: string;
  translated_text: string;
  image_analysis: string;
  critical_area_type: string;
  estimated_people_affected: number;
  citizen_reply_localized: string;
}

export interface PriorityBreakdown {
  severityScore: number;
  criticalAreaScore: number;
  peopleAffectedScore: number;
  hoursAffectedScore: number;
  total: number;
  criticalAreaLabel: string;
}

export const FIELD_CREWS: string[] = [
  'Electrical Rapid Response Unit A-1',
  'Electrical Feeder Crew B-2',
  'PWD Asphalt Patch Squad 1',
  'PWD Road Repair Team 2',
  'SWM Compactor Fleet 4',
  'Water Main Emergency Crew 1',
  'Drainage Jetting & Desilting Unit 3',
  'Horticulture Arborist Team 2',
  'Municipal Structural Safety Unit',
  'General Civic Maintenance Squad',
];

export interface ComplaintRow {
  id: number;
  ticket_id: string;
  citizen_name: string;
  description: string;
  city: string;
  ward: string;
  street_landmark: string;
  image_path: string | null;
  image_analysis: string | null;
  preferred_language: string;
  category: ComplaintCategory;
  severity: ComplaintSeverity;
  severity_reason: string;
  department: string;
  ai_summary: string;
  suggested_action: string;
  detected_language: string;
  translated_text: string;
  citizen_reply_localized: string;
  status: ComplaintStatus;
  assigned_crew: string | null;
  resolution_note: string | null;
  critical_area_type: string;
  critical_area_score: number;
  affected_people_count: number;
  priority_score: number;
  community_impact_count: number;
  is_suspected_duplicate: number;
  parent_incident_id: number | null;
  grid_x: number;
  grid_z: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}
