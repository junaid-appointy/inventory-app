/**
 * Attendance local store — cached face gallery + offline punch outbox.
 *
 * Uses the shared expo-sqlite database (`fieldapp.db`) but owns its own
 * tables, created lazily with IF NOT EXISTS so the attendance module stays
 * self-contained (no bump to the shared SCHEMA_VERSION).
 *
 * The gallery cache is for resilience, not speed: the online path always goes
 * to the server. Local matching is the offline fallback only.
 */

import { getDb } from '../../../db/database';

let initialized = false;

export async function initAttendanceStore(): Promise<void> {
  if (initialized) return;
  const db = await getDb();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS attendance_gallery (
      staff_id TEXT PRIMARY KEY,
      name TEXT,
      embedding TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attendance_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS attendance_outbox (
      id TEXT PRIMARY KEY,
      embedding TEXT NOT NULL,
      client_timestamp TEXT NOT NULL,
      geo TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_outbox_status ON attendance_outbox(status);
  `);
  initialized = true;
}

// ── Gallery ────────────────────────────────────────────────────────

export type CachedGalleryEntry = {
  staffId: string;
  name: string | null;
  embedding: number[];
};

export async function replaceGallery(
  entries: CachedGalleryEntry[],
  version: string,
): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM attendance_gallery;');
    for (const e of entries) {
      await db.runAsync(
        'INSERT OR REPLACE INTO attendance_gallery (staff_id, name, embedding) VALUES (?, ?, ?)',
        e.staffId,
        e.name,
        JSON.stringify(e.embedding),
      );
    }
    await db.runAsync(
      "INSERT OR REPLACE INTO attendance_meta (key, value) VALUES ('gallery_version', ?)",
      version,
    );
  });
}

export async function getCachedGallery(): Promise<CachedGalleryEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ staff_id: string; name: string | null; embedding: string }>(
    'SELECT staff_id, name, embedding FROM attendance_gallery',
  );
  return rows.map((r) => ({
    staffId: r.staff_id,
    name: r.name,
    embedding: safeParse(r.embedding),
  }));
}

export async function getCachedVersion(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM attendance_meta WHERE key = 'gallery_version'",
  );
  return row?.value ?? null;
}

export async function getGallerySize(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM attendance_gallery',
  );
  return row?.n ?? 0;
}

// ── Outbox ─────────────────────────────────────────────────────────

export type OutboxPunch = {
  id: string;
  embedding: number[];
  clientTimestamp: string;
  geo: unknown | null;
};

export async function enqueuePunch(row: OutboxPunch): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO attendance_outbox
       (id, embedding, client_timestamp, geo, status, attempts, created_at)
     VALUES (?, ?, ?, ?, 'queued', 0, ?)`,
    row.id,
    JSON.stringify(row.embedding),
    row.clientTimestamp,
    row.geo ? JSON.stringify(row.geo) : null,
    Date.now(),
  );
}

export async function listPending(): Promise<OutboxPunch[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    embedding: string;
    client_timestamp: string;
    geo: string | null;
  }>("SELECT id, embedding, client_timestamp, geo FROM attendance_outbox WHERE status = 'queued'");
  return rows.map((r) => ({
    id: r.id,
    embedding: safeParse(r.embedding),
    clientTimestamp: r.client_timestamp,
    geo: r.geo ? safeParseJson(r.geo) : null,
  }));
}

export async function markSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `DELETE FROM attendance_outbox WHERE id IN (${placeholders})`,
    ...ids,
  );
}

export async function markFailed(id: string, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE attendance_outbox
       SET attempts = attempts + 1, last_error = ?
     WHERE id = ?`,
    error.slice(0, 300),
    id,
  );
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM attendance_outbox WHERE status = 'queued'",
  );
  return row?.n ?? 0;
}

function safeParse(raw: string): number[] {
  const v = safeParseJson(raw);
  return Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : [];
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
