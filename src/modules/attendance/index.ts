import type { Module } from '../types';
import { EnrollScreen } from './screens/EnrollScreen';
import { GateScreen } from './screens/GateScreen';

/**
 * Attendance module — the face check-in / check-out gate.
 *
 * Phase 1 ships the gate flow behind a stubbed embedder (walkable on the
 * current dev-client). Phase 2 adds the real ONNX embedder + geofence (needs
 * an EAS dev-client rebuild); Phase 3 adds the engine attendance plugin the
 * gate talks to. See core/embedder.ts for the swap seam.
 */
export const attendanceModule: Module = {
  id: 'attendance',
  titleKey: 'attendance',
  subtitleKey: 'attendanceSub',
  glyph: '🪪',
  entryRoute: 'AttendanceGate',
  requiredPermissions: ['attendance.view'],
  screens: [
    { name: 'AttendanceGate', component: GateScreen },
    { name: 'AttendanceEnroll', component: EnrollScreen },
  ],
};
