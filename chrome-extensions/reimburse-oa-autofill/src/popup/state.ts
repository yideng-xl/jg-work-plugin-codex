import type {
  DetailMode,
  FillResult,
  PageInspection,
  ReimbursementWorkbook,
  ValidationIssue,
} from "../shared/types";

export type PopupStatus = "idle" | "parsed" | "page-inspected" | "filling" | "completed" | "failed";

export interface PopupState {
  status: PopupStatus;
  fileName?: string;
  workbook?: ReimbursementWorkbook;
  issues: ValidationIssue[];
  page?: PageInspection;
  modes: { trips?: DetailMode; expenses?: DetailMode };
  result?: FillResult;
  error?: string;
}

export type PopupAction =
  | { type: "PARSED"; fileName: string; workbook: ReimbursementWorkbook; issues: ValidationIssue[] }
  | { type: "PAGE_INSPECTED"; page: PageInspection }
  | { type: "SET_MODE"; table: "trips" | "expenses"; mode: DetailMode }
  | { type: "FILLING" }
  | { type: "COMPLETED"; result: FillResult }
  | { type: "FAILED"; error: string };

export function initialPopupState(): PopupState {
  return { status: "idle", issues: [], modes: {} };
}

export function transition(state: PopupState, action: PopupAction): PopupState {
  switch (action.type) {
    case "PARSED":
      return {
        status: "parsed",
        fileName: action.fileName,
        workbook: action.workbook,
        issues: action.issues,
        modes: {},
      };
    case "PAGE_INSPECTED":
      return { ...state, status: "page-inspected", page: action.page, modes: {} };
    case "SET_MODE":
      return { ...state, modes: { ...state.modes, [action.table]: action.mode } };
    case "FILLING":
      return { ...state, status: "filling", error: undefined };
    case "COMPLETED":
      return { ...state, status: action.result.ok ? "completed" : "failed", result: action.result };
    case "FAILED":
      return { ...state, status: "failed", error: action.error };
  }
}

export function canFill(state: PopupState): boolean {
  if (state.status !== "page-inspected" || !state.workbook || !state.page?.supported) return false;
  if (state.issues.some((issue) => issue.level === "error")) return false;
  if (state.workbook.kind === "travel" && state.workbook.trips.length > 0 && state.page.tripHasData && !state.modes.trips) return false;
  if (state.workbook.expenses.length > 0 && state.page.expenseHasData && !state.modes.expenses) return false;
  return true;
}

export function resolvedModes(state: PopupState): { trips: DetailMode; expenses: DetailMode } {
  return {
    trips: state.modes.trips ?? "append",
    expenses: state.modes.expenses ?? "append",
  };
}
