import type { Palette } from '../design/tokens';

export type ThemeName = 'steadyPurple' | 'steadyPurpleDark';

export type Theme = {
  name: ThemeName;
  label: string;
  palette: Palette;
};
