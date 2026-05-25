export type RootStackParamList = {
  Home: undefined;
  Scanner: undefined;
  Receiving: { barcode: string };
  RegisterProduct: { barcode: string };
  Outbox: undefined;
  Orders: undefined;
};
