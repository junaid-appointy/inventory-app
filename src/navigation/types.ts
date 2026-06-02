export type DeliverySummaryItem = {
  name: string;
  category: string | null;
  qty: number;
};

export type DeliverySummaryParams = {
  /** For multi-item orders submitted via OrderSession */
  items: DeliverySummaryItem[];
  totalItems: number;
  totalQty: number;
  /** Legacy single-item fields — kept for backward compat */
  productName?: string;
  qty?: number;
  expected?: number | null;
  flagged?: boolean;
};

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Scanner: undefined;
  Receiving: {
    barcode: string;
    /** When set, this receiving session is for a canonical product (not barcode-primary) */
    productId?: string;
    productName?: string;
    unit?: string;
    packSize?: number;
  };
  RegisterProduct: { barcode: string };
  CatalogPicker: { barcode?: string } | undefined;
  OrderSession: undefined;
  Outbox: undefined;
  Orders: undefined;
  Stock: undefined;
  Dispense: { barcode?: string } | undefined;
  Alerts: undefined;
  DeliverySummary: DeliverySummaryParams;
  Settings: undefined;
};

