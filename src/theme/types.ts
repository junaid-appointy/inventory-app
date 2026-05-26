import type { Palette } from '../design/tokens';

export type ThemeName = 'steadyPurple' | 'bold';

export type Theme = {
  name: ThemeName;
  label: string;
  palette: Palette;
};
