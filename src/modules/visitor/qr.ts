import type { VisitorQrMeta } from '../../navigation/types';

/**
 * Pull the pass token out of whatever the QR holds. Same rules as the web
 * portal (visitor-web QrScanner.tsx extractToken): a JSON payload with `t`
 * or `url` (plus visitor details for offline use), a pass URL ending in the
 * token, or the bare token.
 */
export function extractPassToken(raw: string): { token: string; meta: VisitorQrMeta | null } {
  try {
    const p = JSON.parse(raw) as { t?: string; url?: string; v?: string; p?: string; h?: string; ph?: string };
    if (p && (p.t || p.url)) {
      const token = p.t || p.url?.split('?')[0]?.split('/').pop() || '';
      return {
        token,
        meta: { visitorName: p.v ?? null, purpose: p.p ?? null, hostName: p.h ?? null, phone: p.ph ?? null },
      };
    }
  } catch {
    // Not JSON: a URL or the bare token.
  }
  const clean = raw.trim().split('?')[0] ?? '';
  if (clean.includes('/')) {
    const parts = clean.split('/');
    return { token: parts[parts.length - 1] ?? clean, meta: null };
  }
  return { token: clean, meta: null };
}
