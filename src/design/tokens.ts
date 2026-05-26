/**
 * Design tokens. Single source of truth for color, type, spacing, shape,
 * elevation, motion. Material 3 inspired, tuned for a low-literacy field
 * operator on a small Android device. Every component reads from here.
 */

import { Platform, TextStyle } from 'react-native';

/**
 * Default brand palette ("Steady Purple"). Org primary is #92288E.
 *
 * NOTE: This module-level export remains the source of truth for components
 * that haven't migrated to `useTheme()` yet. Once the theme system is wired
 * through everywhere, this can become a re-export of the active theme's
 * palette. For now both code paths resolve to the same colors.
 */
export const palette = {
  primary: '#92288E',
  onPrimary: '#FFFFFF',
  primaryContainer: '#F8D9F5',
  onPrimaryContainer: '#310031',

  secondary: '#6E5868',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#F8DAEF',
  onSecondaryContainer: '#271624',

  tertiary: '#7C5635',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#FFDCBE',
  onTertiaryContainer: '#2C1600',

  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',

  warn: '#7A5900',
  onWarn: '#FFFFFF',
  warnContainer: '#FFDF9E',
  onWarnContainer: '#261A00',

  background: '#FBF7FA',
  onBackground: '#1E1A1D',

  surface: '#FBF7FA',
  onSurface: '#1E1A1D',
  surfaceDim: '#DEDADD',
  surfaceBright: '#FBF7FA',

  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F5EFF3',
  surfaceContainer: '#EFE8EE',
  surfaceContainerHigh: '#E9E2E8',
  surfaceContainerHighest: '#E3DDE2',

  onSurfaceVariant: '#4D444B',
  outline: '#7C747A',
  outlineVariant: '#CDC4CB',

  scrim: 'rgba(0,0,0,0.45)',
} as const;

// Widen string literals so alternate themes can supply any color value
// for the same keys.
export type Palette = { [K in keyof typeof palette]: string };

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

const sysFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
})!;

const sysFontMedium = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default: 'System',
})!;

type TypeVariant = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle['fontWeight'];
  letterSpacing?: number;
};

export const type: Record<
  | 'displayLarge'
  | 'displayMedium'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'titleLarge'
  | 'titleMedium'
  | 'bodyLarge'
  | 'bodyMedium'
  | 'labelLarge'
  | 'labelMedium',
  TypeVariant
> = {
  displayLarge: { fontFamily: sysFont, fontSize: 56, lineHeight: 64, fontWeight: '800', letterSpacing: -0.5 },
  displayMedium: { fontFamily: sysFont, fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: -0.25 },
  headlineLarge: { fontFamily: sysFont, fontSize: 32, lineHeight: 40, fontWeight: '700' },
  headlineMedium: { fontFamily: sysFont, fontSize: 28, lineHeight: 36, fontWeight: '700' },
  headlineSmall: { fontFamily: sysFont, fontSize: 24, lineHeight: 32, fontWeight: '700' },
  titleLarge: { fontFamily: sysFontMedium, fontSize: 22, lineHeight: 28, fontWeight: '600' },
  titleMedium: { fontFamily: sysFontMedium, fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: 0.15 },
  bodyLarge: { fontFamily: sysFont, fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: 0.15 },
  bodyMedium: { fontFamily: sysFont, fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0.25 },
  labelLarge: { fontFamily: sysFontMedium, fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: 0.1 },
  labelMedium: { fontFamily: sysFontMedium, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.5 },
};

export const elevation = {
  level0: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  level1: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  level2: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  level3: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
} as const;

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
