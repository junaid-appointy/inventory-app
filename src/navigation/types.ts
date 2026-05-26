export type DeliverySummaryParams = {
  productName: string;
  qty: number;
  expected: number | null;
  flagged: boolean;
};

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Scanner: undefined;
  Receiving: { barcode: string };
  RegisterProduct: { barcode: string };
  Outbox: undefined;
  Orders: undefined;
  Stock: undefined;
  Issue: { barcode?: string } | undefined;
  Alerts: undefined;
  DeliverySummary: DeliverySummaryParams;
  Settings: undefined;
};
