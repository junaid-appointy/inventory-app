import { User } from 'lucide-react-native';
import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { config } from '../config';
import { Text } from '../design';
import { useTheme } from '../theme';

/** Uploaded photos come back as a path on the engine; Google photos are full URLs. */
export function staffPhotoUri(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${config.apiBaseUrl}${url}` : url;
}

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/**
 * A staff member's round photo, or their initials when there is none or it
 * cannot load (offline, removed). Photos are small and cached by the phone
 * after the first look.
 */
export function StaffAvatar({ name, photoUrl, size = 40 }: { name: string; photoUrl?: string | null; size?: number }) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = staffPhotoUri(photoUrl);
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (!uri || failed) {
    return (
      <View style={[styles.center, round, { backgroundColor: palette.primaryContainer }]} accessibilityLabel={name}>
        <Text style={{ fontSize: Math.round(size * 0.38), fontWeight: '700', color: palette.onPrimaryContainer }}>{initialsOf(name)}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[round, { backgroundColor: palette.surfaceContainerHigh }]}
      onError={() => setFailed(true)}
      accessibilityLabel={name}
    />
  );
}

/**
 * A visitor with the photo of the person they came to see pinned to the
 * corner, so a guard sees "who is this for" without reading.
 */
export function VisitorWithHost({ hostName, hostPhotoUrl, size = 44 }: { hostName?: string | null; hostPhotoUrl?: string | null; size?: number }) {
  const { palette } = useTheme();
  const host = Math.round(size * 0.55);
  return (
    <View style={{ width: size + host * 0.25, height: size + host * 0.25 }}>
      <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.surfaceContainerHigh }]}>
        <User size={Math.round(size * 0.5)} color={palette.onSurfaceVariant} />
      </View>
      {hostName ? (
        <View style={[styles.hostBadge, { borderColor: palette.surface, borderRadius: (host + 4) / 2 }]}>
          <StaffAvatar name={hostName} photoUrl={hostPhotoUrl} size={host} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  hostBadge: { position: 'absolute', right: 0, bottom: 0, borderWidth: 2 },
});
