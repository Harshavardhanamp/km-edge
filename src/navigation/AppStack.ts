// Shared param list for app (authenticated) screens.
// Full navigator wiring happens in Sprint 8 (navigation integration).
export type AppStackParamList = {
  Home: undefined;
  Records: undefined;
  Calendar: undefined;
  Settings: undefined;
  Capture: { recordType?: string; captureKind?: string } | undefined;
  RecordDetail: { edge_id: string };
  StatusDetail: undefined;
};
