export type DeliverySummaryItem = {
  name: string;
  category: string | null;
  qty: number;
  /** The amount in words ("2 kg 500 g", "3 packs"); falls back to qty. */
  label?: string;
  /** Its proof photos, for the WhatsApp-style ticks. */
  photoIds?: string[];
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
  /** A proof photo went with this delivery (it posts to the office group). */
  withPhoto?: boolean;
};

/** What a visitor QR may carry besides the token (offline fallback). */
export type VisitorQrMeta = {
  visitorName: string | null;
  purpose: string | null;
  hostName: string | null;
  phone: string | null;
};

export type RootStackParamList = {
  Login: undefined;
  NoAccess: undefined;
  /** Super-app home ("Today"), shown when a person has more than one module. */
  Today: undefined;
  /** App-wide scanner (visitor QR + product barcode) for people who do both. */
  Scan: undefined;
  // ── Visitor gate module ──
  GateHome: undefined;
  GateScan: undefined;
  PassResult: { token: string; meta?: VisitorQrMeta | null };
  OnSite: undefined;
  WalkIn: undefined;
  Expected: undefined;
  StaffInOut: undefined;
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
  /** expandBarcode opens that item's sheet; focusSearch opens the keyboard. */
  Stock: { expandBarcode?: string; focusSearch?: boolean } | undefined;
  EditStock: { barcode: string };
  Dispense: { barcode?: string } | undefined;
  Alerts: undefined;
  DeliverySummary: DeliverySummaryParams;
  Settings: undefined;
};

