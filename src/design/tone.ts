import type { Palette } from './tokens';

/**
 * One vocabulary of meaning-colours for chips, icon badges and stat cells.
 * Always a tinted container + its on-colour (Material 3 tonal pairs), never
 * a raw hex, so dark mode comes for free.
 */
export type Tone = 'primary' | 'success' | 'warn' | 'danger' | 'neutral' | 'info';

export function toneColors(palette: Palette, tone: Tone): { bg: string; fg: string } {
  switch (tone) {
    case 'primary':
      return { bg: palette.primaryContainer, fg: palette.onPrimaryContainer };
    case 'success':
      return { bg: palette.successContainer, fg: palette.onSuccessContainer };
    case 'warn':
      return { bg: palette.warnContainer, fg: palette.onWarnContainer };
    case 'danger':
      return { bg: palette.errorContainer, fg: palette.onErrorContainer };
    case 'info':
      return { bg: palette.secondaryContainer, fg: palette.onSecondaryContainer };
    default:
      return { bg: palette.surfaceContainerHigh, fg: palette.onSurfaceVariant };
  }
}
