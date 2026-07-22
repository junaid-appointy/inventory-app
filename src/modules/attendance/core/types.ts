/**
 * Attendance domain types — hand-defined against the engine's attendance
 * plugin (`/api/attendance/*`). No shared types package; the engine is the
 * source of truth, so update these when a response shape changes.
 *
 * Policy (thresholds, dedupe window, geofence radius) lives on the server.
 * The app is a channel adapter: it captures a face, computes an embedding,
 * attaches location, and accepts whatever outcome the engine returns.
 */

/** A single enrolled staff face vector, cached locally for offline matching. */
export type GalleryEntry = {
  staffId: string;
  name: string | null;
  /** L2-normalized embedding (MobileFaceNet, 192-dim). */
  embedding: number[];
};

/** Where the punch happened, for server-side geofence verification. */
export type GeoFix = {
  latitude: number;
  longitude: number;
  /** Reported accuracy radius in metres. */
  accuracy: number | null;
  /** True when the OS flagged the fix as a mock/fake location. */
  mocked: boolean;
} | null;

/** Outcome the engine returns for a face event. Server is source of truth. */
export type GateOutcome =
  | 'checked_in'
  | 'checked_out'
  | 'duplicate'
  | 'no_match'
  | 'low_confidence'
  | 'challenge_required'
  | 'offline_pending';

export type PunchDirection = 'in' | 'out';

export type FaceEventResponse = {
  outcome: GateOutcome;
  eventId: string;
  confidence?: number;
  direction?: PunchDirection | null;
  staff?: { id: string; name: string | null } | null;
  /** Present when the server wants a liveness challenge before accepting. */
  challenge?: { poses: string[] } | null;
};

/** Server-provided matching/liveness policy, fetched on heartbeat. */
export type ServerConfig = {
  confidencePunchThreshold: number;
  confidenceChallengeThreshold: number;
  confidenceRejectThreshold: number;
  duplicateWindowSeconds: number;
  geofenceRadiusMeters: number | null;
};

export const DEFAULT_CONFIG: ServerConfig = {
  confidencePunchThreshold: 0.85,
  confidenceChallengeThreshold: 0.65,
  confidenceRejectThreshold: 0.5,
  duplicateWindowSeconds: 60,
  geofenceRadiusMeters: null,
};
