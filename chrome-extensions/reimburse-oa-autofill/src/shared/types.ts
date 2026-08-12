export type ReimbursementKind = "travel" | "general";
export type DetailMode = "overwrite" | "append" | "cancel";

export interface PageInspection {
  supported: boolean;
  reason?: string;
  kind?: ReimbursementKind;
  requestNumber?: string;
  readonlyFields: Record<string, string>;
  tripHasData: boolean;
  expenseHasData: boolean;
}

export interface FillModes {
  trips: DetailMode;
  expenses: DetailMode;
}

export interface FieldResult {
  field: string;
  status: "filled" | "verified" | "skipped" | "error";
  message?: string;
}

export interface FillResult {
  ok: boolean;
  fields: FieldResult[];
  totals: { excel: number[]; oa: number[]; match: boolean };
}

export type ExtensionMessage =
  | { type: "INSPECT_PAGE" }
  | { type: "FILL_PAGE"; workbook: ReimbursementWorkbook; modes: FillModes };

export interface HeaderData {
  title?: string;
  applicant?: string;
  fillDate?: string;
  area?: string;
  department?: string;
  kind: ReimbursementKind;
  region?: string;
  category?: string;
  contract?: string;
  reason?: string;
  travelDays?: number;
  workDays?: number;
  travelRequest?: string;
  paymentDate?: string;
  expenseTotal: number;
  taxTotal: number;
  reimbursementTotal: number;
}

export interface TripRow {
  departureDate: string;
  departureTime: string;
  from: string;
  arrivalDate: string;
  arrivalTime: string;
  to: string;
  lodgingDays: number;
}

export interface ExpenseRow {
  category: string;
  tripRefs?: string;
  incurredDate?: string;
  reimbursementAmount: number;
  taxAmount: number;
  expenseAmount: number;
  note?: string;
}

export interface ReimbursementWorkbook {
  kind: ReimbursementKind;
  header: HeaderData;
  trips: TripRow[];
  expenses: ExpenseRow[];
}

export interface ValidationIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}
