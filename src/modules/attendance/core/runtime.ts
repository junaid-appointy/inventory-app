/**
 * Attendance runtime — the online/offline routing the gate screen drives.
 *
 * Online path is always the server path: POST the embedding, accept whatever
 * the engine returns (it owns identity + policy). On network failure we fall
 * back to a local match against the cached gallery, queue the event in the
 * outbox, and reconcile on reconnect — the engine re-resolves queued events
 * against its current gallery. Local matching is a resilience fallback, not an
 * authority.
 */

import {
  fetchGallery,
  flushOfflineBatch,
  heartbeat,
  postFaceEvent,
  type FaceEventResponseDto,
} from '../api/client';
import {
  enqueuePunch,
  getCachedGallery,
  getCachedVersion,
  getGallerySize,
  initAttendanceStore,
  listPending,
  markFailed,
  markSynced,
  replaceGallery,
} from '../db/store';
import { cosineSim } from './embedder';
import type { PunchGeo } from './geo';
import type { GateOutcome, PunchDirection } from './types';

// Server-provided punch threshold, refreshed on boot; default matches the
// engine's DEFAULT_ATTENDANCE_CONFIG.
let punchThreshold = 0.85;

export type PunchResult = {
  outcome: GateOutcome;
  staffName: string | null;
  direction: PunchDirection | null;
  offline: boolean;
};

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Boot: ensure the local store, heartbeat for config, sync the gallery if the
 * version moved, and flush any queued offline punches. Every step degrades
 * gracefully when offline — the gate still opens from cache.
 */
export async function bootAttendance(): Promise<{ gallerySize: number }> {
  await initAttendanceStore();
  try {
    const hb = await heartbeat();
    punchThreshold = hb.config.confidence_punch_threshold;
    const cachedVersion = await getCachedVersion();
    if (cachedVersion !== hb.gallery_version) {
      const gallery = await fetchGallery(cachedVersion);
      if (!gallery.unchanged) {
        await replaceGallery(
          gallery.entries.map((e) => ({
            staffId: e.staff_id,
            name: e.name,
            embedding: e.embedding,
          })),
          gallery.gallery_version,
        );
      }
    }
    void flushOutbox();
  } catch {
    // Offline boot — operate from cache.
  }
  return { gallerySize: await getGallerySize() };
}

/**
 * Submit a face embedding. Online → server; on failure → local match + queue.
 */
export async function submitPunch(embedding: number[], geo: PunchGeo): Promise<PunchResult> {
  const clientTimestamp = new Date().toISOString();

  try {
    const res = await postFaceEvent({
      embedding,
      client_timestamp: clientTimestamp,
      geo,
    });
    return mapServerResult(res);
  } catch {
    // Network/offline fallback: queue + local match.
    return submitOffline(embedding, clientTimestamp, geo);
  }
}

async function submitOffline(
  embedding: number[],
  clientTimestamp: string,
  geo: PunchGeo,
): Promise<PunchResult> {
  await enqueuePunch({ id: randomId(), embedding, clientTimestamp, geo });
  const match = await localMatch(embedding);
  const recognized = match !== null && match.similarity >= punchThreshold;
  return {
    outcome: recognized ? 'offline_pending' : 'no_match',
    staffName: recognized ? match!.name : null,
    direction: null,
    offline: true,
  };
}

async function localMatch(
  embedding: number[],
): Promise<{ staffId: string; name: string | null; similarity: number } | null> {
  const gallery = await getCachedGallery();
  let best: { staffId: string; name: string | null; similarity: number } | null = null;
  for (const entry of gallery) {
    const similarity = cosineSim(embedding, entry.embedding);
    if (!best || similarity > best.similarity) {
      best = { staffId: entry.staffId, name: entry.name, similarity };
    }
  }
  return best;
}

/** Flush queued offline punches to the engine, which re-resolves each. */
export async function flushOutbox(): Promise<void> {
  const pending = await listPending();
  if (pending.length === 0) return;
  try {
    const res = await flushOfflineBatch(
      pending.map((p) => ({
        client_event_id: p.id,
        embedding: p.embedding,
        client_timestamp: p.clientTimestamp,
        geo: (p.geo as PunchGeo) ?? null,
      })),
    );
    const syncedIds = res.results
      .filter((r) => r.client_event_id && !r.error)
      .map((r) => r.client_event_id as string);
    if (syncedIds.length > 0) await markSynced(syncedIds);
  } catch (err) {
    for (const p of pending) {
      await markFailed(p.id, err instanceof Error ? err.message : 'flush failed');
    }
  }
}

function mapServerResult(res: FaceEventResponseDto): PunchResult {
  return {
    outcome: res.outcome,
    staffName: res.staff?.name ?? null,
    direction: res.direction,
    offline: false,
  };
}
