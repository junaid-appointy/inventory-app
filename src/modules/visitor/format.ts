import type { StringKey } from '../../i18n/strings';

type TFn = (key: StringKey, params?: Record<string, string | number>) => string;

/** 24h clock time. Locale-neutral on purpose (see field-app i18n rules). */
export function timeOnly(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function insideFor(iso: string, t: TFn): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return t('minutesShort', { n: mins });
  return t('hoursShort', { h: Math.floor(mins / 60), m: mins % 60 });
}
