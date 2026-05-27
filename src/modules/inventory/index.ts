import type { Module } from '../types';
import { AlertsScreen } from './screens/AlertsScreen';
import { DeliverySummaryScreen } from './screens/DeliverySummaryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { DispenseScreen } from './screens/DispenseScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { OrderSessionScreen } from './screens/OrderSessionScreen';
import { OutboxScreen } from './screens/OutboxScreen';
import { ReceivingScreen } from './screens/ReceivingScreen';
import { RegisterProductScreen } from './screens/RegisterProductScreen';
import { ScannerScreen } from './screens/ScannerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StockScreen } from './screens/StockScreen';

export const inventoryModule: Module = {
  id: 'inventory',
  titleKey: 'receiving',
  subtitleKey: 'receivingSub',
  glyph: '📦',
  entryRoute: 'Home',
  requiredPermissions: ['inventory.view'],
  screens: [
    { name: 'Home', component: HomeScreen },
    { name: 'Scanner', component: ScannerScreen, options: { animation: 'fade' } },
    { name: 'Receiving', component: ReceivingScreen },
    { name: 'RegisterProduct', component: RegisterProductScreen },
    { name: 'OrderSession', component: OrderSessionScreen },
    { name: 'DeliverySummary', component: DeliverySummaryScreen },
    { name: 'Outbox', component: OutboxScreen },
    { name: 'Orders', component: OrdersScreen },
    { name: 'Stock', component: StockScreen },
    { name: 'Dispense', component: DispenseScreen },
    { name: 'Alerts', component: AlertsScreen },
    { name: 'Settings', component: SettingsScreen },
  ],
};

