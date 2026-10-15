/**
 * Visitor gate calls. Same engine endpoints the web guard portal uses, so
 * the two stay interchangeable while the portal is still running.
 *
 * Every call goes through `requestRaw`: it never throws on an HTTP error
 * (the pass check answers 400 with a full body for an invalid pass) and it
 * reports a network failure as `offline` so screens can fall back to
 * offline capture instead of showing an error.
 */
import { requestRaw } from '../../sync/api';

export type VisitorInvitation = {
  id: string;
  visitor_name: string;
  visitor_phone?: string | null;
  purpose?: string | null;
  host_employee_name?: string | null;
  approval_status: string;
  qr_token: string;
  expires_at: string;
  valid_from?: string | null;
  valid_until?: string | null;
};

export type VisitorSession = {
  id: string;
  visitor_name: string;
  checkin_time: string;
  host_employee_name?: string | null;
  /** The host's photo (uploaded or Google), when known. */
  host_photo_url?: string | null;
  purpose?: string | null;
};

export type VerifyResponse = {
  valid: boolean;
  invitation?: VisitorInvitation;
  session?: VisitorSession;
  errorCode?: string;
  errorMessage?: string;
};

export type ExpectedGuest = {
  id: string;
  visitorName: string;
  visitorPhone?: string;
  purpose?: string;
  hostName?: string;
  hostPhotoUrl?: string;
  expectedDate: string;
  expectedTime?: string;
  approvalStatus: string;
  qrToken: string;
  validFrom?: string;
  validUntil?: string;
  tokenUsed: boolean;
};

export type StaffMember = {
  id: string;
  employeeCode: string;
  name: string;
  role?: string;
  department?: string;
  photoUrl?: string;
  attendanceStatus?: string;
  markedInAt?: string;
  markedOutAt?: string;
};

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) });

export const visitorApi = {
  verify: (token: string) =>
    requestRaw<VerifyResponse>(`/api/visitor/verify/${encodeURIComponent(token)}`),
  checkIn: (token: string) =>
    requestRaw<{ success: boolean; session?: VisitorSession; errorMessage?: string }>(
      `/api/visitor/checkin/${encodeURIComponent(token)}`,
      post(),
    ),
  checkOut: (sessionId: string) =>
    requestRaw<{ success: boolean; durationMinutes?: number; errorMessage?: string }>(
      `/api/visitor/checkout/${encodeURIComponent(sessionId)}`,
      post(),
    ),
  active: () => requestRaw<{ sessions: VisitorSession[] }>('/api/visitors/active'),
  expected: () =>
    requestRaw<{ date: string; generatedAt: string; guests: ExpectedGuest[] }>('/api/visitors/expected'),
  searchStaff: (q: string, limit = 500) =>
    requestRaw<{ results: StaffMember[] }>(`/api/staff/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  markIn: (staffId: string) =>
    requestRaw<{ error?: string }>(`/api/staff/mark-in/${encodeURIComponent(staffId)}`, post()),
  markOut: (staffId: string) =>
    requestRaw<{ error?: string }>(`/api/staff/mark-out/${encodeURIComponent(staffId)}`, post()),
  manualEntry: (input: { visitor_name: string; phone?: string; purpose?: string; host?: string }) =>
    requestRaw<{ error?: string }>('/api/visitor/manual-entry', post(input)),
};
