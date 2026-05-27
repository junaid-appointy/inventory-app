import { palette as steadyPurplePalette } from '../design/tokens';
import type { Theme, ThemeName } from './types';

// The default brand theme. Mirrors the values exported from `design/tokens.ts`
// so any not-yet-migrated component that imports `palette` directly still
// resolves to the same colors as `useTheme()` consumers.
const steadyPurple: Theme = {
  name: 'steadyPurple',
  label: 'Light',
  palette: steadyPurplePalette,
};

// Dark variant — Material 3 tonals generated from the same purple seed.
// Every semantic token maps 1:1 with the light palette so components just
// read `palette.primary` etc. and get the correct value for the mode.
const steadyPurpleDark: Theme = {
  name: 'steadyPurpleDark',
  label: 'Dark',
  palette: {
    ...steadyPurplePalette,
    primary: '#D8A5D6',
    onPrimary: '#510051',
    primaryContainer: '#6B2068',
    onPrimaryContainer: '#F8D9F5',
    secondary: '#D8BDD1',
    onSecondary: '#3C2639',
    secondaryContainer: '#544050',
    onSecondaryContainer: '#F8DAEF',
    tertiary: '#E3BFA0',
    onTertiary: '#42290D',
    tertiaryContainer: '#5C3F20',
    onTertiaryContainer: '#FFDCBE',
    error: '#FFB4AB',
    onError: '#690005',
    errorContainer: '#93000A',
    onErrorContainer: '#FFDAD6',
    warn: '#F5BF4A',
    onWarn: '#3F2E00',
    warnContainer: '#5B4300',
    onWarnContainer: '#FFDF9E',
    background: '#1E1A1D',
    onBackground: '#E9E0E5',
    surface: '#1E1A1D',
    onSurface: '#E9E0E5',
    surfaceDim: '#1E1A1D',
    surfaceBright: '#453F43',
    surfaceContainerLowest: '#19151A',
    surfaceContainerLow: '#272329',
    surfaceContainer: '#2C282D',
    surfaceContainerHigh: '#373237',
    surfaceContainerHighest: '#413D42',
    onSurfaceVariant: '#CFC4CB',
    outline: '#988E96',
    outlineVariant: '#4D444B',
    scrim: 'rgba(0,0,0,0.6)',
  },
};

export const THEMES: Record<ThemeName, Theme> = {
  steadyPurple,
  steadyPurpleDark,
};

export const DEFAULT_THEME: ThemeName = 'steadyPurple';

