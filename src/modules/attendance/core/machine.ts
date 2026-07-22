/**
 * Gate state machine — the brain of the attendance gate, adapted for React
 * Native from the tablet PWA. Pure reducer: no camera, timers, or I/O here.
 * The screen owns the camera/vision-camera lifecycle and dispatches actions;
 * this file only owns the legal transitions.
 *
 * State machine, not ad-hoc booleans — add states/transitions here rather
 * than scattering flags across the screen (mirrors the PWA rule).
 *
 * Server is source of truth: on `result` we accept whatever the engine (or,
 * offline, the local fallback) resolved. Nothing here decides identity.
 */

import type { GateOutcome, PunchDirection } from './types';

export type GateState =
  | { kind: 'boot' }
  | { kind: 'idle'; gallerySize: number }
  | { kind: 'capturing' } // camera warming + framing the face
  | { kind: 'matching'; mode: 'server' | 'local' }
  | { kind: 'challenging'; eventId: string; poses: string[]; poseIndex: number }
  | {
      kind: 'result';
      outcome: GateOutcome;
      staffName: string | null;
      direction: PunchDirection | null;
      offline: boolean;
    }
  | { kind: 'error'; message: string };

export type GateAction =
  | { type: 'boot_complete'; gallerySize: number }
  | { type: 'tap' }
  | { type: 'frame_locked'; mode: 'server' | 'local' }
  | {
      type: 'result';
      outcome: GateOutcome;
      staffName: string | null;
      direction: PunchDirection | null;
      offline: boolean;
    }
  | { type: 'challenge_required'; eventId: string; poses: string[] }
  | { type: 'challenge_advance' }
  | { type: 'back_to_idle'; gallerySize: number }
  | { type: 'error'; message: string };

export const INITIAL_GATE_STATE: GateState = { kind: 'boot' };

export function gateReducer(state: GateState, action: GateAction): GateState {
  switch (action.type) {
    case 'boot_complete':
      return { kind: 'idle', gallerySize: action.gallerySize };

    case 'tap':
      return state.kind === 'idle' ? { kind: 'capturing' } : state;

    case 'frame_locked':
      return state.kind === 'capturing'
        ? { kind: 'matching', mode: action.mode }
        : state;

    case 'challenge_required':
      // Reachable from matching only.
      if (state.kind !== 'matching') return state;
      return {
        kind: 'challenging',
        eventId: action.eventId,
        poses: action.poses,
        poseIndex: 0,
      };

    case 'challenge_advance':
      if (state.kind !== 'challenging') return state;
      return { ...state, poseIndex: state.poseIndex + 1 };

    case 'result':
      return {
        kind: 'result',
        outcome: action.outcome,
        staffName: action.staffName,
        direction: action.direction,
        offline: action.offline,
      };

    case 'back_to_idle':
      return { kind: 'idle', gallerySize: action.gallerySize };

    case 'error':
      return { kind: 'error', message: action.message };

    default:
      return state;
  }
}

/** How long a result card lingers before the gate returns to idle (ms). */
export const RESULT_LINGER_MS = 2600;
