import { AlertTriangle, Check, CheckCheck, Clock } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text, usePop } from '../../../design';
import { itemPhotosOnPhone } from '../../../db/outbox';
import { useT } from '../../../i18n';
import type { StringKey } from '../../../i18n/strings';
import { api } from '../../../sync/api';
import { flushOnce } from '../../../sync/syncService';
import { useTheme } from '../../../theme';

/**
 * Where a proof photo is, shown like WhatsApp's ticks:
 *   clock       still on this phone (waiting for signal)
 *   one tick    the server has it
 *   two ticks   posted in the office group (in the brand colour)
 *   warning     upload failed; it will try again
 */
export type TickState = 'phone' | 'failed' | 'server' | 'posted';

const ORDER: TickState[] = ['failed', 'phone', 'server', 'posted'];
const POLL_MS = 4000;
const STOP_AFTER_MS = 3 * 60_000;

/** The least-far photo decides an item with several photos. */
export function worstTick(states: TickState[]): TickState | null {
  if (states.length === 0) return null;
  return ORDER.find((s) => states.includes(s)) ?? null;
}

/**
 * Live tick state for each photo id. Polls while the screen is open, until
 * every photo is posted (or after a few minutes; reopening resumes).
 */
export function usePhotoTicks(photoIds: string[]): Record<string, TickState> {
  const key = photoIds.join(',');
  const [states, setStates] = useState<Record<string, TickState>>(() =>
    Object.fromEntries(photoIds.map((id) => [id, 'phone' as TickState])),
  );
  const known = useRef(states);

  useEffect(() => {
    if (photoIds.length === 0) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    const check = async () => {
      await flushOnce({ pullReads: false }).catch(() => {});
      const onPhone = await itemPhotosOnPhone();
      const next: Record<string, TickState> = {};
      const uploaded: string[] = [];
      for (const id of photoIds) {
        const local = onPhone.get(id);
        if (local === 'failed' || local === 'rejected') next[id] = 'failed';
        else if (local) next[id] = 'phone';
        else {
          // Keep confirmed progress when offline. An absent local queue row
          // alone does not prove that the server accepted a photo.
          next[id] = known.current[id] ?? 'phone';
          uploaded.push(id);
        }
      }
      if (uploaded.length) {
        try {
          for (const p of await api.photoStatus(uploaded)) {
            next[p.photo_id] = p.posted || known.current[p.photo_id] === 'posted' ? 'posted' : 'server';
          }
        } catch {
          /* offline: keep what we know */
        }
      }
      if (stopped) return;
      known.current = next;
      setStates(next);
      const done = photoIds.every((id) => next[id] === 'posted');
      if (!done && Date.now() - started < STOP_AFTER_MS) timer = setTimeout(runCheck, POLL_MS);
    };
    const runCheck = () => {
      void check().catch(error => {
        console.warn('[PhotoTicks] Could not check photo progress', error);
        if (!stopped && Date.now() - started < STOP_AFTER_MS) timer = setTimeout(runCheck, POLL_MS);
      });
    };
    runCheck();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return states;
}

const LABEL: Record<TickState, StringKey> = {
  phone: 'tickPhone',
  failed: 'tickFailed',
  server: 'tickServer',
  posted: 'tickPosted',
};

/** The tick icon, optionally with its words. */
export function PhotoTick({ state, withLabel }: { state: TickState; withLabel?: boolean }) {
  const t = useT();
  const { palette } = useTheme();
  const color = state === 'posted' ? palette.primary : state === 'failed' ? palette.amber : palette.onSurfaceVariant;
  const Icon = state === 'posted' ? CheckCheck : state === 'server' ? Check : state === 'failed' ? AlertTriangle : Clock;
  // A tick that moves on (clock, one tick, two ticks) pops, like WhatsApp's.
  const pop = usePop(state, 1.25);
  return (
    <Animated.View style={[styles.row, { transform: [{ scale: pop }] }]} accessible accessibilityLabel={t(LABEL[state])}>
      <Icon size={18} color={color} strokeWidth={2.4} />
      {withLabel ? (
        <Text variant="labelMedium" color={color} style={{ letterSpacing: 0 }}>
          {t(LABEL[state])}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/** One line explaining the ticks, shown once above a list. */
export function TickLegend() {
  const states = useMemo<TickState[]>(() => ['phone', 'server', 'posted'], []);
  return (
    <View style={styles.legend}>
      {states.map((s) => (
        <PhotoTick key={s} state={s} withLabel />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 4 },
});
