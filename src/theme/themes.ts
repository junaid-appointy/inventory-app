import { palette as steadyPurplePalette } from '../design/tokens';
import type { Theme, ThemeName } from './types';

// The default brand theme. Mirrors the values exported from `design/tokens.ts`
// so any not-yet-migrated component that imports `palette` directly still
// resolves to the same colors as `useTheme()` consumers.
const steadyPurple: Theme = {
  name: 'steadyPurple',
  label: 'Steady',
  palette: steadyPurplePalette,
};

// Placeholder for the design's "Bold" variant — chunky/expressive variant
// from the design bundle. The shape matches Steady; values are tuned for
// later (see design/tokens.jsx in the handoff bundle). Kept here so the
// ThemeProvider machinery has a real second theme to switch to once the
// remaining components fully consume `useTheme()`.
const bold: Theme = {
  name: 'bold',
  label: 'Bold',
  palette: {
    ...steadyPurplePalette,
    background: '#FBF8F1',
    surface: '#FFFFFF',
    surfaceContainerLow: '#FDFAF2',
    surfaceContainer: '#F1EDE2',
    onSurfaceVariant: '#5A4F33',
    outlineVariant: '#15110A',
  },
};

export const THEMES: Record<ThemeName, Theme> = {
  steadyPurple,
  bold,
};

export const DEFAULT_THEME: ThemeName = 'steadyPurple';
