/**
 * Shelf-count maths for Correct count, kept pure so it can be tested.
 *
 * Stock is stored as lots (one per expiry date) in packs, possibly with a
 * fraction: 1.46 bags = one full bag + an open bag with 2 kg 300 g. People
 * count full packs per date and the one open pack in small units; these
 * two functions convert between the two views without losing a date.
 */
export type Lot = { expiry: string | null; qty: number };
export type FullRow = { expiry: string | null | undefined; qty: number };

const EPS = 1e-9;

/**
 * openExpiry: the date of the batch the open pack belongs to; `undefined`
 * when no open pack was stored (so a newly entered one goes with the
 * oldest batch, which is the one used first).
 */
export function splitLots(
  lots: Lot[],
  perPack: number,
  countsOpen: boolean,
): { full: FullRow[]; openSmall: number; openExpiry: string | null | undefined } {
  let frac = 0;
  let openExpiry: string | null | undefined;
  const full: FullRow[] = lots.map((l) => {
    const whole = countsOpen ? Math.floor(l.qty + EPS) : Math.round(l.qty);
    const part = countsOpen ? l.qty - whole : 0;
    if (part > EPS) {
      frac += part;
      // Several part-packs (rare): keep the oldest date for the open one.
      if (openExpiry === undefined || (l.expiry !== null && (openExpiry === null || l.expiry < openExpiry))) {
        openExpiry = l.expiry;
      }
    }
    return { expiry: l.expiry, qty: whole };
  });
  const kept = full.filter((b) => b.qty > 0);
  return {
    full: kept.length > 0 ? kept : [{ expiry: lots[0]?.expiry ?? null, qty: 0 }],
    openSmall: Math.round(frac * perPack),
    openExpiry,
  };
}

export function joinLots(full: FullRow[], openSmall: number, openExpiry: string | null | undefined, perPack: number): Lot[] {
  const lots: Lot[] = full.filter((b) => b.qty > 0).map((b) => ({ expiry: b.expiry ?? null, qty: b.qty }));
  if (openSmall <= 0) return lots;
  const openPacks = openSmall / perPack;
  if (openExpiry !== undefined) {
    // The open pack keeps its own date, even if no full pack shares it.
    const same = lots.find((l) => l.expiry === openExpiry);
    if (same) same.qty += openPacks;
    else lots.push({ expiry: openExpiry, qty: openPacks });
    return lots;
  }
  // A newly counted open pack goes with the oldest batch (used first).
  const oldest = [...lots].sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999'))[0];
  if (oldest) oldest.qty += openPacks;
  else lots.push({ expiry: null, qty: openPacks });
  return lots;
}

export function lotsKey(lots: Lot[]): string {
  return lots
    .filter((l) => l.qty > EPS)
    .map((l) => `${l.expiry ?? ''}@${Math.round(l.qty * 1e6)}`)
    .sort()
    .join('|');
}

/**
 * The shelf as people see it, in small units (pieces, grams, ml): some
 * closed packs and at most one open pack. Taking works like real life:
 * closed packs are picked up whole, loose amounts come from the open pack
 * first and only then is a new pack opened.
 *
 *   total 29 pens, packs of 12, take 7 loose →
 *   open 5 (all taken), one new pack opened (2 taken), 1 closed left.
 */
export type TakePlan = {
  /** What is in the open pack now (0 = no open pack). */
  open: number;
  /** Closed packs on the shelf now. */
  sealed: number;
  /** Loose amount coming out of the open pack. */
  fromOpen: number;
  /** Packs that get opened for the rest, with how much is taken from each. */
  opened: number[];
  /** Closed packs still closed afterwards. */
  sealedLeft: number;
  /** False when the shelf does not hold that much. */
  ok: boolean;
};

export function takePlan(totalSmall: number, perPack: number, closed: number, loose: number): TakePlan {
  const total = Math.max(0, Math.round(totalSmall));
  const per = Math.max(1, Math.round(perPack));
  const open = total % per;
  const sealed = Math.floor(total / per);
  const fromOpen = Math.min(loose, open);
  let rest = loose - fromOpen;
  let sealedLeft = sealed - closed;
  const opened: number[] = [];
  while (rest > 0 && sealedLeft > 0) {
    const take = Math.min(per, rest);
    opened.push(take);
    rest -= take;
    sealedLeft -= 1;
  }
  return { open, sealed, fromOpen, opened, sealedLeft: Math.max(0, sealedLeft), ok: rest === 0 && closed <= sealed };
}

/**
 * Which dated batch each part of a take comes from, in packs, matching
 * takePlan: loose first from the batch that holds the open pack, then
 * closed packs oldest first, then any newly opened pack from the oldest
 * batch left. `lots` must be in use-first order (oldest expiry first).
 */
export function allocateTake(
  lots: { available: number }[],
  perPack: number,
  closed: number,
  loose: number,
): number[] {
  const per = Math.max(1, Math.round(perPack));
  const avail = lots.map((l) => Math.max(0, Math.round(l.available * per)));
  const whole = avail.map((a) => Math.floor(a / per));
  const frac = avail.map((a, i) => a - whole[i] * per);
  const take = lots.map(() => 0);

  let rest = loose;
  for (let i = 0; i < lots.length && rest > 0; i++) {
    const t = Math.min(rest, frac[i]);
    take[i] += t;
    rest -= t;
  }
  let closedRest = closed;
  for (let i = 0; i < lots.length && closedRest > 0; i++) {
    const t = Math.min(closedRest, whole[i]);
    take[i] += t * per;
    whole[i] -= t;
    closedRest -= t;
  }
  for (let i = 0; i < lots.length && rest > 0; i++) {
    const t = Math.min(rest, whole[i] * per);
    take[i] += t;
    rest -= t;
  }
  return take.map((s) => s / per);
}
