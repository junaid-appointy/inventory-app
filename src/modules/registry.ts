import { inventoryModule } from './inventory';
import type { Module } from './types';

/**
 * Ordered list of installed modules. Add new modules (attendance, daily
 * tasks, maintenance, …) by importing them here. Home filters by RBAC.
 */
export const MODULES: Module[] = [inventoryModule];

export function getAllScreens() {
  return MODULES.flatMap((m) => m.screens);
}
