import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Tracks the on-screen keyboard's height in pixels (0 when hidden).
 *
 * Why this exists: with Expo SDK 54 + new architecture + edge-to-edge
 * enabled on Android, `windowSoftInputMode="adjustResize"` no longer
 * shrinks the window — the keyboard floats over content. Screens with a
 * ScrollView need to add this value as `paddingBottom` so the last
 * fields can be scrolled above the keyboard.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
