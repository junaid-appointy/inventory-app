import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../design';
import { spacing } from '../../../design/tokens';
import { roundQty } from '../../../units';

type Props = {
  /** Total stock capacity (the "full" amount) */
  totalCapacity: number;
  /** How much will remain after the current action */
  remaining: number;
  /** Unit label (e.g. "kg", "packs") */
  unit: string;
  /** Threshold to determine health */
  threshold: number;
};

/**
 * Warning pill for the post-dispense level — or null when there is
 * nothing to warn about.
 *
 * There is deliberately no "HEALTHY" state: a pill that fires on the
 * happy path is noise, and it trains guards to stop reading the pill at
 * all, which is exactly when we need them to notice LOW/OUT.
 */
function healthStatus(remaining: number, threshold: number): {
  label: string;
  tone: 'warn' | 'danger';
} | null {
  if (remaining <= 0) return { label: 'OUT', tone: 'danger' };
  if (remaining <= threshold) return { label: 'LOW', tone: 'warn' };
  return null;
}

/**
 * PackVisual — a "fill box" that visually represents stock level.
 * Matches the design mockup screen 05 (Dispense): a rounded container
 * with a box outline + fill gradient, percentage overlay, and health pill.
 */
export function PackVisual({ totalCapacity, remaining, unit, threshold }: Props) {
  // Round for display — raw float subtraction (capacity − taken) leaks dust
  // like 568.99999999999 that would otherwise render verbatim. roundQty
  // snaps to the 3-decimal grid the system tracks (569, 2.6, 0.5).
  const cap = roundQty(totalCapacity);
  const rem = roundQty(remaining);
  const pct = cap > 0 ? Math.max(0, Math.min(1, rem / cap)) : 0;
  const pctDisplay = Math.round(pct * 100);
  const health = healthStatus(rem, threshold);

  const pillBg = health?.tone === 'danger' ? '#FFEBEE' : '#FFF8E1';
  const pillFg = health?.tone === 'danger' ? '#E53935' : '#c98b00';

  return (
    <View style={styles.container}>
      {/* Fill box */}
      <View style={styles.box}>
        {/* Cap / lid */}
        <View style={styles.cap} />
        {/* Fill level */}
        <View
          style={[
            styles.fill,
            { height: `${pctDisplay}%` },
          ]}
        />
        {/* Percentage overlay */}
        <View style={styles.pctOverlay}>
          <Text
            variant="headlineSmall"
            color="#fff"
            style={styles.pctText}
          >
            {pctDisplay}%
          </Text>
        </View>
      </View>

      {/* Info column */}
      <View style={styles.info}>
        <Text variant="labelMedium" color="#4D444B" style={styles.infoLabel}>
          AFTER DISPENSE
        </Text>
        <Text variant="headlineLarge" style={{ marginTop: spacing.xs, letterSpacing: -0.5 }}>
          {rem} {unit}
        </Text>
        <Text variant="bodyMedium" color="rgba(30,26,29,0.55)" style={{ marginTop: spacing.xxs }}>
          will remain of {cap} {unit}
        </Text>
        {health ? (
          <View
            style={[
              styles.pill,
              { backgroundColor: pillBg, marginTop: spacing.md },
            ]}
          >
            <Text
              variant="labelMedium"
              color={pillFg}
              style={{ fontWeight: '700' }}
            >
              {health.label}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: '#F5EFF3',
    borderRadius: 20,
    padding: spacing.lg,
  },
  box: {
    width: 96,
    height: 120,
    borderWidth: 3,
    borderColor: '#CDC4CB',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fbfafb',
    position: 'relative',
  },
  cap: {
    position: 'absolute',
    top: -7,
    left: -4,
    right: -4,
    height: 10,
    backgroundColor: '#CDC4CB',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    zIndex: 2,
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // Gradient approximation: use the primary color
    backgroundColor: '#92288E',
  },
  pctOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  pctText: {
    fontWeight: '800',
    fontSize: 22,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  info: {
    flex: 1,
  },
  infoLabel: {
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 13,
  },
});
