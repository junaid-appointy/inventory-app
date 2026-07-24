/**
 * Attendance backend client — talks to the engine attendance plugin under
 * /api/attendance/*. Mirrors the inventory client's conventions: base URL from
 * config, x-guard-token + x-site-id + x-device-id headers, throws ApiError on
 * non-2xx.
 *
 * Response shapes are snake_case (engine is source of truth); the gate maps
 * them into the camelCase core types where it needs to.
 */

import { config } from '../../../config';
import { getSession } from '../../../auth/session';
import { getDeviceId } from '../../../utils/device';

export class AttendanceApiError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const deviceId = await getDeviceId();
  const session = getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId,
    'X-Site-Id': config.siteId,
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (session?.token) headers['X-Guard-Token'] = session.token;

  const res = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AttendanceApiError(res.status, `HTTP ${res.status} on ${path}`, text.slice(0, 500));
  }
  return res.json() as Promise<T>;
}

// ── Response types (snake_case, from the engine) ───────────────────

export type ServerConfigDto = {
  confidence_punch_threshold: number;
  confidence_challenge_threshold: number;
  confidence_reject_threshold: number;
  duplicate_window_seconds: number;
  geofence_radius_meters: number | null;
};

export type HeartbeatResponse = {
  server_time: string;
  gallery_version: string;
  config: ServerConfigDto;
};

export type GalleryEntryDto = {
  staff_id: string;
  name: string | null;
  embedding: number[];
};

export type GalleryResponse = {
  gallery_version: string;
  unchanged: boolean;
  entries: GalleryEntryDto[];
};

export type FaceEventResponseDto = {
  outcome: 'checked_in' | 'checked_out' | 'duplicate' | 'low_confidence' | 'no_match';
  event_id: string;
  confidence: number | null;
  direction: 'in' | 'out' | null;
  staff: { id: string; name: string | null } | null;
  geo_flagged: boolean;
};

export type GeoDto = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  mocked: boolean;
};

export type FaceEventInput = {
  embedding: number[];
  client_timestamp: string;
  client_event_id?: string;
  geo?: GeoDto | null;
};

export type OfflineBatchResult = {
  client_event_id: string | null;
} & Partial<FaceEventResponseDto> & { error?: string };

// ── Endpoints ──────────────────────────────────────────────────────

export function heartbeat(): Promise<HeartbeatResponse> {
  return request<HeartbeatResponse>('/api/attendance/heartbeat', { method: 'GET' });
}

export function fetchGallery(since: string | null): Promise<GalleryResponse> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return request<GalleryResponse>(`/api/attendance/embeddings/gallery${qs}`, { method: 'GET' });
}

export function postFaceEvent(input: FaceEventInput): Promise<FaceEventResponseDto> {
  return request<FaceEventResponseDto>('/api/attendance/face-events', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function flushOfflineBatch(
  events: (FaceEventInput & { client_event_id: string })[],
): Promise<{ results: OfflineBatchResult[] }> {
  return request<{ results: OfflineBatchResult[] }>(
    '/api/attendance/face-events/offline-batch',
    { method: 'POST', body: JSON.stringify({ events }) },
  );
}

// ── Enrollment + roster ────────────────────────────────────────────

export type StaffDto = {
  id: string;
  name: string;
  employee_code: string | null;
  enrolled: number;
};

export type RosterEntryDto = {
  staff_id: string;
  name: string;
  marked_in_at: string;
};

export function listStaff(): Promise<{ staff: StaffDto[] }> {
  return request<{ staff: StaffDto[] }>('/api/attendance/staff', { method: 'GET' });
}

export function fetchRoster(): Promise<{ roster: RosterEntryDto[] }> {
  return request<{ roster: RosterEntryDto[] }>('/api/attendance/roster', { method: 'GET' });
}

export function enrollFace(
  staffId: string,
  embedding: number[],
  quality?: number,
): Promise<{ ok: boolean; id: string; gallery_version: string }> {
  return request('/api/attendance/enroll', {
    method: 'POST',
    body: JSON.stringify({ staff_id: staffId, embedding, quality }),
  });
}
