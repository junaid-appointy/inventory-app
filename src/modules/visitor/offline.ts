/**
 * Offline capture for gate actions. Builds the same structured event the web
 * guard portal queues (see visitor-web offlineQueue.ts createOfflineEvent) and
 * puts it on the app's outbox; the sync loop posts it to
 * /api/offline-events/sync, which reconciles it on the server.
 */
import { getSession } from '../../auth/session';
import { getDb } from '../../db/database';
import { enqueue, UNSENT_STATUSES, waitUntilSent } from '../../db/outbox';
import { nanoid } from 'nanoid/non-secure';
import { flushOnce } from '../../sync/syncService';

type VisitorEvent =
  | { eventType: 'staff_in' | 'staff_out'; staffId: string; staffName: string }
  | { eventType: 'qr_checkin_capture'; qrToken: string; visitorName?: string; hostName?: string; purpose?: string }
  | { eventType: 'manual_checkin'; visitorName: string; phone?: string; purpose?: string; hostName?: string }
  | { eventType: 'checkout'; sessionId?: string; visitorName?: string; checkoutTime?: string };

function segment(value: string | undefined, fallback: string): string {
  const cleaned = String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return cleaned || fallback;
}

function stamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function queueVisitorEvent(event: VisitorEvent): Promise<string> {
  const session = getSession();
  const now = new Date();
  const random = nanoid(20);
  const id = await enqueue('visitor_event', {
    offlineEventId: ['OFL', 'APP', segment(session?.guardName ?? session?.guardId, 'GUARD'), stamp(now), random].join('-'),
    version: 'V1',
    guardId: session?.guardId,
    guardName: session?.guardName,
    capturedAt: now.toISOString(),
    deviceTime: now.toString(),
    syncStatus: 'queued_local',
    ...event,
  });
  // Try right away; if still offline the 30s loop picks it up later.
  void flushOnce().catch((error) => console.warn('Gate event sync will retry', error));
  return id;
}

/**
 * Save a gate action on the phone first, then give the server a few
 * seconds to take it. True when it is already in the system; false when
 * it waits on the phone (it then shows on the "Not sent yet" screen).
 */
export async function recordGateEvent(event: VisitorEvent): Promise<boolean> {
  return waitUntilSent(await queueVisitorEvent(event));
}

export type PendingStaffMark = { staffId: string; eventType: 'staff_in' | 'staff_out'; capturedAt: string };

/** Staff marks made on this phone that the server has not taken yet, oldest first. */
export async function pendingStaffMarks(): Promise<PendingStaffMark[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM outbox WHERE kind = 'visitor_event'
     AND status IN (${UNSENT_STATUSES.map(() => '?').join(',')}) ORDER BY created_at`,
    UNSENT_STATUSES as string[],
  );
  return rows.flatMap((r) => {
    try {
      const p = JSON.parse(r.payload);
      return p.eventType === 'staff_in' || p.eventType === 'staff_out'
        ? [{ staffId: String(p.staffId), eventType: p.eventType, capturedAt: String(p.capturedAt) }]
        : [];
    } catch {
      return [];
    }
  });
}
