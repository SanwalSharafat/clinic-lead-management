import type { ApiResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const USE_MOCK = import.meta.env.VITE_USE_MOCK_DATA === 'true';

type ReviewListResponse = { reviews: import('../types').HumanReview[]; total: number };
type PatientsListResponse = { patients: import('../types').Patient[]; total: number };

function normalizeListResponse<T>(payload: unknown, key: 'reviews' | 'patients'): { data: T; total: number } | null {
  if (Array.isArray(payload)) {
    return { data: payload as T, total: payload.length };
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    const items = obj[key];
    if (Array.isArray(items)) {
      return { data: items as T, total: typeof obj.total === 'number' ? obj.total : items.length };
    }

    if (key === 'reviews' && Array.isArray(obj.data)) {
      return { data: obj.data as T, total: typeof obj.total === 'number' ? obj.total : obj.data.length };
    }

    if (key === 'patients' && Array.isArray(obj.data)) {
      return { data: obj.data as T, total: typeof obj.total === 'number' ? obj.total : obj.data.length };
    }
  }

  return null;
}

function normalizeReviewDetail(payload: unknown): import('../types').HumanReview | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  if (obj.patient && typeof obj.patient === 'object' && obj.review && typeof obj.review === 'object') {
    const patient = obj.patient as Record<string, unknown>;
    const review = obj.review as Record<string, unknown>;
    return {
      id: String(review.id ?? patient.id ?? ''),
      patient_id: String(review.patient_id ?? patient.id ?? ''),
      patient_name: typeof patient.name === 'string' ? patient.name : String(review.patient_name ?? ''),
      patient_phone: typeof patient.phone === 'string' ? patient.phone : undefined,
      score_tier: (typeof review.score_tier === 'string' ? review.score_tier : patient.score_tier) as import('../types').ScoreTier,
      score: Number(review.score ?? patient.score ?? 0),
      reason: (typeof review.reason === 'string' ? review.reason : 'HIGH_SCORE') as import('../types').ReviewReason,
      reason_for_visit: typeof review.reason_for_visit === 'string' ? review.reason_for_visit : typeof patient.reason_for_visit === 'string' ? patient.reason_for_visit : undefined,
      resolved: Boolean(review.resolved ?? false),
      created_at: String(review.created_at ?? patient.created_at ?? new Date().toISOString()),
      updated_at: String(review.updated_at ?? patient.updated_at ?? new Date().toISOString()),
      confidence: typeof review.confidence === 'number' ? review.confidence : undefined,
      extracted_fields: Array.isArray(review.extracted_fields)
        ? review.extracted_fields as import('../types').ExtractedField[]
        : Array.isArray(patient.extracted_fields)
          ? patient.extracted_fields as import('../types').ExtractedField[]
          : undefined,
      score_breakdown: Array.isArray(review.score_breakdown)
        ? review.score_breakdown as import('../types').ScoreBreakdownItem[]
        : undefined,
      conversation: Array.isArray(obj.conversation)
        ? (obj.conversation as import('../types').Message[])
        : undefined,
    };
  }

  const aiOutput = obj.ai_output && typeof obj.ai_output === 'object'
    ? obj.ai_output as Record<string, unknown>
    : {};
  const scoreTier = obj.score_tier ?? aiOutput.score_tier ?? aiOutput.tier;
  const reason = obj.reason;

  return {
    id: String(obj.id ?? ''),
    patient_id: String(obj.patient_id ?? ''),
    patient_name: typeof obj.patient_name === 'string' ? obj.patient_name : 'Unknown patient',
    patient_phone: typeof obj.patient_phone === 'string' ? obj.patient_phone : undefined,
    score_tier: scoreTier === 'HIGH' || scoreTier === 'MEDIUM' || scoreTier === 'LOW'
      ? scoreTier
      : 'LOW',
    score: Number(obj.score ?? aiOutput.score ?? 0),
    reason: typeof reason === 'string' ? reason as import('../types').ReviewReason : 'HIGH_SCORE',
    reason_for_visit: typeof obj.reason_for_visit === 'string' ? obj.reason_for_visit : undefined,
    resolved: Boolean(obj.resolved ?? false),
    created_at: String(obj.created_at ?? new Date().toISOString()),
    updated_at: String(obj.updated_at ?? obj.created_at ?? new Date().toISOString()),
    confidence: typeof obj.confidence === 'number' ? obj.confidence : undefined,
    extracted_fields: Array.isArray(obj.extracted_fields)
      ? obj.extracted_fields as import('../types').ExtractedField[]
      : undefined,
    score_breakdown: Array.isArray(obj.score_breakdown)
      ? obj.score_breakdown as import('../types').ScoreBreakdownItem[]
      : undefined,
    conversation: Array.isArray(obj.conversation)
      ? obj.conversation as import('../types').Message[]
      : undefined,
  };
}

function normalizePatientDetail(payload: unknown): import('../types').Patient | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  if (obj.patient && typeof obj.patient === 'object') {
    const patient = obj.patient as Record<string, unknown>;
    return {
      id: String(patient.id ?? ''),
      name: String(patient.name ?? ''),
      phone: String(patient.phone ?? ''),
      email: typeof patient.email === 'string' ? patient.email : undefined,
      status: (patient.status as import('../types').PatientStatus) ?? 'NEW_LEAD',
      score_tier: (patient.score_tier as import('../types').ScoreTier) ?? 'LOW',
      score: Number(patient.score ?? patient.lead_score ?? 0),
      last_updated: String(patient.updated_at ?? patient.last_updated ?? new Date().toISOString()),
      created_at: String(patient.created_at ?? new Date().toISOString()),
      reason_for_visit: typeof patient.reason_for_visit === 'string' ? patient.reason_for_visit : undefined,
      conversation: Array.isArray(obj.interactions)
        ? (obj.interactions as import('../types').Message[])
        : undefined,
    };
  }

  return payload as import('../types').Patient;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  if (USE_MOCK) {
    const { mockFetch } = await import('../data/mockData');
    return mockFetch<T>(path, options);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
  }

  const json = (await res.json()) as ApiResponse<T>;
  return json;
}

export const api = {
  getHealth: () => apiFetch<{ status: string }>('/health'),

  getHumanReviews: async (params?: { resolved?: boolean; reason?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.resolved !== undefined) qs.set('resolved', String(params.resolved));
    if (params?.reason) qs.set('reason', params.reason);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));

    const res = await apiFetch<unknown>(`/human-reviews?${qs.toString()}`);
    if (!res.success) return res as ApiResponse<ReviewListResponse>;

    const normalized = normalizeListResponse<import('../types').HumanReview[]>(res.data ?? [], 'reviews');
    if (!normalized) return { success: true, data: { reviews: [], total: 0 } };

    return {
      success: true,
      data: {
        reviews: normalized.data.map(review => normalizeReviewDetail(review) ?? review as import('../types').HumanReview),
        total: normalized.total,
      },
    };
  },

  getHumanReview: async (id: string) => {
    const res = await apiFetch<unknown>(`/human-reviews/${id}`);
    if (!res.success) return res as ApiResponse<import('../types').HumanReview>;

    const normalized = normalizeReviewDetail(res.data);
    return {
      success: true,
      data: normalized ?? (res.data as import('../types').HumanReview),
    };
  },

  approveReview: (id: string, body: { reviewer_id: string; notes?: string }) =>
    apiFetch<void>(`/human-reviews/${id}/approve`, { method: 'POST', body: JSON.stringify(body) }),

  correctReview: (id: string, body: { reviewer_id: string; notes?: string; corrected_fields: Record<string, string> }) =>
    apiFetch<void>(`/human-reviews/${id}/correct`, { method: 'POST', body: JSON.stringify(body) }),

  escalateReview: (id: string, body: { reviewer_id: string; notes?: string }) =>
    apiFetch<void>(`/human-reviews/${id}/escalate`, { method: 'POST', body: JSON.stringify(body) }),

  rejectReview: (id: string, body: { reviewer_id: string; notes: string; reason: string }) =>
    apiFetch<void>(`/human-reviews/${id}/reject`, { method: 'POST', body: JSON.stringify(body) }),

  getPatients: async (params?: { status?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));

    const res = await apiFetch<unknown>(`/patients?${qs.toString()}`);
    if (!res.success) return res as ApiResponse<PatientsListResponse>;

    const normalized = normalizeListResponse<import('../types').Patient[]>(res.data ?? [], 'patients');
    if (!normalized) return { success: true, data: { patients: [], total: 0 } };

    return {
      success: true,
      data: {
        patients: normalized.data.map(patient => normalizePatientDetail(patient) ?? patient as import('../types').Patient),
        total: normalized.total,
      },
    };
  },

  getPatient: async (id: string) => {
    const res = await apiFetch<unknown>(`/patients/${id}`);
    if (!res.success) return res as ApiResponse<import('../types').Patient>;

    const normalized = normalizePatientDetail(res.data);
    return {
      success: true,
      data: normalized ?? (res.data as import('../types').Patient),
    };
  },

  markPatientWon: (id: string) => apiFetch<void>(`/patients/${id}/won`, { method: 'POST' }),

  markPatientLost: (id: string, body: { reason: string }) =>
    apiFetch<void>(`/patients/${id}/lost`, { method: 'POST', body: JSON.stringify(body) }),

  getAvailability: (date: string) =>
    apiFetch<{ slots: import('../types').BookingSlot[] }>(`/bookings/availability?date=${encodeURIComponent(date)}`),
};
