import type { LucideIcon } from 'lucide-react-native';
import type { StringKey } from '../i18n';
import type { Permission } from '../rbac';

/**
 * A Module is a self-contained feature area (inventory, attendance,
 * maintenance, …). Each module declares its home-screen tile, the route it
 * lands on, the navigator screens it owns, and the permissions a user must
 * hold to see and enter it.
 *
 * Modules live under `src/modules/<id>/` with a single `index.ts` exporting
 * the Module object. Add a new module by importing it into the registry.
 */
export type ModuleId = 'inventory' | 'visitor' | 'attendance' | 'dailyTasks' | 'maintenance';

export type ModuleScreen = {
  /** Route name as it appears in the navigator. */
  name: string;
  /** React component for the screen. Typed loose to avoid leaking
   * RootStackParamList details into the registry. */
  component: React.ComponentType<any>;
  /** Override default screen options for this route. */
  options?: Record<string, unknown>;
  /**
   * Who may open this screen: any one of these permissions. Omitted = anyone
   * who can see the module. Screens a person may not use are not registered
   * at all, so nothing (a stale button, a deep link) can open them.
   */
  requires?: Permission[];
};

export type Module = {
  id: ModuleId;
  /** i18n key for the module's display name. */
  titleKey: StringKey;
  /** i18n key for the home-tile subtitle. */
  subtitleKey?: StringKey;
  /** Lucide icon for the launcher tile (house rule: no emoji in chrome). */
  icon: LucideIcon;
  /** Route the home tile navigates to. */
  entryRoute: string;
  /** Holding any one of these shows the module (its tab, its home). */
  requiredPermissions: Permission[];
  /** Screens this module contributes to the root navigator. */
  screens: ModuleScreen[];
};
