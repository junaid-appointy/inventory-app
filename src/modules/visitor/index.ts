import { DoorOpen } from 'lucide-react-native';
import type { Module } from '../types';
import { ExpectedScreen } from './screens/ExpectedScreen';
import { GateHomeScreen } from './screens/GateHomeScreen';
import { GateScanScreen } from './screens/GateScanScreen';
import { OnSiteScreen } from './screens/OnSiteScreen';
import { PassResultScreen } from './screens/PassResultScreen';
import { StaffInOutScreen } from './screens/StaffInOutScreen';
import { WalkInScreen } from './screens/WalkInScreen';

/**
 * Visitor gate: replaces the web guard portal (visitor-web /guard). Same
 * engine endpoints, so both work side by side until the portal is retired.
 * Each screen is registered only for people whose role allows it.
 */
export const visitorModule: Module = {
  id: 'visitor',
  titleKey: 'moduleVisitor',
  subtitleKey: 'moduleVisitorSub',
  icon: DoorOpen,
  entryRoute: 'GateHome',
  // Any gate job opens the module: a staff-attendance desk with only
  // visitor.staff.mark still gets the Visitors tab, showing just that row.
  requiredPermissions: [
    'visitor.checkin.create',
    'visitor.expected.view',
    'visitor.manual.create',
    'visitor.staff.mark',
    'visitor.dashboard.view',
  ],
  screens: [
    // First screen = where the module opens when it is the only one.
    { name: 'GateHome', component: GateHomeScreen },
    { name: 'GateScan', component: GateScanScreen, options: { animation: 'fade' }, requires: ['visitor.checkin.create'] },
    { name: 'PassResult', component: PassResultScreen, requires: ['visitor.checkin.create'] },
    { name: 'OnSite', component: OnSiteScreen, requires: ['visitor.dashboard.view'] },
    { name: 'WalkIn', component: WalkInScreen, requires: ['visitor.manual.create'] },
    { name: 'Expected', component: ExpectedScreen, requires: ['visitor.expected.view'] },
    { name: 'StaffInOut', component: StaffInOutScreen, requires: ['visitor.staff.mark'] },
  ],
};
