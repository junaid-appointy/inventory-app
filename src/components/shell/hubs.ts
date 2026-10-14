import { Home, MoreHorizontal, Package, Users, type LucideIcon } from 'lucide-react-native';
import { useCan } from '../../auth';
import type { StringKey } from '../../i18n/strings';
import { getVisibleModules } from '../../modules';

/** A top-level screen reachable from the bottom bar. */
export type HubRoute = 'Today' | 'Home' | 'GateHome' | 'Settings';
export type Hub = { route: HubRoute; labelKey: StringKey; Icon: LucideIcon };

const MODULE_HUB: Record<string, Hub> = {
  inventory: { route: 'Home', labelKey: 'tabInventory', Icon: Package },
  visitor: { route: 'GateHome', labelKey: 'tabVisitors', Icon: Users },
};

/**
 * The bottom bar for this person, from their roles: Today (only when there
 * is more than one module), one tab per module, More. The centre Scan button
 * opens whichever scanner they may use: both codes when they can do both.
 */
export function useHubs(): { hubs: Hub[]; scanRoute: 'Scan' | 'GateScan' | 'Scanner' | null } {
  const can = useCan();
  const modules = getVisibleModules(can);
  const hubs: Hub[] = [];
  if (modules.length > 1) hubs.push({ route: 'Today', labelKey: 'tabToday', Icon: Home });
  for (const m of modules) {
    const hub = MODULE_HUB[m.id];
    if (hub) hubs.push(hub);
  }
  hubs.push({ route: 'Settings', labelKey: 'tabMore', Icon: MoreHorizontal });

  const ids = new Set(modules.map((m) => m.id));
  const canPass = ids.has('visitor') && can('visitor.checkin.create');
  const canItem = ids.has('inventory') && can('inventory.receive');
  const scanRoute = canPass && canItem ? 'Scan' : canPass ? 'GateScan' : canItem ? 'Scanner' : null;
  return { hubs, scanRoute };
}
