import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { toneColors, type Tone } from './tone';

/** A Lucide icon on a soft rounded square. Neutral by default; tone only when it means something. */
export function IconBadge({ Icon, tone = 'neutral', size = 44 }: { Icon: LucideIcon; tone?: Tone; size?: number }) {
  const { palette } = useTheme();
  const c = tone === 'neutral' ? { bg: palette.surfaceContainer, fg: palette.onSurfaceVariant } : toneColors(palette, tone);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: c.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={Math.round(size * 0.5)} color={c.fg} strokeWidth={2} />
    </View>
  );
}
