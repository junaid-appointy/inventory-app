/**
 * Backend client for the office-ops inventory plugin.
 *
 * Every request:
 *   - is prefixed with `${config.apiBaseUrl}/api/inventory/...`
 *   - carries `x-guard-token` (from session) and `x-site-id` / `x-device-id`
 *   - throws an `ApiError` with status + body on non-2xx
 *
 * The outbox flusher (syncService) calls `api.send.*`; screens call
 * `api.fetch.*`. When no session token is present, requests still go out
 * — the server replies 401 and the outbox keeps the row queued (or
 * the read screens fall back to local cache).
 */

import { config } from '../config';
import { clearSession, getSession } from '../auth/session';
import { getDeviceId } from '../utils/device';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
  }
  /** Friendly composite for surfaces that only see `err.message` — e.g.
   *  the outbox's `last_error` column. Pulls the server's
   *  `{ error: "..." }` body when present so the guard sees a real
   *  reason instead of just "HTTP 500". */
  static format(status: number, path: string, body: string | undefined): string {
    if (body) {
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === 'string') {
          return `HTTP ${status} on ${path} — ${parsed.error}`;
        }
      } catch {
        // not JSON, fall through
      }
      const trimmed = body.trim();
      if (trimmed.length > 0) {
        return `HTTP ${status} on ${path} — ${trimmed.slice(0, 180)}`;
      }
    }
    return `HTTP ${status} on ${path}`;
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
  const sentToken = session?.token ?? null;
  if (sentToken) headers['X-Guard-Token'] = sentToken;

  const res = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const body = text.slice(0, 500);
    // 401 with a sent token means the session expired or was revoked
    // server-side. Clear it centrally so:
    //  - the polling/warm-up loop stops spamming "Invalid or expired
    //    session" warnings on every tick,
    //  - the AuthProvider's onSessionChange listener fires and the
    //    RootNavigator drops back to LoginScreen.
    // Skip when no token was sent (the login call itself surfaces 401
    // via ApiError to the LoginScreen; there's no session to clear).
    if (res.status === 401 && sentToken) {
      // Fire-and-forget — clearing is best-effort and shouldn't block
      // the error path.
      void clearSession().catch(() => {});
    }
    throw new ApiError(res.status, ApiError.format(res.status, path, body), body);
  }
  return res.json() as Promise<T>;
}

const post = (path: string, payload: unknown) =>
  request<{ inserted?: boolean; id?: string; barcode?: string }>(path, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export type RemoteOrderItem = {
  id: string;
  order_id: string;
  barcode: string | null;
  product_id: string | null;
  product_name: string;
  expected_qty: number;
  received_qty: number;
};

export type RemoteOrder = {
  id: string;
  site_id: string;
  vendor: string | null;
  expected_at: string | null;
  arrived_at: string | null;
  status: string;
  items: RemoteOrderItem[];
};

export type RemoteLot = {
  expiry_date: string | null;
  qty: number;
};

export type RemoteStockRow = {
  barcode: string;
  site_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  on_hand: number;
  threshold: number;
  pack_size: number | null;
  /** Per-batch breakdown, FEFO-ordered. Present on list and JIT
   *  endpoints. Older rows that never received a lot write have an
   *  empty array — caller falls back to nearest_expiry only. */
  lots?: RemoteLot[];
  nearest_expiry?: string | null;
};

export type RemoteProduct = {
  barcode: string;
  site_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
};

export type RemoteCatalogHit = {
  product: RemoteProduct | null;
  openOrderItem: RemoteOrderItem | null;
};

export type RemoteCanonicalProduct = {
  product_id: string;
  site_id: string;
  canonical_name: string;
  category: string | null;
  hsn_code: string | null;
  unit: string;
  pack_size: number;
  created_at: string;
  updated_at: string;
  /** True iff at least one barcode is mapped to this product server-side.
   *  Drives the "hide already-taken products" filter when registering a
   *  brand-new barcode on the field-app. */
  has_barcode?: boolean;
  /** Most-recently learned real barcode mapped to this product. Lets the
   *  "no barcode" → catalog pick flow reuse the existing mapping instead
   *  of synthesising a `catalog_*` id. Null when no barcode is mapped. */
  primary_barcode?: string | null;
};

export const api = {
  // Login is handled by visitor's guard auth endpoint, not the inventory
  // plugin. Lives here so screens have one client to import.
  async login(input: { guardName: string; pin: string }): Promise<{
    token: string;
    guardId: string;
    guardName: string;
    language: 'hindi' | 'english';
  }> {
    const deviceId = await getDeviceId();
    const res = await fetch(`${config.apiBaseUrl}/api/guard/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guardName: input.guardName,
        pin: input.pin,
        deviceId,
        deviceName: 'field-app',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Pull the server's reason out of `{ "error": "..." }` if present so
      // the LoginScreen shows something actionable instead of just "Login failed".
      let reason = text.slice(0, 200);
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.error === 'string') reason = parsed.error;
      } catch {}
      throw new ApiError(res.status, reason || `Login failed (${res.status})`, text.slice(0, 500));
    }
    return res.json();
  },

  // Writes (outbox-dispatched).
  send: {
    receipt: (payload: object) => post('/api/inventory/receipts', payload),
    product: (payload: object) => post('/api/inventory/products', payload),
    issue: (payload: object) => post('/api/inventory/issues', payload),
    reorderRequest: (payload: object) =>
      post('/api/inventory/reorder-requests', payload),
    mismatchFlag: (payload: object) =>
      post('/api/inventory/mismatch-flags', payload),
    learnBarcode: (payload: object) =>
      post('/api/inventory/canonical-products/learn-barcode', payload),
    stockCorrection: (payload: object) =>
      post('/api/inventory/corrections', payload),
  },

  // Reads (called by screens).
  fetch: {
    orders: () =>
      request<{ orders: RemoteOrder[] }>('/api/inventory/orders').then((r) => r.orders),
    stock: () =>
      request<{ stock: RemoteStockRow[] }>('/api/inventory/stock').then((r) => r.stock),
    alerts: () =>
      request<{ alerts: RemoteStockRow[] }>('/api/inventory/alerts').then((r) => r.alerts),
    catalog: (barcode: string) =>
      request<RemoteCatalogHit>(
        `/api/inventory/catalog/${encodeURIComponent(barcode)}`,
      ),
    normalizeName: (rawName: string) =>
      request<{
        canonical: string;
        language: 'en' | 'hi' | 'hinglish' | 'unknown';
        confidence: number;
        cached: boolean;
      }>('/api/inventory/products/normalize', {
        method: 'POST',
        body: JSON.stringify({ rawName }),
      }),
    canonicalProducts: () =>
      request<{ products: RemoteCanonicalProduct[] }>(
        '/api/inventory/canonical-products',
      ).then((r) => r.products),
    /** Single-row catalog read with live-computed `has_barcode` and
     *  `primary_barcode`. Used by the catalog picker's JIT verification
     *  right before navigating to ReceivingScreen, so the receipt is
     *  built against the freshest server state (catches barcode
     *  mappings learned by another guard / admin / bill flow that the
     *  periodic sync hadn't pulled yet). */
    canonicalProduct: (productId: string) =>
      request<{ product: RemoteCanonicalProduct }>(
        `/api/inventory/canonical-products/${encodeURIComponent(productId)}`,
      ).then((r) => r.product),
    /** Single-row stock read with nearest future expiry. Used by
     *  EditStock and Dispense JIT verification so the user is editing
     *  / dispensing against the authoritative on-hand. 404 if the
     *  barcode has no server-side stock row yet — caller treats that
     *  as "use the local view" rather than as an error. */
    stockOne: (barcode: string) =>
      request<{ stock: RemoteStockRow & { nearest_expiry: string | null } }>(
        `/api/inventory/stock/${encodeURIComponent(barcode)}`,
      ).then((r) => r.stock),
  },
};
