import type { ReimbursementWorkbook, ValidationIssue } from "../shared/types";

const MONEY_TOLERANCE = 0.01;

function closeEnough(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= MONEY_TOLERANCE;
}

export function validateWorkbook(data: ReimbursementWorkbook): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const warning = (field: string) => issues.push({
    level: "warning",
    field,
    message: "Excel 未提供，插件将保留 OA 当前值",
  });
  if (!data.header.category) warning("报销分类");
  if (data.kind === "travel" && !data.header.travelRequest) warning("出差申请记录");
  if (data.expenses.length === 0) {
    issues.push({ level: "error", field: "报销费用明细", message: "Excel 中没有费用明细" });
    return issues;
  }

  data.expenses.forEach((row, index) => {
    const field = `费用明细第 ${index + 1} 行`;
    if (!row.category) issues.push({ level: "error", field, message: "费用分类为空" });
    if (![row.reimbursementAmount, row.taxAmount, row.expenseAmount].every(Number.isFinite)) {
      issues.push({ level: "error", field, message: "金额或税额不是有效数字" });
    } else if (row.taxAmount < 0 || row.taxAmount > row.reimbursementAmount) {
      issues.push({ level: "error", field, message: "税额必须在 0 和报销金额之间" });
    } else if (!closeEnough(row.expenseAmount, row.reimbursementAmount - row.taxAmount)) {
      issues.push({ level: "error", field, message: "费用金额不等于报销金额减税额" });
    }
  });

  const reimbursementTotal = data.expenses.reduce((sum, row) => sum + row.reimbursementAmount, 0);
  const taxTotal = data.expenses.reduce((sum, row) => sum + row.taxAmount, 0);
  const expenseTotal = data.expenses.reduce((sum, row) => sum + row.expenseAmount, 0);
  const totals: Array<[string, number, number]> = [
    ["报销总金额", data.header.reimbursementTotal, reimbursementTotal],
    ["增值税专票税额合计", data.header.taxTotal, taxTotal],
    ["费用合计", data.header.expenseTotal, expenseTotal],
  ];
  for (const [field, headerValue, detailValue] of totals) {
    if (!closeEnough(headerValue, detailValue)) {
      issues.push({ level: "error", field, message: `表头 ${headerValue} 与明细合计 ${detailValue.toFixed(2)} 不一致` });
    }
  }
  return issues;
}
