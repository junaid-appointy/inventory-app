import { createNavigationContainerRef } from '@react-navigation/native';

/** Lets app-wide pieces outside the screens (the top banner) open a screen. */
export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();
