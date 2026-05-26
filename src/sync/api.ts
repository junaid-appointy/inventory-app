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
import { getSession } from '../auth/session';
import { getDeviceId } from '../utils/device';

export class ApiError extends Error {
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
    throw new ApiError(res.status, `HTTP ${res.status} on ${path}`, text.slice(0, 500));
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

export type RemoteStockRow = {
  barcode: string;
  site_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  on_hand: number;
  threshold: number;
};

export type RemoteProduct = {
  barcode: string;
  site_id: string;
  name: string;
  category: string | null;
  unit: string | null;
};

export type RemoteCatalogHit = {
  product: RemoteProduct | null;
  openOrderItem: RemoteOrderItem | null;
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
      throw new ApiError(res.status, `Login failed`, text.slice(0, 200));
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
  },
};
