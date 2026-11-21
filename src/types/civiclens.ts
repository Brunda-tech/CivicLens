export type ComplaintCategory =
  | 'Roads'
  | 'Waste Management'
  | 'Water Supply'
  | 'Electricity'
  | 'Trees'
  | 'Drainage'
  | 'Public Safety'
  | 'Other';

export type ComplaintSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ComplaintStatus =
  | 'Open'
  | 'Under Review'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Rejected';

export const CATEGORIES: ComplaintCategory[] = [
  'Roads',
  'Waste Management',
  'Water Supply',
  'Electricity',
  'Trees',
  'Drainage',
  'Public Safety',
  'Other',
];

export const SEVERITIES: ComplaintSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const STATUSES: ComplaintStatus[] = [
  'Open',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Rejected',
];

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

export const BENGALURU_WARDS = [
  'Ward 12 - Indiranagar',
  'Ward 68 - Koramangala',
  'Ward 44 - Jayanagar',
  'Ward 23 - Malleswaram',
  'Ward 85 - Whitefield',
  'Ward 110 - Rajajinagar',
  'Ward 150 - Bellandur',
  'Ward 76 - Marathahalli',
];

export interface WardSector {
  ward: string;
  zoneLabel: string;
  gridX: number;
  gridZ: number;
  lat?: number;
  lng?: number;
  districtDensity: number;
}

export const SAMPLE_MULTILINGUAL_PROMPTS: Array<{
  language: string;
  label: string;
  text: string;
  ward: string;
  landmark: string;
}> = [
  {
    language: 'English',
    label: 'English — School Live Wire',
    text: 'A snapped electrical wire is sparking on the sidewalk right outside the school crossing gate.',
    ward: 'Ward 12 - Indiranagar',
    landmark: '100 Feet Road, St. Paul High School Gate',
  },
  {
    language: 'Hindi',
    label: 'हिन्दी — College Gate Pothole (Duplicate)',
    text: 'सेंट जेवियर कॉलेज के मुख्य द्वार के पास सड़क पर बड़ा गड्ढा है और रात में दिखाई नहीं देता।',
    ward: 'Ward 12 - Indiranagar',
    landmark: '12th Main, St. Xavier College Entrance',
  },
  {
    language: 'Kannada',
    label: 'ಕನ್ನಡ — Hospital Water Leak',
    text: 'ಆಸ್ಪತ್ರೆ ಮುಂಭಾಗದಲ್ಲಿ ಕುಡಿಯುವ ನೀರಿನ ಪೈಪ್ ಒಡೆದು ರಸ್ತೆಯ ತುಂಬಾ ನೀರು ಹರಿಯುತ್ತಿದೆ.',
    ward: 'Ward 85 - Whitefield',
    landmark: 'Varthur Main Road, Primary Health Hospital',
  },
  {
    language: 'Telugu',
    label: 'తెలుగు — Streetlight Outage',
    text: 'మార్కెట్ కూడలి వద్ద వీధి దీపాలు వెలగడం లేదు, రాత్రి సమయంలో చీకటిగా ప్రమాదకరంగా ఉంది.',
    ward: 'Ward 68 - Koramangala',
    landmark: '80 Feet Road, 4th Block Bus Stop',
  },
  {
    language: 'Tamil',
    label: 'தமிழ் — Blocked Drain',
    text: 'பள்ளி அருகே மழைநீர் வடிகால் அடைத்து கழிவுநீர் தேங்கி நிற்கிறது.',
    ward: 'Ward 44 - Jayanagar',
    landmark: '4th T Block Market Corner',
  },
  {
    language: 'Spanish',
    label: 'Español — Fallen Tree',
    text: 'Un árbol grande cayó sobre los cables eléctricos frente al hospital esta noche.',
    ward: 'Ward 23 - Malleswaram',
    landmark: '5th Main, Near Malleswaram Hospital',
  },
];

export interface OfficerUser {
  id: number;
  name: string;
  email: string;
  role: 'officer';
  department: string;
  badge_id: string;
  is_demo: number;
  created_at: string;
}

export interface PriorityBreakdown {
  severityScore: number;
  criticalAreaScore: number;
  peopleAffectedScore: number;
  hoursAffectedScore: number;
  total: number;
  criticalAreaLabel: string;
}

export interface Complaint {
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
  assigned_crew?: string | null;
  resolution_note: string | null;
  critical_area_type: string;
  critical_area_score: number;
  affected_people_count: number;
  priority_score: number;
  priority_breakdown?: PriorityBreakdown;
  community_impact_count: number;
  is_suspected_duplicate: number;
  parent_incident_id: number | null;
  grid_x: number;
  grid_z: number;
  lat?: number;
  lng?: number;
  is_demo: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  hours_affected?: number;
  sla_hours?: number;
  is_escalated?: boolean;
}

export interface ComplaintUpdate {
  id: number;
  updated_by_name?: string;
  old_status: string | null;
  new_status: string;
  note: string;
  created_at: string;
}

export interface PublicLiveUpdate {
  id: number;
  old_status: string | null;
  new_status: string;
  note: string;
  created_at: string;
  ticket_id: string;
  ward: string;
  category: string;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  assigned_crew: string | null;
  priority_score: number;
}

export interface LiveCivicEvent {
  type: 'connected' | 'complaint_created' | 'crew_assigned' | 'status_updated' | 'complaint_completed' | 'demo_reset';
  ticket_id?: string;
  complaint_id?: number;
  ward?: string;
  category?: string;
  severity?: string;
  status?: string;
  assigned_crew?: string | null;
  priority_score?: number;
  note?: string;
  timestamp: string;
}

export interface DuplicateLink {
  id: number;
  complaint_id: number;
  related_complaint_id: number;
  similarity_score: number;
  similarity_reason: string;
  status: 'suspected' | 'confirmed' | 'dismissed';
  linked_ticket_id: string;
  linked_summary: string;
  linked_ward: string;
  linked_status: string;
  linked_created_at: string;
}

export interface PublicStats {
  totalComplaints: number;
  resolvedComplaints: number;
  activeCritical: number;
  suspectedDuplicates: number;
  activeWards: number;
  totalPeopleImpacted: number;
  departmentsCount: number;
}

export interface AnalyticsOverview {
  stats: {
    total: number;
    criticalTotal: number;
    criticalOpen: number;
    highTotal: number;
    pending: number;
    inProgress: number;
    resolved: number;
    suspectedDuplicates: number;
    totalPeopleAffected: number;
    resolutionRate: number;
    avgResolutionHours: number;
    escalatedCount: number;
  };
  byCategory: Array<{ name: string; value: number; resolved: number }>;
  bySeverity: Array<{ name: string; total: number; open: number; resolved: number }>;
  byDepartment: Array<{ name: string; total: number; resolved: number; open: number; avg_hours: number | null }>;
  overTime: Array<{ date: string; submitted: number; resolved: number }>;
  byWard: Array<{ ward: string; total: number; open_count: number; critical_open: number; people_affected: number }>;
  escalatedTickets: Complaint[];
}

export interface DepartmentStat {
  id: number;
  name: string;
  category_key: string;
  description: string;
  sla_hours: number;
  contact_email: string;
  total_tickets: number;
  resolved_tickets: number;
  open_tickets: number;
  critical_open: number;
}
