import type {
  AnalyticsOverview,
  Complaint,
  ComplaintUpdate,
  DepartmentStat,
  DuplicateLink,
  LiveCivicEvent,
  OfficerUser,
  PublicLiveUpdate,
  PublicStats,
  WardSector,
} from '../types/civiclens';

let memoryAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token;
}

function formatServerError(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const rawErr = (data as { error: unknown }).error;
    if (typeof rawErr === 'string' && rawErr.trim()) {
      try {
        const nested = JSON.parse(rawErr) as { error?: { message?: string } | string; message?: string };
        if (nested && typeof nested === 'object') {
          if (nested.error && typeof nested.error === 'object' && typeof nested.error.message === 'string') {
            return nested.error.message;
          }
          if (typeof nested.error === 'string') {
            return nested.error;
          }
          if (typeof nested.message === 'string') {
            return nested.message;
          }
        }
      } catch {
        // Not JSON
      }
      return rawErr;
    }
  }
  return `Request failed with status ${status}`;
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (memoryAuthToken) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(formatServerError(data, res.status));
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected empty or invalid response from the server. Please try again.');
  }

  return data as T;
}

export const api = {
  // Officer-Only Auth
  async register(payload: {
    name: string;
    email: string;
    password: string;
    department: string;
    inviteCode: string;
  }): Promise<{ officer: OfficerUser; token: string }> {
    const data = await apiFetch<{ officer: OfficerUser; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(data.token);
    return data;
  },

  async login(payload: { email: string; password: string }): Promise<{ officer: OfficerUser; token: string }> {
    const data = await apiFetch<{ officer: OfficerUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(data.token);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },

  async me(): Promise<{ officer: OfficerUser }> {
    return apiFetch<{ officer: OfficerUser }>('/api/auth/me');
  },

  // Public Citizen Endpoints (No Auth Required)
  async submitComplaint(formData: FormData): Promise<{
    complaint: Complaint;
    suspected_duplicates: Array<{
      relatedComplaintId: number;
      relatedTicketId: string;
      similarityScore: number;
      reason: string;
    }>;
    community_impact_count: number;
  }> {
    return apiFetch('/api/complaints', {
      method: 'POST',
      body: formData,
    });
  },

  async getPublicStats(): Promise<PublicStats> {
    return apiFetch<PublicStats>('/api/public/stats');
  },

  async getLiveGrid(includeDemo = true): Promise<{ nodes: Complaint[]; sectors: WardSector[] }> {
    return apiFetch(`/api/public/grid?includeDemo=${includeDemo ? 'true' : 'false'}`);
  },

  async getPublicUpdates(): Promise<{ updates: PublicLiveUpdate[] }> {
    return apiFetch('/api/public/updates');
  },

  async trackTicket(ticketId: string): Promise<{ ticket: Complaint; timeline: ComplaintUpdate[] }> {
    return apiFetch(`/api/track/${encodeURIComponent(ticketId.trim())}`);
  },

  // Officer Protected Endpoints
  async getDepartments(): Promise<{ departments: DepartmentStat[] }> {
    return apiFetch('/api/departments');
  },

  async getComplaints(filters?: {
    includeDemo?: boolean;
    category?: string;
    severity?: string;
    department?: string;
    status?: string;
    duplicatesOnly?: boolean;
    search?: string;
  }): Promise<{ complaints: Complaint[] }> {
    const params = new URLSearchParams();
    if (filters?.includeDemo === false) params.set('includeDemo', 'false');
    if (filters?.category && filters.category !== 'ALL') params.set('category', filters.category);
    if (filters?.severity && filters.severity !== 'ALL') params.set('severity', filters.severity);
    if (filters?.department && filters.department !== 'ALL') params.set('department', filters.department);
    if (filters?.status && filters.status !== 'ALL') params.set('status', filters.status);
    if (filters?.duplicatesOnly) params.set('duplicatesOnly', 'true');
    if (filters?.search) params.set('search', filters.search);
    const qs = params.toString();
    return apiFetch(`/api/complaints${qs ? `?${qs}` : ''}`);
  },

  async getComplaintDetail(id: number): Promise<{
    complaint: Complaint;
    updates: ComplaintUpdate[];
    duplicates: DuplicateLink[];
  }> {
    return apiFetch(`/api/complaints/${id}`);
  },

  async updateComplaint(
    id: number,
    payload: {
      status?: string;
      assigned_crew?: string | null;
      resolution_note?: string;
      note?: string;
      severity?: string;
      category?: string;
      department?: string;
    }
  ): Promise<{ complaint: Complaint }> {
    return apiFetch(`/api/complaints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async reviewDuplicate(dupId: number, decision: 'confirmed' | 'dismissed'): Promise<{ ok: boolean; status: string }> {
    return apiFetch(`/api/duplicates/${dupId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
  },

  async getAnalyticsOverview(includeDemo = true): Promise<AnalyticsOverview> {
    return apiFetch(`/api/analytics/overview?includeDemo=${includeDemo ? 'true' : 'false'}`);
  },

  async askAssistant(question: string): Promise<{ answer: string }> {
    return apiFetch('/api/ai/assistant', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  },

  async resetDemoData(): Promise<{ ok: boolean; message: string }> {
    return apiFetch('/api/demo/reset', { method: 'POST' });
  },
};

export function subscribeToLiveEvents(onEvent: (event: LiveCivicEvent) => void): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }
  const source = new EventSource('/api/events');
  source.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data) as LiveCivicEvent;
      if (parsed && parsed.type && parsed.type !== 'connected') {
        onEvent(parsed);
      }
    } catch {
      // Ignore malformed heartbeat/event payload
    }
  };
  return () => {
    source.close();
  };
}
