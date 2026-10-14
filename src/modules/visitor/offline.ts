/**
 * Offline capture for gate actions. Builds the same structured event the web
 * guard portal queues (see visitor-web offlineQueue.ts createOfflineEvent) and
 * puts it on the app's outbox; the sync loop posts it to
 * /api/offline-events/sync, which reconciles it on the server.
 */
import { getSession } from '../../auth/session';
import { enqueue } from '../../db/outbox';
import { flushOnce } from '../../sync/syncService';

type VisitorEvent =
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

export async function queueVisitorEvent(event: VisitorEvent): Promise<void> {
  const session = getSession();
  const now = new Date();
  const random = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0').toUpperCase();
  await enqueue('visitor_event', {
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
  flushOnce().catch(() => {});
}
