import type { Permission } from '../rbac';
import { inventoryModule } from './inventory';
import { visitorModule } from './visitor';
import type { Module } from './types';

/**
 * Ordered list of installed modules. Add new modules (attendance, daily
 * tasks, maintenance, …) by importing them here. RootNavigator filters by RBAC.
 */
export const MODULES: Module[] = [inventoryModule, visitorModule];

/** Modules this person may open. Hiding a tile is not access control; the
 *  server enforces. This only keeps the app from offering dead ends. */
export function getVisibleModules(can: (permission: Permission) => boolean): Module[] {
  return MODULES.filter((m) => m.requiredPermissions.some((p) => can(p)));
}

/** The screens of a module this person may open (see ModuleScreen.requires). */
export function getAllowedScreens(m: Module, can: (permission: Permission) => boolean): Module['screens'] {
  return m.screens.filter((s) => !s.requires || s.requires.some((p) => can(p)));
}
