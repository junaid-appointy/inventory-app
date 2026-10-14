import { Package } from 'lucide-react-native';
import type { Module } from '../types';
import { AlertsScreen } from './screens/AlertsScreen';
import { CatalogPickerScreen } from './screens/CatalogPickerScreen';
import { DeliverySummaryScreen } from './screens/DeliverySummaryScreen';
import { HomeScreen } from './screens/HomeScreen';
import { DispenseScreen } from './screens/DispenseScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { OrderSessionScreen } from './screens/OrderSessionScreen';
import { ReceivingScreen } from './screens/ReceivingScreen';
import { RegisterProductScreen } from './screens/RegisterProductScreen';
import { ScannerScreen } from './screens/ScannerScreen';
import { StockScreen } from './screens/StockScreen';
import { EditStockScreen } from './screens/EditStockScreen';

export const inventoryModule: Module = {
  id: 'inventory',
  titleKey: 'moduleInventory',
  subtitleKey: 'moduleInventorySub',
  icon: Package,
  entryRoute: 'Home',
  requiredPermissions: ['inventory.view'],
  screens: [
    { name: 'Home', component: HomeScreen },
    { name: 'Scanner', component: ScannerScreen, options: { animation: 'fade' }, requires: ['inventory.receive'] },
    { name: 'Receiving', component: ReceivingScreen, requires: ['inventory.receive'] },
    { name: 'RegisterProduct', component: RegisterProductScreen, requires: ['inventory.receive'] },
    { name: 'CatalogPicker', component: CatalogPickerScreen, requires: ['inventory.receive'] },
    { name: 'OrderSession', component: OrderSessionScreen, requires: ['inventory.receive'] },
    { name: 'DeliverySummary', component: DeliverySummaryScreen, requires: ['inventory.receive'] },
    { name: 'Orders', component: OrdersScreen, requires: ['inventory.receive'] },
    { name: 'Stock', component: StockScreen },
    { name: 'EditStock', component: EditStockScreen, requires: ['inventory.adjust'] },
    { name: 'Dispense', component: DispenseScreen, requires: ['inventory.issue'] },
    { name: 'Alerts', component: AlertsScreen },
  ],
};

