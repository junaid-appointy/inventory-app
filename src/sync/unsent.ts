/**
 * Words for things saved on this phone that the server has not taken yet:
 * one plain sentence per row for the "Not sent yet" screen, and the text
 * forwarded on WhatsApp when the server cannot be reached.
 *
 * The forwarded text is for people in the office group: what happened,
 * when, and who recorded it. No ids, statuses or references.
 */
import { getSession } from '../auth/session';
import type { OutboxRow } from '../db/outbox';
import type { StringKey, TParams } from '../i18n/strings';

type TFn = (key: StringKey, params?: TParams) => string;

/** Rows a person can forward. Photos go by themselves later. */
export const isShareable = (row: OutboxRow) => row.kind !== 'item_photo';

export function describeRow(row: OutboxRow, t: TFn): string {
  let p: Record<string, any>;
  try {
    p = JSON.parse(row.payload);
  } catch {
    return t('descInventoryUpdate');
  }
  const name = p.product_name ?? p.name ?? '';
  const qty = p.qty ?? '';
  switch (row.kind) {
    case 'receipt':
      return t('descReceived', { qty, name }).trim();
    case 'product_registration':
      return t('descNewProduct', { name }).trim();
    case 'issue':
    case 'dispense':
      return t('descDispensed', { qty, name }).trim();
    case 'reorder_request':
      return t('descReorder', { name }).trim();
    case 'mismatch_flag':
      return t('descMismatch', { received: p.received_total ?? '?', expected: p.expected ?? '?' });
    case 'item_photo':
      return t('descItemPhoto');
    case 'visitor_event': {
      const who = p.staffName ?? p.visitorName ?? '';
      if (p.eventType === 'staff_in') return t('descStaffIn', { name: who });
      if (p.eventType === 'staff_out') return t('descStaffOut', { name: who });
      if (p.eventType === 'checkout') return t('descVisitorExit', { name: who }).trim();
      const host = p.hostName ? `, ${t('descToMeet', { name: p.hostName })}` : '';
      if (p.eventType === 'manual_checkin') return t('descVisitorWalkIn', { name: who }).trim() + host;
      return t('descVisitorCheckIn', { name: who || p.qrToken || '' }).trim() + host;
    }
    default:
      return t('descInventoryUpdate');
  }
}

/** When it happened on the phone, as a clock time ("14:05"). */
export function rowTime(row: OutboxRow): string {
  const d = new Date(row.created_at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function rowDay(row: OutboxRow): string {
  const d = new Date(row.created_at);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** The message forwarded on WhatsApp, oldest first. */
export function shareText(rows: OutboxRow[], t: TFn): string {
  const ordered = [...rows].sort((a, b) => a.created_at - b.created_at);
  const who = getSession()?.guardName ?? '';
  const day = ordered.length ? rowDay(ordered[0]) : '';
  const lines = ordered.map((row) => `${rowTime(row)}   ${describeRow(row, t)}`);
  return [
    `*${t('shareHeader')}*`,
    [who, day].filter(Boolean).join(', '),
    '',
    ...lines,
    '',
    t('shareFooter'),
  ].join('\n');
}
