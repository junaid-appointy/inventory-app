/**
 * Expiry display helpers — single source of truth for how dates and
 * their urgency are rendered across the field-app. Every screen that
 * shows an expiry should use these so the format stays consistent
 * ("15 Aug 2026") and urgency colors follow one rule set.
 */

export type ExpiryUrgency = 'expired' | 'soon' | 'ok' | 'none';

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse an ISO YYYY-MM-DD into a local-midnight Date. Returns null if
 *  the string is missing or malformed. We construct via local-midnight
 *  so day diffs aren't off-by-one near timezone boundaries. */
function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** "15 Aug 2026" or "No expiry". */
export function formatExpiry(iso: string | null | undefined): string {
  const d = parseISO(iso ?? null);
  if (!d) return 'No expiry';
  const day = d.getDate();
  const mo = MONTHS_SHORT[d.getMonth()];
  const yr = d.getFullYear();
  return `${day} ${mo} ${yr}`;
}

/** Days from today to the given date. Positive = future, negative = past.
 *  Returns null when the input has no expiry. */
export function daysUntilExpiry(iso: string | null | undefined): number | null {
  const d = parseISO(iso ?? null);
  if (!d) return null;
  const today = startOfToday();
  return Math.round((d.getTime() - today.getTime()) / MS_PER_DAY);
}

/** Urgency bucket: 'expired' (past), 'soon' (≤30 days), 'ok' (later),
 *  'none' (no expiry). Drives color choice in the UI. */
export function expiryUrgency(iso: string | null | undefined): ExpiryUrgency {
  const days = daysUntilExpiry(iso);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 30) return 'soon';
  return 'ok';
}

/** Human-readable relative time hint: "in 8 days", "in 3 months",
 *  "expired 2 weeks ago", "today", "tomorrow". null when no expiry. */
export function relativeExpiry(iso: string | null | undefined): string | null {
  const days = daysUntilExpiry(iso);
  if (days === null) return null;
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  if (days === -1) return 'expired yesterday';
  if (days > 0) {
    if (days < 14) return `in ${days} days`;
    if (days < 60) return `in ${Math.round(days / 7)} weeks`;
    if (days < 365 * 2) return `in ${Math.round(days / 30)} months`;
    return `in ${Math.round(days / 365)} years`;
  }
  // Past
  const abs = -days;
  if (abs < 14) return `expired ${abs} days ago`;
  if (abs < 60) return `expired ${Math.round(abs / 7)} weeks ago`;
  if (abs < 365 * 2) return `expired ${Math.round(abs / 30)} months ago`;
  return `expired ${Math.round(abs / 365)} years ago`;
}

/** Theme-color lookup table for an urgency bucket. Pass a theme palette
 *  in; this returns the foreground + background pair to use for a chip
 *  or label. Neutral 'ok' uses surface tones so non-urgent expiries don't
 *  steal attention; 'none' uses outline-only because "no expiry" is
 *  informational, not a status. */
export function urgencyColors(
  urgency: ExpiryUrgency,
  palette: {
    error: string;
    onError: string;
    errorContainer: string;
    onErrorContainer: string;
    warn: string;
    onWarn: string;
    warnContainer: string;
    onWarnContainer: string;
    surfaceContainerHighest: string;
    onSurface: string;
    onSurfaceVariant: string;
    outline: string;
    outlineVariant: string;
  },
): { fg: string; bg: string; border: string } {
  switch (urgency) {
    case 'expired':
      return {
        fg: palette.onErrorContainer,
        bg: palette.errorContainer,
        border: palette.error,
      };
    case 'soon':
      return {
        fg: palette.onWarnContainer,
        bg: palette.warnContainer,
        border: palette.warn,
      };
    case 'ok':
      return {
        fg: palette.onSurface,
        bg: palette.surfaceContainerHighest,
        border: palette.outlineVariant,
      };
    case 'none':
    default:
      return {
        fg: palette.onSurfaceVariant,
        bg: 'transparent',
        border: palette.outline,
      };
  }
}

/** Stable comparator for sorting batches by expiry — earliest first,
 *  null (no expiry) last. */
export function compareExpiryAsc(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
